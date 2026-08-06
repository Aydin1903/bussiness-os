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
 * CRM uclari — RBAC + RLS zinciri UCTAN UCA (ADR-0031 Slice 4).
 *
 * Bu slice'in kabul testi: sema + RLS + RBAC zinciri AI OLMADAN calisiyor mu.
 *
 * En kritik iddialar:
 *   - Kaynak bazli izinler GERCEKTEN zorlaniyor: `viewer` OKUR ama YAZAMAZ,
 *     `member` YAZAR ama SILEMEZ (ADR-0031 §6).
 *   - Baska tenant'in kaydi 404 alir — 403 DEGIL: varligi sizdirilmaz.
 *   - `PATCH` KISMIDIR: gonderilmeyen alan korunur.
 *   - Sirket silinince kisileri CASCADE ile gider.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000c2';

describe('CRM uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
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
    await database.ownerPool.query('TRUNCATE crm.contacts, crm.companies CASCADE');
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  let seq = 0;
  function nextId(prefix: string): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-${prefix}-${String(seq).padStart(12, '0')}`;
  }

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
       VALUES ($1, $2, 'Test', 'active', $3)
       ON CONFLICT (id) DO NOTHING`,
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

  async function accessToken(identityToken: string, tenantId: string): Promise<string> {
    const response = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId });
    return String(response.body.accessToken);
  }

  /** Verilen rolde TENANT_A uyesi bir kullanicinin access token'i. */
  async function tokenFor(role: string): Promise<string> {
    const user = await signUp(`${role}-${String(seq)}@example.com`);
    await createTenant(TENANT_A, user.userId);
    await addMembership(TENANT_A, user.userId, role);
    return accessToken(user.identityToken, TENANT_A);
  }

  function api() {
    return request(httpServer(app));
  }

  function createCompany(token: string, name = 'Acme Tekstil') {
    return api()
      .post('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, industry: 'Tekstil' });
  }

  // --- Kaynak bazli izinler (ADR-0031 §6) ---------------------------------

  it('viewer OKUR (company:read viewer a DA verildi)', async () => {
    const owner = await tokenFor('owner');
    await createCompany(owner);
    const viewer = await tokenFor('viewer');

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${viewer}`);

    // Knowledge'dan BILINCLI SAPMA: `note:read` viewer'a verilmemisti, ama
    // musteri listesini gormek viewer'in TANIMI GEREGI isidir.
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('viewer YAZAMAZ (company:write yok) -> 403', async () => {
    const viewer = await tokenFor('viewer');
    expect((await createCompany(viewer)).status).toBe(403);
  });

  it('member YAZAR ama SILEMEZ (company:delete yalnizca owner/admin)', async () => {
    const member = await tokenFor('member');
    const created = await createCompany(member);
    expect(created.status).toBe(201);

    const deleted = await api()
      .delete(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${member}`);

    // Silme geri alinamaz ve (Slice 6'dan itibaren) AI hafizasindan da siler.
    expect(deleted.status).toBe(403);
  });

  it('owner SILEBILIR', async () => {
    const owner = await tokenFor('owner');
    const created = await createCompany(owner);

    const deleted = await api()
      .delete(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(deleted.status).toBe(204);
  });

  it('KIMLIKSIZ istek 401', async () => {
    expect((await api().get('/api/v1/crm/companies')).status).toBe(401);
  });

  // --- Tenant izolasyonu (HTTP katmaninda) --------------------------------

  it('BASKA tenant in sirketi 404 alir — 403 DEGIL (varligi sizmaz)', async () => {
    const ownerA = await tokenFor('owner');
    const created = await createCompany(ownerA, 'A nin sirketi');

    const userB = await signUp('owner-b@example.com');
    await createTenant(TENANT_B, userB.userId);
    await addMembership(TENANT_B, userB.userId, 'owner');
    const ownerB = await accessToken(userB.identityToken, TENANT_B);

    const response = await api()
      .get(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${ownerB}`);

    // "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, id'nin baska bir
    // tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
    expect(response.status).toBe(404);
  });

  // --- PATCH semantigi -----------------------------------------------------

  it('PATCH KISMIDIR: gonderilmeyen alan KORUNUR', async () => {
    const owner = await tokenFor('owner');
    const created = await createCompany(owner);

    const patched = await api()
      .patch(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Acme A.S.' });

    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Acme A.S.');
    // `PUT` olsaydi bu alan SESSIZCE null'lanirdi — PATCH secmenin sebebi bu.
    expect(patched.body.industry).toBe('Tekstil');
  });

  it('PATCH ile `null` gonderilen alan TEMIZLENIR', async () => {
    const owner = await tokenFor('owner');
    const created = await createCompany(owner);

    const patched = await api()
      .patch(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ industry: null });

    expect(patched.body.industry).toBeNull();
  });

  it('BOS PATCH govdesi 422', async () => {
    const owner = await tokenFor('owner');
    const created = await createCompany(owner);

    const patched = await api()
      .patch(`/api/v1/crm/companies/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({});

    expect(patched.status).toBe(422);
  });

  // --- Kisiler + CASCADE ---------------------------------------------------

  it('kisi VAR OLMAYAN sirkete baglanamaz -> 404 (FK ihlali 500 DEGIL)', async () => {
    const owner = await tokenFor('owner');

    const response = await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: nextId('9c3d'), fullName: 'Ayse Yilmaz' });

    expect(response.status).toBe(404);
  });

  it('sirket silinince kisileri de gider (CASCADE)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: String(company.body.id), fullName: 'Ayse Yilmaz' });

    await api()
      .delete(`/api/v1/crm/companies/${String(company.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    const contacts = await api()
      .get('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`);

    expect(contacts.body.items).toHaveLength(0);
  });

  it('kisiler companyId ile filtrelenir', async () => {
    const owner = await tokenFor('owner');
    const first = await createCompany(owner, 'Birinci');
    const second = await createCompany(owner, 'Ikinci');

    for (const [company, name] of [
      [first, 'Ayse'],
      [second, 'Mehmet'],
    ] as const) {
      await api()
        .post('/api/v1/crm/contacts')
        .set('Authorization', `Bearer ${owner}`)
        .send({ companyId: String(company.body.id), fullName: name });
    }

    const filtered = await api()
      .get(`/api/v1/crm/contacts?companyId=${String(first.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].fullName).toBe('Ayse');
  });
});
