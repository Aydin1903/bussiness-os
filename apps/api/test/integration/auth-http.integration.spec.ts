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
import { startTestDatabase, truncateIdentityTables, type TestDatabase } from './support/test-database';

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

  /** Dogrulama akisi henuz yok; durumu dogrudan kurar (verify-email ayri slice). */
  async function markVerified(email: string): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
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
    const codes = await database.ownerPool.query(
      'SELECT 1 FROM platform.email_verification_codes',
    );
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

  it('dogrulanmis kullaniciya kimlik token i ve refresh token doner', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await markVerified(EMAIL);

    const response = await login({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.identityToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
    // Kimlik token'i bir JWT'dir (uc parca).
    expect(String(response.body.identityToken).split('.')).toHaveLength(3);
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
});
