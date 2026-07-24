import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { APP_PASSWORD, APP_ROLE } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * RBAC — `GET /api/v1/memberships` (ADR-0025, ilk yetki-korumali uc nokta).
 *
 * Zincirin TAMAMINI ilk kez bir HTTP tuketicisiyle kanitlar:
 *   giris -> switch-tenant (access token) -> tenant context (RLS) -> yetki guard
 *   -> sorgu.
 *
 * En kritik iddialar:
 *   - `owner`/`admin` 200 + roster gorur; `member`/`viewer` 403 (deny-by-default).
 *   - Liste RLS ile MEVCUT tenant'a daralir; baska tenant'in uyeleri sizmaz.
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

const PASSWORD = 'parola123';
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000a2';

describe('RBAC: GET /memberships (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama, RLS'e TABI olan `businessos_app` rolu ile baglanir — container'in
    // superuser'i DEGIL. Aksi halde RLS bypass edilir ve "roster yalnizca mevcut
    // tenant" iddiasi anlamsizlasir (superuser tum tenant'lari gorur). Kurulum
    // yine `ownerPool` (superuser) ile yapilir; UYGULAMA ise app roludur.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
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

  let seq = 0;
  function nextId(prefix: string): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-${prefix}-${String(seq).padStart(12, '0')}`;
  }

  /** Kayit + dogrulama + giris -> kullanici id + kimlik token. */
  async function signUp(email: string): Promise<{ userId: string; identityToken: string }> {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD });
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
    const login = await request(httpServer(app))
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    const rows = await database.ownerPool.query<{ id: string }>(
      'SELECT id FROM platform.users WHERE email = $1',
      [email],
    );
    return { userId: String(rows.rows[0]?.id), identityToken: String(login.body.identityToken) };
  }

  async function createTenant(id: string, ownerUserId: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, $2, 'Test', 'active', $3)`,
      [id, `tenant-${id.slice(-4)}`, ownerUserId],
    );
  }

  async function addMembership(tenantId: string, userId: string, role: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, $4, 'active', now())`,
      [nextId('8a2b'), tenantId, userId, role],
    );
  }

  /** Kimlik token'i tenant'a scope eder -> access token. */
  async function accessToken(identityToken: string, tenantId: string): Promise<string> {
    const response = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId });
    return String(response.body.accessToken);
  }

  function listMemberships(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/memberships');
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  }

  /**
   * Belirli rolde bir kullaniciyi TENANT_A'ya kurar ve access token'ini doner.
   * Tenant sahibi ayri bir owner'dir; test edilen kullanici verilen rolu alir.
   */
  async function memberWithRole(role: string): Promise<string> {
    const owner = await signUp(`owner-${role}@example.com`);
    await createTenant(TENANT_A, owner.userId);
    await addMembership(TENANT_A, owner.userId, 'owner');

    if (role === 'owner') {
      return accessToken(owner.identityToken, TENANT_A);
    }

    const user = await signUp(`${role}@example.com`);
    await addMembership(TENANT_A, user.userId, role);
    return accessToken(user.identityToken, TENANT_A);
  }

  // --- Yetki: allow ---------------------------------------------------------

  it('owner roster i gorebilir -> 200', async () => {
    const token = await memberWithRole('owner');

    const response = await listMemberships(token);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
  });

  it('admin roster i gorebilir -> 200', async () => {
    const token = await memberWithRole('admin');

    expect((await listMemberships(token)).status).toBe(200);
  });

  // --- Yetki: deny (deny-by-default) ---------------------------------------

  it('member roster i goremez -> 403', async () => {
    const token = await memberWithRole('member');

    expect((await listMemberships(token)).status).toBe(403);
  });

  it('viewer roster i goremez -> 403', async () => {
    const token = await memberWithRole('viewer');

    expect((await listMemberships(token)).status).toBe(403);
  });

  it('403 govdesi rol/permission ayrintisi SIZDIRMAZ', async () => {
    const token = await memberWithRole('viewer');

    const response = await listMemberships(token);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(response.body)).not.toMatch(/viewer|member:read/);
  });

  // --- Kimlik / tenant context ---------------------------------------------

  it('KIMLIK token i (tenant secilmemis) ile 403', async () => {
    const owner = await signUp('owner-id@example.com');
    await createTenant(TENANT_A, owner.userId);
    await addMembership(TENANT_A, owner.userId, 'owner');

    // Access token DEGIL, kimlik token'i: tenant context kurulmaz.
    const response = await listMemberships(owner.identityToken);

    expect(response.status).toBe(403);
  });

  it('kimliksiz istek -> 403', async () => {
    expect((await listMemberships(undefined)).status).toBe(403);
  });

  // --- RLS: liste mevcut tenant'a daralir ----------------------------------

  it('roster YALNIZCA mevcut tenant in uyelerini gosterir (RLS)', async () => {
    // TENANT_A: owner + bir member. TENANT_B: baska bir owner.
    const ownerA = await signUp('owner-a@example.com');
    await createTenant(TENANT_A, ownerA.userId);
    await addMembership(TENANT_A, ownerA.userId, 'owner');
    const extra = await signUp('member-a@example.com');
    await addMembership(TENANT_A, extra.userId, 'member');

    const ownerB = await signUp('owner-b@example.com');
    await createTenant(TENANT_B, ownerB.userId);
    await addMembership(TENANT_B, ownerB.userId, 'owner');

    const tokenA = await accessToken(ownerA.identityToken, TENANT_A);
    const response = await listMemberships(tokenA);

    // TENANT_A'da 2 uye var; TENANT_B'nin owner'i GORUNMEZ.
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    const userIds = (response.body.items as { userId: string }[]).map((i) => i.userId).sort();
    expect(userIds).toEqual([ownerA.userId, extra.userId].sort());
  });

  // --- Sayfalama ------------------------------------------------------------

  it('sayfalama meta si doner ve limit i uygular', async () => {
    const ownerA = await signUp('owner-pg@example.com');
    await createTenant(TENANT_A, ownerA.userId);
    await addMembership(TENANT_A, ownerA.userId, 'owner');
    for (let i = 0; i < 3; i += 1) {
      const u = await signUp(`extra-${String(i)}@example.com`);
      await addMembership(TENANT_A, u.userId, 'member');
    }

    const token = await accessToken(ownerA.identityToken, TENANT_A);
    const response = await listMemberships(token).query({ limit: 2, offset: 0 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(response.body.items).toHaveLength(2);
  });

  it('absurt limit e 422 doner', async () => {
    const token = await memberWithRole('owner');

    expect((await listMemberships(token).query({ limit: 9999 })).status).toBe(422);
  });
});
