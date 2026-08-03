import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  type TestDatabase,
} from './support/test-database';

/**
 * `POST /api/v1/auth/register` ve `/login` — uctan uca.
 *
 * Uygulamanin TAMAMI ayaga kalkar: IdentityModule app.module.ts'e bagli ve tum
 * saglayicilar (repo'lar, Argon2, HMAC, EdDSA imzalayici, outbox) cozuluyor.
 * Bu testin ilk degeri wiring'in gercekten calistigini kanitlamasidir — bir DI
 * veya anahtar ithal hatasi ancak uygulama acilirken ortaya cikar.
 *
 * Ikinci degeri: gizlilik davranislarini SABITLEMESI. "Kayitli e-posta ayni
 * yaniti verir" ve "kilit/yanlis parola ayni 401" kurallari, birinin
 * "hata mesajini netlestirelim" demesiyle sessizce kaybolabilir.
 */
type NodeHttpServer = Server;

function isHttpServer(value: unknown): value is NodeHttpServer {
  return value instanceof Server;
}

function httpServer(app: INestApplication): NodeHttpServer {
  const server: unknown = app.getHttpServer();
  if (!isHttpServer(server)) {
    throw new TypeError('Beklenen node:http Server ornegi alinamadi.');
  }
  return server;
}

const EMAIL = 'user@example.com';
const PASSWORD = 'parola123';

describe('auth uc noktalari (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.container.getConnectionUri();
    await setIdentityTestEnv();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();

    // main.ts ile AYNI kurulum.
    app.use(correlationIdMiddleware);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new ProblemDetailsFilter());

    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  beforeEach(async () => {
    await truncateIdentityTables(database.ownerPool);
  });

  function register(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/register').send(body);
  }

  function login(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/login').send(body);
  }

  function verifyEmail(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/verify-email').send(body);
  }

  /**
   * Giris testleri icin durumu DOGRUDAN kurar.
   *
   * Gercek dogrulama akisi asagida ayri bir blokta uctan uca test edilir; giris
   * testlerinin onu kullanmasi, bir slice'in hatasini digerine tasirdi.
   */
  async function markVerified(email: string): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
  }

  /**
   * Kayit sirasinda uretilen HAM kodu outbox'tan okur.
   *
   * Kod veritabaninda yalnizca HMAC olarak durur; ham hali teslimat icin
   * `user.registered` event payload'indadir (§8). Test de gercek istemcinin
   * e-postayla aldigi seyi okur.
   */
  async function issuedCode(email: string): Promise<string> {
    const rows = await database.ownerPool.query<{ code: string }>(
      "SELECT payload->>'verificationCode' AS code FROM platform.identity_outbox " +
        "WHERE event_type = 'user.registered' AND payload->>'email' = $1",
      [email],
    );

    const code = rows.rows[0]?.code;
    if (code === undefined) {
      throw new Error(`Dogrulama kodu bulunamadi: ${email}`);
    }
    return code;
  }

  async function attemptCount(): Promise<number> {
    const rows = await database.ownerPool.query<{ attempt_count: number }>(
      'SELECT attempt_count FROM platform.email_verification_codes',
    );
    return rows.rows[0]?.attempt_count ?? -1;
  }

  it('uygulama IdentityModule ile ayaga kalkar', () => {
    // DI grafigi cozuldu: EdDSA anahtarlari ithal edildi, pepper baglandi.
    expect(app).toBeDefined();
  });

  // --- Kayit ---------------------------------------------------------------

  it('gecerli kayda 202 doner ve kullaniciyi bekleyen olarak yazar', async () => {
    const response = await register({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(202);

    const rows = await database.ownerPool.query<{ status: string; email_verified: boolean }>(
      'SELECT status, email_verified FROM platform.users WHERE email = $1',
      [EMAIL],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.status).toBe('pending');
    expect(rows.rows[0]?.email_verified).toBe(false);
  });

  it('kayitla birlikte credential, kod ve outbox event i yazar', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const credentials = await database.ownerPool.query('SELECT 1 FROM platform.credentials');
    const codes = await database.ownerPool.query('SELECT 1 FROM platform.email_verification_codes');
    const events = await database.ownerPool.query<{ event_type: string }>(
      'SELECT event_type FROM platform.identity_outbox',
    );

    expect(credentials.rowCount).toBe(1);
    expect(codes.rowCount).toBe(1);
    expect(events.rows[0]?.event_type).toBe('user.registered');
  });

  it('AYNI e-postayi ikinci kez kaydederken de 202 doner ama yeni kullanici olusturmaz', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    const second = await register({ email: EMAIL, password: 'baskaparola9' });

    // Yanit AYNI — hesap varlik oracle'i yok (P2).
    expect(second.status).toBe(202);

    const rows = await database.ownerPool.query('SELECT 1 FROM platform.users WHERE email = $1', [
      EMAIL,
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('parola politikasi ihlaline 422 doner', async () => {
    const response = await register({ email: EMAIL, password: 'kisa' });

    expect(response.status).toBe(422);
  });

  it('gecersiz e-posta bicimine 422 doner', async () => {
    const response = await register({ email: 'gecersiz', password: PASSWORD });

    expect(response.status).toBe(422);
  });

  it('tanimsiz alan gonderilirse 422 doner (strict govde)', async () => {
    const response = await register({ email: EMAIL, password: PASSWORD, role: 'admin' });

    expect(response.status).toBe(422);
  });

  // --- Giris ---------------------------------------------------------------

  it('dogrulanmamis kullanici icin 403 doner (ayirt edilebilir)', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const response = await login({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
  });

  it('dogrulanmis kullaniciya kimlik token i (govde) ve refresh cookie si doner', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await markVerified(EMAIL);

    const response = await login({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.identityToken).toBe('string');
    // Kimlik token'i bir JWT'dir (uc parca).
    expect(String(response.body.identityToken).split('.')).toHaveLength(3);

    // Refresh token GOVDEDE DONMEZ; HttpOnly cookie ile gelir (ADR-0026).
    expect(response.body.refreshToken).toBeUndefined();

    const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
    const refreshCookie = (setCookie ?? []).find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    // Savunmanin ozu bu ozniteliklerde: JS okuyamaz, cross-site gonderilmez,
    // yalnizca auth uclarina tasinir.
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
  });

  it('girisle birlikte oturumu (aile + refresh token) yazar', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await markVerified(EMAIL);

    await login({ email: EMAIL, password: PASSWORD });

    const families = await database.ownerPool.query('SELECT 1 FROM platform.token_families');
    const tokens = await database.ownerPool.query<{ token_hash: string }>(
      'SELECT token_hash FROM platform.refresh_tokens',
    );

    expect(families.rowCount).toBe(1);
    // Veritabaninda HASH durur, ham token DEGIL.
    expect(tokens.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('yanlis parolaya 401 doner ve basarisiz denemeyi KALICI kaydeder', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await markVerified(EMAIL);

    const response = await login({ email: EMAIL, password: 'yanlisparola1' });

    expect(response.status).toBe(401);

    // Kritik: hata dondugu halde deneme kaydi COMMIT olmus olmali, aksi halde
    // kaba kuvvet sayaci hic artmaz (ADR-0022).
    const attempts = await database.ownerPool.query<{ succeeded: boolean }>(
      'SELECT succeeded FROM platform.login_attempts',
    );
    expect(attempts.rowCount).toBe(1);
    expect(attempts.rows[0]?.succeeded).toBe(false);
  });

  it('bilinmeyen e-postaya da AYNI 401 doner (hesap varligi sizmaz)', async () => {
    const response = await login({ email: 'yok@example.com', password: PASSWORD });

    expect(response.status).toBe(401);
  });

  // --- E-posta dogrulama ---------------------------------------------------

  it('dogru kodla 200 doner ve kullaniciyi aktif eder', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const response = await verifyEmail({ email: EMAIL, code: await issuedCode(EMAIL) });

    expect(response.status).toBe(200);

    const rows = await database.ownerPool.query<{ status: string; email_verified: boolean }>(
      'SELECT status, email_verified FROM platform.users WHERE email = $1',
      [EMAIL],
    );
    expect(rows.rows[0]?.status).toBe('active');
    expect(rows.rows[0]?.email_verified).toBe(true);
  });

  it('dogrulamayla birlikte kodu tuketir ve outbox event i yazar', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await verifyEmail({ email: EMAIL, code: await issuedCode(EMAIL) });

    const codes = await database.ownerPool.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM platform.email_verification_codes',
    );
    const events = await database.ownerPool.query<{ event_type: string }>(
      'SELECT event_type FROM platform.identity_outbox ORDER BY occurred_at',
    );

    expect(codes.rows[0]?.consumed_at).not.toBeNull();
    expect(events.rows.map((row) => row.event_type)).toEqual([
      'user.registered',
      'user.email_verified',
    ]);
  });

  it('YANLIS koda 400 doner ve deneme sayacini KALICI artirir', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const response = await verifyEmail({ email: EMAIL, code: '000000' });

    expect(response.status).toBe(400);
    // Kritik: hata dondugu halde artis COMMIT olmus olmali. Geri alinsaydi
    // 5 denemelik sinir hicbir zaman dolmaz (ADR-0019 §7.3).
    expect(await attemptCount()).toBe(1);
  });

  it('5 yanlis denemeden sonra DOGRU kodu da reddeder', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    const code = await issuedCode(EMAIL);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verifyEmail({ email: EMAIL, code: '000000' });
    }

    const response = await verifyEmail({ email: EMAIL, code });

    expect(response.status).toBe(400);
    expect(await attemptCount()).toBe(5);
  });

  it('ZATEN dogrulanmis hesabi tekrar dogrulamaz (idempotent basari yok)', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    const code = await issuedCode(EMAIL);
    await verifyEmail({ email: EMAIL, code });

    const second = await verifyEmail({ email: EMAIL, code });

    expect(second.status).toBe(400);
  });

  it('bilinmeyen e-postaya da AYNI 400 doner', async () => {
    const response = await verifyEmail({ email: 'yok@example.com', code: '123456' });

    expect(response.status).toBe(400);
  });

  it('tum redler AYNI govdeyi uretir (sebep sizmaz)', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const wrongCode = await verifyEmail({ email: EMAIL, code: '000000' });
    const unknownEmail = await verifyEmail({ email: 'yok@example.com', code: '000000' });

    expect(unknownEmail.body).toMatchObject({ title: wrongCode.body.title, status: 400 });
    expect(wrongCode.headers['content-type']).toContain('application/problem+json');
  });

  it('6 haneli olmayan koda 422 doner ve deneme HARCAMAZ', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const response = await verifyEmail({ email: EMAIL, code: 'abc' });

    expect(response.status).toBe(422);
    // Bicimsiz girdi bir tahmin degildir; sayaca dokunulmaz.
    expect(await attemptCount()).toBe(0);
  });

  it('dogrulamadan SONRA giris calisir (kayit -> dogrula -> giris zinciri)', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await verifyEmail({ email: EMAIL, code: await issuedCode(EMAIL) });

    const response = await login({ email: EMAIL, password: PASSWORD });

    // Ayni kullanici dogrulamadan once 403 aliyordu; zincir kapandi.
    expect(response.status).toBe(200);
    expect(typeof response.body.identityToken).toBe('string');
  });
});
