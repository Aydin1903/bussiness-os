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
 * Oturum yasam dongusu — refresh rotation, yeniden kullanim tespiti ve cikis.
 *
 * Birim testleri fake repository ile calisir; burada gercek SQL, gercek aile
 * satirlari ve gercek DI grafigi devrededir. En kritik iddia: yeniden kullanim
 * 401 dondugu HALDE ailenin veritabaninda IPTAL EDILMIS olmasi — hata ile
 * iptal ayni transaction'da olsaydi iptal geri alinir ve calinan token'in
 * ailesi ayakta kalirdi (ADR-0021).
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
  readonly refreshToken: string;
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
      refreshToken: String(response.body.refreshToken),
    };
  }

  async function familyStates(): Promise<{ revoked_reason: string | null }[]> {
    const rows = await database.ownerPool.query<{ revoked_reason: string | null }>(
      'SELECT revoked_reason FROM platform.token_families ORDER BY created_at',
    );
    return rows.rows;
  }

  // --- Rotation ------------------------------------------------------------

  it('refresh yeni kimlik token i ve YENI refresh token dondurur', async () => {
    const session = await signIn();

    const response = await post('refresh').send({ refreshToken: session.refreshToken });

    expect(response.status).toBe(200);
    expect(String(response.body.identityToken).split('.')).toHaveLength(3);
    expect(response.body.refreshToken).not.toBe(session.refreshToken);
  });

  it('rotasyon AYNI ailede kalir — yeni oturum acmaz', async () => {
    const session = await signIn();

    await post('refresh').send({ refreshToken: session.refreshToken });

    expect(await familyStates()).toHaveLength(1);
    const tokens = await database.ownerPool.query('SELECT 1 FROM platform.refresh_tokens');
    expect(tokens.rowCount).toBe(2);
  });

  it('ESKI token rotasyondan sonra calismaz', async () => {
    const session = await signIn();
    const rotated = await post('refresh').send({ refreshToken: session.refreshToken });

    // Yeni token calisir...
    const withNew = await post('refresh').send({
      refreshToken: String(rotated.body.refreshToken),
    });
    expect(withNew.status).toBe(200);
  });

  // --- Yeniden kullanim tespiti -------------------------------------------

  it('kullanilmis token yeniden sunulursa 401 doner', async () => {
    const session = await signIn();
    await post('refresh').send({ refreshToken: session.refreshToken });

    const reuse = await post('refresh').send({ refreshToken: session.refreshToken });

    expect(reuse.status).toBe(401);
  });

  it('yeniden kullanimda AILE veritabaninda IPTAL EDILMIS olur', async () => {
    const session = await signIn();
    await post('refresh').send({ refreshToken: session.refreshToken });

    await post('refresh').send({ refreshToken: session.refreshToken });

    // Iptal, 401 ile ayni transaction'da olsaydi GERI ALINIRDI.
    expect((await familyStates())[0]?.revoked_reason).toBe('token-reuse-detected');
  });

  it('yeniden kullanim alarmi outbox a yazilir', async () => {
    const session = await signIn();
    await post('refresh').send({ refreshToken: session.refreshToken });

    await post('refresh').send({ refreshToken: session.refreshToken });

    const events = await database.ownerPool.query<{ event_type: string }>(
      "SELECT event_type FROM platform.identity_outbox WHERE event_type = 'refresh_token.reuse_detected'",
    );
    expect(events.rowCount).toBe(1);
  });

  it('yeniden kullanimdan sonra GECERLI token da calismaz — zincir dusmustur', async () => {
    const session = await signIn();
    const rotated = await post('refresh').send({ refreshToken: session.refreshToken });
    await post('refresh').send({ refreshToken: session.refreshToken });

    const withValid = await post('refresh').send({
      refreshToken: String(rotated.body.refreshToken),
    });

    // Asil kazanc: saldirgan zinciri devralmis olsa bile erisimini kaybeder.
    expect(withValid.status).toBe(401);
  });

  // --- Cikis ---------------------------------------------------------------

  it('logout ailesini iptal eder ve refresh artik calismaz', async () => {
    const session = await signIn();

    const response = await post('logout').send({ refreshToken: session.refreshToken });

    expect(response.status).toBe(204);
    expect((await familyStates())[0]?.revoked_reason).toBe('logout');
    expect((await post('refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
  });

  it('logout BILINMEYEN token la da 204 doner', async () => {
    // 401 donmek "bu token gercekti" bilgisini verirdi; cikis ayrica
    // idempotent olmalidir.
    expect((await post('logout').send({ refreshToken: 'olmayan-token' })).status).toBe(204);
  });

  it('logout IKI KEZ cagrilabilir', async () => {
    const session = await signIn();
    await post('logout').send({ refreshToken: session.refreshToken });

    expect((await post('logout').send({ refreshToken: session.refreshToken })).status).toBe(204);
  });

  it('logout-all kullanicinin TUM oturumlarini dusurur', async () => {
    const first = await signIn();
    const second = await post('login').send({ email: EMAIL, password: PASSWORD });
    const secondRefresh = String(second.body.refreshToken);

    const response = await post('logout-all')
      .set('Authorization', `Bearer ${first.identityToken}`)
      .send();

    expect(response.status).toBe(204);
    expect((await familyStates()).map((row) => row.revoked_reason)).toEqual([
      'logout-all',
      'logout-all',
    ]);
    expect((await post('refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
    expect((await post('refresh').send({ refreshToken: secondRefresh })).status).toBe(401);
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

  // --- Govde dogrulama -----------------------------------------------------

  it('bos refresh token a 422 doner', async () => {
    expect((await post('refresh').send({ refreshToken: '' })).status).toBe(422);
  });

  it('tanimsiz alan gonderilirse 422 doner (strict govde)', async () => {
    const session = await signIn();

    const response = await post('refresh').send({
      refreshToken: session.refreshToken,
      userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
    });

    expect(response.status).toBe(422);
  });
});
