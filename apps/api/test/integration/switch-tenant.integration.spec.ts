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
 * switch-tenant — uctan uca (MT §7.4 asama 2).
 *
 * Zincirin son halkasi: kayit -> dogrulama -> giris KIMLIK token'i verir; bu
 * uc nokta o kimligi bir tenant'a scope eder ve `tenant` claim'li access token
 * dogurur. Gercek DI grafigi (Identity + Tenant + Session), gercek RLS ve
 * gercek membership sorgusu devrededir.
 *
 * En kritik iddia: uretilen access token'in GERCEKTEN tenant claim'i tasimasi
 * ve yalnizca AKTIF uyelik + AKTIF tenant durumunda uretilmesi.
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

/** JWT payload'ini cozer (imza dogrulamadan; testin amaci CLAIM'leri gormek). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split('.')[1] ?? '';
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

const EMAIL = 'user@example.com';
const PASSWORD = 'parola123';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const OTHER_TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a2';

describe('switch-tenant (uctan uca)', () => {
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
    await truncateTenantTables(database.ownerPool);
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

  /** Kayit + dogrulama + giris -> { identityToken, userId }. */
  async function signIn(): Promise<{ identityToken: string; userId: string }> {
    await post('register').send({ email: EMAIL, password: PASSWORD });
    await markVerified(EMAIL);
    const login = await post('login').send({ email: EMAIL, password: PASSWORD });

    const rows = await database.ownerPool.query<{ id: string }>(
      'SELECT id FROM platform.users WHERE email = $1',
      [EMAIL],
    );

    return { identityToken: String(login.body.identityToken), userId: String(rows.rows[0]?.id) };
  }

  async function createTenant(id: string, status: string, ownerUserId: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, `tenant-${id.slice(-4)}`, 'Test Tenant', status, ownerUserId],
    );
  }

  // Membership id UUIDv7 OLMALI (domain `MembershipId` v7 zorlar); gen_random_uuid
  // v4 uretir ve okuma sirasinda reddedilir. Testlerde v7-sekilli sabit id yeter.
  let membershipSeq = 0;
  function nextMembershipId(): string {
    membershipSeq += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${String(membershipSeq).padStart(12, '0')}`;
  }

  async function addMembership(m: {
    tenantId: string;
    userId: string;
    role: string;
    status: string;
  }): Promise<void> {
    const joinedAt = m.status === 'invited' ? null : new Date();
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nextMembershipId(), m.tenantId, m.userId, m.role, m.status, joinedAt],
    );
  }

  function switchTenant(token: string | undefined, tenantId: unknown) {
    const call = post('switch-tenant');
    return (token === undefined ? call : call.set('Authorization', `Bearer ${token}`)).send({
      tenantId,
    });
  }

  // --- Mutlu yol -----------------------------------------------------------

  it('aktif uyelik + aktif tenant icin access token uretir', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'member', status: 'active' });

    const response = await switchTenant(identityToken, TENANT_ID);

    expect(response.status).toBe(200);
    expect(String(response.body.accessToken).split('.')).toHaveLength(3);
  });

  it('access token GERCEKTEN tenant claim i tasir', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'admin', status: 'active' });

    const response = await switchTenant(identityToken, TENANT_ID);
    const payload = decodeJwtPayload(String(response.body.accessToken));

    // Kimlik token'i tenant TASIMIYORDU; access token tasiyor (ADR-0020).
    expect(payload.tenant).toBe(TENANT_ID);
    expect(payload.typ).toBe('access');
  });

  it('access token, kimlik token iyla AYNI oturumu (sid) tasir', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'member', status: 'active' });

    const response = await switchTenant(identityToken, TENANT_ID);

    // Secim yeni oturum acmaz: mevcut kimlik oturumunu scope eder.
    expect(decodeJwtPayload(String(response.body.accessToken)).sid).toBe(
      decodeJwtPayload(identityToken).sid,
    );
  });

  // --- Erisim reddi (uniform 403) ------------------------------------------

  it('UYE OLMAYAN tenant a 403 doner', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    // Membership YOK.

    const response = await switchTenant(identityToken, TENANT_ID);

    expect(response.status).toBe(403);
  });

  it('SUSPENDED uyelige 403 doner', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'member', status: 'suspended' });

    const response = await switchTenant(identityToken, TENANT_ID);

    expect(response.status).toBe(403);
  });

  it('AKTIF OLMAYAN tenant a (suspended) 403 doner — uyelik aktif olsa da', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'suspended', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'owner', status: 'active' });

    const response = await switchTenant(identityToken, TENANT_ID);

    expect(response.status).toBe(403);
  });

  it('baska kullanicinin tenant ina 403 doner', async () => {
    const { identityToken } = await signIn();
    // Tenant baska bir kullaniciya ait; bu kullanicinin uyeligi yok.
    await createTenant(OTHER_TENANT_ID, 'active', '018f3a2b-7c4d-7e1f-9b3c-999999999999');
    await addMembership({
      tenantId: OTHER_TENANT_ID,
      userId: '018f3a2b-7c4d-7e1f-9b3c-999999999999',
      role: 'owner',
      status: 'active',
    });

    const response = await switchTenant(identityToken, OTHER_TENANT_ID);

    expect(response.status).toBe(403);
  });

  it('tum 403 ler AYNI govdeyi uretir (sebep sizmaz)', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId); // uyelik yok -> no-membership
    await createTenant(OTHER_TENANT_ID, 'suspended', userId);
    await addMembership({ tenantId: OTHER_TENANT_ID, userId: userId, role: 'member', status: 'active' }); // tenant-inactive

    const noMembership = await switchTenant(identityToken, TENANT_ID);
    const tenantInactive = await switchTenant(identityToken, OTHER_TENANT_ID);

    expect(noMembership.status).toBe(403);
    expect(tenantInactive.status).toBe(403);
    expect(tenantInactive.body).toMatchObject({ title: noMembership.body.title, status: 403 });
  });

  it('BILINMEYEN tenantId de 403 doner (olmayan, var olandan ayirt edilmez)', async () => {
    const { identityToken } = await signIn();

    const response = await switchTenant(identityToken, TENANT_ID);

    // Fail closed: "bu tenant yok" ile "erisemezsin" ayni yaniti verir.
    expect(response.status).toBe(403);
  });

  // --- Kimlik ve govde -----------------------------------------------------

  it('kimliksiz istege 401 doner', async () => {
    const response = await switchTenant(undefined, TENANT_ID);

    expect(response.status).toBe(401);
  });

  it('gecersiz token a 401 doner', async () => {
    const response = await switchTenant('kurcalanmis.token.degeri', TENANT_ID);

    expect(response.status).toBe(401);
  });

  it('bos tenantId ye 422 doner', async () => {
    const { identityToken } = await signIn();

    const response = await switchTenant(identityToken, '');

    expect(response.status).toBe(422);
  });

  it('tanimsiz alan gonderilirse 422 doner (strict govde)', async () => {
    const { identityToken } = await signIn();

    const response = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId: TENANT_ID, role: 'owner' });

    expect(response.status).toBe(422);
  });

  it('uretilen access token TENANT ISTEKLERINDE kimlik olarak calisir', async () => {
    const { identityToken, userId } = await signIn();
    await createTenant(TENANT_ID, 'active', userId);
    await addMembership({ tenantId: TENANT_ID, userId: userId, role: 'owner', status: 'active' });

    const switched = await switchTenant(identityToken, TENANT_ID);
    const accessToken = String(switched.body.accessToken);

    // Access token gecerli bir kimlik olarak kabul edilmeli: logout-all kimlik
    // ister ve bu token'la 204 donmeli (middleware onu dogrular).
    const response = await request(httpServer(app))
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(response.status).toBe(204);
  });
});
