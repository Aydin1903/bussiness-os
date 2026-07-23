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
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * `POST /api/v1/tenants` ucundan uca — ARTIK GERCEKTEN CALISIR.
 *
 * Bu dosya Faz 2'de "her istek 503 doner" davranisini sabitliyordu; iki gecici
 * "reddet" kapisi (kimlik saglayici ve provisioning onkosulu) Identity ile
 * DEGISTIRILDI ve iddialar guncellendi.
 *
 * Testin asil degeri DEVIR TESLIMI kanitlamasidir: kimlik dogrulanmis token'dan
 * geliyor mu, ADR-0016'nin `emailVerified` onkosulu gercekten zorlaniyor mu.
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

const EMAIL = 'owner@example.com';
const PASSWORD = 'parola123';
const BODY = { name: 'Acme Ltd.', slug: 'acme' };

describe('POST /api/v1/tenants (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.container.getConnectionUri();
    // IdentityModule acilista JWT anahtarlarini ve pepper'i ister.
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
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  function postTenant(token?: string) {
    const call = request(httpServer(app)).post('/api/v1/tenants');
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  }

  /** Dogrulama akisi ayri bir slice; durum dogrudan kurulur. */
  async function markVerified(email: string): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
  }

  /**
   * Kayit + dogrulama + giris -> kimlik token'i.
   *
   * `verified: false` istendiginde token ALINDIKTAN SONRA kullanici
   * `pending`/dogrulanmamis duruma geri alinir. Bu, politikanin TOKEN'A DEGIL
   * VERIYE baktigini kanitlar: `emailVerified` token'da tasinmaz (§10.3), cunku
   * degisebilir ve kaynagi veritabanidir.
   *
   * (`status` de geri alinir: veritabani CHECK'i `active` bir kullanicinin
   * dogrulanmamis olmasina izin vermez — domain invariant'inin SQL karsiligi.)
   */
  async function tokenFor(options: { verified: boolean }): Promise<string> {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD });

    // Giris yalnizca dogrulanmis + aktif kullaniciya token verir.
    await markVerified(EMAIL);

    const response = await request(httpServer(app))
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    if (!options.verified) {
      await database.ownerPool.query(
        "UPDATE platform.users SET email_verified = false, status = 'pending' WHERE email = $1",
        [EMAIL],
      );
    }

    return String(response.body.identityToken);
  }

  it('uygulama Tenant + Identity modulleri ile ayaga kalkar', () => {
    // DI grafigi cozuldu: gercek CurrentUserProvider ve emailVerified politikasi
    // bagli; gecici kapilar artik yok.
    expect(app).toBeDefined();
  });

  // --- Kimlik dogrulama ----------------------------------------------------

  it('token YOKSA 401 doner', async () => {
    const response = await postTenant().send(BODY);

    expect(response.status).toBe(401);
  });

  it('401 yaniti RFC 7807 bicimindedir ve ic detay sizdirmaz', async () => {
    const response = await postTenant().send(BODY);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 401, instance: '/api/v1/tenants' });
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|password|select |\.ts:/i);
  });

  it('GECERSIZ token ile 401 doner', async () => {
    const response = await postTenant('kurcalanmis.token.degeri').send(BODY);

    expect(response.status).toBe(401);
  });

  it('kimliksiz istek hicbir tenant OLUSTURMAZ', async () => {
    await postTenant().send(BODY);

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    expect(tenants.rowCount).toBe(0);
  });

  // --- ADR-0016 onkosulu ---------------------------------------------------

  it('e-postasi DOGRULANMAMIS kullaniciya 403 doner', async () => {
    const token = await tokenFor({ verified: false });

    const response = await postTenant(token).send(BODY);

    expect(response.status).toBe(403);
  });

  it('dogrulanmamis kullanici icin hicbir tenant OLUSTURMAZ', async () => {
    const token = await tokenFor({ verified: false });

    await postTenant(token).send(BODY);

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    expect(tenants.rowCount).toBe(0);
  });

  // --- Mutlu yol -----------------------------------------------------------

  it('dogrulanmis kullaniciya 202 doner ve tenant i provisioning durumunda acar', async () => {
    const token = await tokenFor({ verified: true });

    const response = await postTenant(token).send(BODY);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ slug: 'acme', status: 'provisioning' });
  });

  it('tenant, owner uyeligi ve outbox event ini birlikte yazar', async () => {
    const token = await tokenFor({ verified: true });

    await postTenant(token).send(BODY);

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    const memberships = await database.ownerPool.query<{ role: string }>(
      'SELECT role FROM platform.memberships',
    );
    const outbox = await database.ownerPool.query<{ event_type: string }>(
      'SELECT event_type FROM platform.outbox',
    );

    expect(tenants.rowCount).toBe(1);
    expect(memberships.rows[0]?.role).toBe('owner');
    expect(outbox.rows[0]?.event_type).toBe('tenant.provisioning_requested');
  });

  it('sahibi TOKEN dan alir, govdeden DEGIL', async () => {
    const token = await tokenFor({ verified: true });

    await postTenant(token).send(BODY);

    const users = await database.ownerPool.query<{ id: string }>(
      'SELECT id FROM platform.users WHERE email = $1',
      [EMAIL],
    );
    const tenants = await database.ownerPool.query<{ owner_user_id: string }>(
      'SELECT owner_user_id FROM platform.tenants',
    );

    expect(tenants.rows[0]?.owner_user_id).toBe(users.rows[0]?.id);
  });

  // --- Dogrulama (kimlik kontrolunden ONCE calisir) -----------------------

  it('gecersiz govdeye 422 doner', async () => {
    const response = await postTenant().send({ name: '', slug: 'a' });

    expect(response.status).toBe(422);
    expect(response.body.errors).toBeDefined();
  });

  it('ownerUserId gonderilirse 422 doner', async () => {
    // Sahip govdeden ALINMAZ. Sema strict oldugu icin alan sessizce yok
    // sayilmaz — istemci gonderdiginin islenmedigini ogrenir.
    const response = await postTenant().send({
      ...BODY,
      ownerUserId: '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b',
    });

    expect(response.status).toBe(422);
  });

  it('bos govdeye 422 doner', async () => {
    const response = await postTenant().send({});

    expect(response.status).toBe(422);
  });

  it('yanitlar korelasyon kimligi tasir', async () => {
    const response = await postTenant().send({ name: '', slug: '' });

    expect(response.body.traceId).toBeDefined();
  });
});
