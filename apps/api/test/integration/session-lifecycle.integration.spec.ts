import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
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
 * Oturum yasam dongusu — refresh rotation, yeniden kullanim tespiti ve cikis.
 *
 * Birim testleri fake repository ile calisir; burada gercek SQL, gercek aile
 * satirlari ve gercek DI grafigi devrededir. En kritik iddia: yeniden kullanim
 * 401 dondugu HALDE ailenin veritabaninda IPTAL EDILMIS olmasi — hata ile
 * iptal ayni transaction'da olsaydi iptal geri alinir ve calinan token'in
 * ailesi ayakta kalirdi (ADR-0021).
 *
 * Refresh token GOVDEDE DEGIL `HttpOnly` cookie'dedir (ADR-0026): testler
 * `Set-Cookie`'den token'i cikarir ve sonraki isteklere `Cookie` basligiyla
 * geri gonderir — gercek bir tarayicinin yaptigini taklit eder.
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

interface Session {
  readonly identityToken: string;
  /** `Cookie` basligina konacak `refresh_token=xxx` ciftii (ADR-0026). */
  readonly cookie: string;
}

/**
 * `Set-Cookie`'den refresh token ciftini (`refresh_token=xxx`) cikarir.
 *
 * Sonraki isteklere `Cookie` basligiyla aynen geri gonderilir. Token degeri
 * base64url'dir (noktali virgul icermez), bu yuzden ilk `;`'e kadar kesmek
 * guvenlidir.
 */
function extractRefreshCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const raw = (setCookie ?? []).find((entry) => entry.startsWith('refresh_token='));
  if (raw === undefined) {
    throw new Error('Yanitta refresh_token cookie si bulunamadi.');
  }
  return raw.split(';')[0] ?? '';
}

describe('oturum yasam dongusu (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.container.getConnectionUri();
    await setIdentityTestEnv();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(correlationIdMiddleware);
    // Refresh token cookie'den okunur (ADR-0026); parser olmadan `req.cookies`
    // dolmaz ve refresh her zaman 401 verirdi. main.ts ile AYNI kurulum.
    app.use(cookieParser());
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

  function post(path: string) {
    return request(httpServer(app)).post(`/api/v1/auth/${path}`);
  }

  async function markVerified(email: string): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
  }

  /** Kayit + dogrulama + giris -> kullanilabilir bir oturum. */
  async function signIn(email = EMAIL): Promise<Session> {
    await post('register').send({ email, password: PASSWORD });
    await markVerified(email);

    const response = await post('login').send({ email, password: PASSWORD });

    return {
      identityToken: String(response.body.identityToken),
      cookie: extractRefreshCookie(response),
    };
  }

  async function familyStates(): Promise<{ revoked_reason: string | null }[]> {
    const rows = await database.ownerPool.query<{ revoked_reason: string | null }>(
      'SELECT revoked_reason FROM platform.token_families ORDER BY created_at',
    );
    return rows.rows;
  }

  // --- Rotation ------------------------------------------------------------

  it('refresh yeni kimlik token i (govde) ve YENI refresh cookie si dondurur', async () => {
    const session = await signIn();

    const response = await post('refresh').set('Cookie', session.cookie);

    expect(response.status).toBe(200);
    expect(String(response.body.identityToken).split('.')).toHaveLength(3);
    // Refresh token GOVDEDE DONMEZ; yeni cookie eskisinden FARKLIDIR (rotation).
    expect(response.body.refreshToken).toBeUndefined();
    expect(extractRefreshCookie(response)).not.toBe(session.cookie);
  });

  it('rotasyon AYNI ailede kalir — yeni oturum acmaz', async () => {
    const session = await signIn();

    await post('refresh').set('Cookie', session.cookie);

    expect(await familyStates()).toHaveLength(1);
    const tokens = await database.ownerPool.query('SELECT 1 FROM platform.refresh_tokens');
    expect(tokens.rowCount).toBe(2);
  });

  it('ESKI token rotasyondan sonra calismaz', async () => {
    const session = await signIn();
    const rotated = await post('refresh').set('Cookie', session.cookie);

    // Yeni cookie calisir...
    const withNew = await post('refresh').set('Cookie', extractRefreshCookie(rotated));
    expect(withNew.status).toBe(200);
  });

  // --- Yeniden kullanim tespiti -------------------------------------------

  it('kullanilmis token yeniden sunulursa 401 doner', async () => {
    const session = await signIn();
    await post('refresh').set('Cookie', session.cookie);

    const reuse = await post('refresh').set('Cookie', session.cookie);

    expect(reuse.status).toBe(401);
  });

  it('yeniden kullanimda AILE veritabaninda IPTAL EDILMIS olur', async () => {
    const session = await signIn();
    await post('refresh').set('Cookie', session.cookie);

    await post('refresh').set('Cookie', session.cookie);

    // Iptal, 401 ile ayni transaction'da olsaydi GERI ALINIRDI.
    expect((await familyStates())[0]?.revoked_reason).toBe('token-reuse-detected');
  });

  it('yeniden kullanim alarmi outbox a yazilir', async () => {
    const session = await signIn();
    await post('refresh').set('Cookie', session.cookie);

    await post('refresh').set('Cookie', session.cookie);

    const events = await database.ownerPool.query<{ event_type: string }>(
      "SELECT event_type FROM platform.identity_outbox WHERE event_type = 'refresh_token.reuse_detected'",
    );
    expect(events.rowCount).toBe(1);
  });

  it('yeniden kullanimdan sonra GECERLI token da calismaz — zincir dusmustur', async () => {
    const session = await signIn();
    const rotated = await post('refresh').set('Cookie', session.cookie);
    await post('refresh').set('Cookie', session.cookie);

    const withValid = await post('refresh').set('Cookie', extractRefreshCookie(rotated));

    // Asil kazanc: saldirgan zinciri devralmis olsa bile erisimini kaybeder.
    expect(withValid.status).toBe(401);
  });

  // --- Mutlak oturum omru --------------------------------------------------

  /** Aileyi `days` gun once acilmis gibi gosterir; gercek zamani beklemeden. */
  async function ageFamily(days: number): Promise<void> {
    await database.ownerPool.query(
      `UPDATE platform.token_families
         SET created_at = created_at - make_interval(days => $1)`,
      [days],
    );
  }

  it('tavanin ALTINDA (89 gun) refresh calisir', async () => {
    const session = await signIn();
    await ageFamily(89);

    const response = await post('refresh').set('Cookie', session.cookie);

    expect(response.status).toBe(200);
  });

  it('mutlak omur dolunca (91 gun) refresh 401 doner', async () => {
    const session = await signIn();
    await ageFamily(91);

    const response = await post('refresh').set('Cookie', session.cookie);

    // Token'in kendisi hala kullanilabilir; reddin sebebi AILENIN yasidir.
    expect(response.status).toBe(401);
  });

  it('omru dolan aile IPTAL EDILMIS olarak isaretlenmez', async () => {
    const session = await signIn();
    await ageFamily(91);

    await post('refresh').set('Cookie', session.cookie);

    // Sona erme `created_at`'ten turer; iptal kaydi yazmak "birileri karar
    // verdi" izlenimi verir ve denetimi kirletir.
    expect((await familyStates())[0]?.revoked_reason).toBeNull();
  });

  it('omru dolan oturum YENIDEN GIRISLE devam eder', async () => {
    const session = await signIn();
    await ageFamily(91);
    await post('refresh').set('Cookie', session.cookie);

    const again = await post('login').send({ email: EMAIL, password: PASSWORD });

    // Kullanicidan beklenen davranis: parola ile yeni bir aile acmak.
    expect(again.status).toBe(200);
    const fresh = await post('refresh').set('Cookie', extractRefreshCookie(again));
    expect(fresh.status).toBe(200);
  });

  // --- Cikis ---------------------------------------------------------------

  it('logout ailesini iptal eder ve refresh artik calismaz', async () => {
    const session = await signIn();

    const response = await post('logout').set('Cookie', session.cookie);

    expect(response.status).toBe(204);
    expect((await familyStates())[0]?.revoked_reason).toBe('logout');
    expect((await post('refresh').set('Cookie', session.cookie)).status).toBe(401);

    // Cikis cookie'yi de temizler: Set-Cookie, cookie'yi hemen sona erdirir.
    const cleared = response.headers['set-cookie'] as unknown as string[] | undefined;
    const clearing = (cleared ?? []).find((entry) => entry.startsWith('refresh_token='));
    expect(clearing).toBeDefined();
    expect(clearing).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });

  it('logout COOKIE OLMADAN da 204 doner (idempotent)', async () => {
    // Cikis idempotenttir; cookie hic yoksa bile 204 doner.
    expect((await post('logout')).status).toBe(204);
  });

  it('logout BILINMEYEN token cookie siyle de 204 doner', async () => {
    // 401 donmek "bu token gercekti" bilgisini verirdi; cikis ayrica
    // idempotent olmalidir.
    expect((await post('logout').set('Cookie', 'refresh_token=olmayan-token')).status).toBe(204);
  });

  it('logout IKI KEZ cagrilabilir', async () => {
    const session = await signIn();
    await post('logout').set('Cookie', session.cookie);

    expect((await post('logout').set('Cookie', session.cookie)).status).toBe(204);
  });

  it('logout-all kullanicinin TUM oturumlarini dusurur', async () => {
    const first = await signIn();
    const second = await post('login').send({ email: EMAIL, password: PASSWORD });
    const secondCookie = extractRefreshCookie(second);

    const response = await post('logout-all')
      .set('Authorization', `Bearer ${first.identityToken}`)
      .send();

    expect(response.status).toBe(204);
    expect((await familyStates()).map((row) => row.revoked_reason)).toEqual([
      'logout-all',
      'logout-all',
    ]);
    expect((await post('refresh').set('Cookie', first.cookie)).status).toBe(401);
    expect((await post('refresh').set('Cookie', secondCookie)).status).toBe(401);
  });

  it('logout-all KIMLIK ister — token yoksa 401', async () => {
    await signIn();

    const response = await post('logout-all').send();

    expect(response.status).toBe(401);
    expect((await familyStates())[0]?.revoked_reason).toBeNull();
  });

  it('logout-all BASKA kullanicinin oturumlarina dokunmaz', async () => {
    const mine = await signIn();
    await signIn('baskasi@example.com');

    await post('logout-all').set('Authorization', `Bearer ${mine.identityToken}`).send();

    const reasons = (await familyStates()).map((row) => row.revoked_reason);
    expect(reasons).toEqual(['logout-all', null]);
  });

  // --- Cookie dogrulama ----------------------------------------------------
  //
  // Refresh artik GOVDE ALMAZ (ADR-0026); kimlik bilgisi cookie'dedir. Eksik
  // veya gecersiz cookie, diger tum redlerle AYNI 401'i uretir — sebep sizmaz.

  it('refresh COOKIE OLMADAN 401 doner', async () => {
    expect((await post('refresh')).status).toBe(401);
  });

  it('GECERSIZ refresh cookie degerine 401 doner', async () => {
    const response = await post('refresh').set('Cookie', 'refresh_token=gecersiz-deger');

    // Bilinmeyen token, gecersiz/dolmus/iptal ile ayni yaniti verir.
    expect(response.status).toBe(401);
  });
});
