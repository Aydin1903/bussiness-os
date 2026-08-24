import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

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
 * `GET /api/v1/audit` — ADR-0043 §6.4 (kalem A).
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN IKI AYRI ISI VAR
 * ============================================================================
 *   1. **Rol turu** — `audit:read` DAR bir izindir (owner + admin). Bir
 *      denetim kaydi PAYLASILAN bir is gercegi DEGILDIR: genis olsaydi her
 *      calisan meslektaslarinin hangi kayitlara dokundugunu izleyebilirdi ve
 *      bu, denetim izinin AMACININ tersidir.
 *   2. ⚠️ **API SOZLESMESI DE DEGER TASIMAZ** (§6.5). Tabloda deger kolonu
 *      olmadigi `audit-log.integration.spec.ts`te kanitlaniyor; burasi
 *      DISARI CIKAN GOVDENIN de yalnizca alan ADINI tasidigini kanitliyor.
 *      Ucuncu bir agdir: bir gun repository'e hesaplanmis bir "eski deger"
 *      alani eklenirse (tabloya dokunmadan), bu test kirmizi yanar.
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
const EMPLOYEE = '018f3a2b-7c4d-7e1f-9b3c-0000000000e9';

/** Cevap govdesinde ASLA gorunmemesi gereken sey: bir DEGER. */
const SECRET_VALUE = '75000.00';

describe('GET /audit (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();
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
    // ⚠️ `platform.audit_log` `tenants`a FK ile bagli oldugu icin `CASCADE`
    // onu da temizler. `DELETE` KULLANILAMAZDI — degismezlik trigger'ina
    // takilirdi (§6.4, katman 2).
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

  async function accessToken(identityToken: string, tenantId: string): Promise<string> {
    const response = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId });
    return String(response.body.accessToken);
  }

  /**
   * Denetim kaydi yazar.
   *
   * ⚠️ `SECRET_VALUE` HICBIR YERE GECIRILMEZ — gecirilecek bir kolon YOKTUR.
   * Test onu yalnizca cevabin icinde ARAMAK icin tanimlar; bulunursa bir yerde
   * bir deger sizmis demektir.
   */
  async function seedEntry(
    tenantId: string,
    actorUserId: string,
    fieldName: string,
  ): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.audit_log
         (id, tenant_id, actor_user_id, occurred_at, resource_type, resource_id, action, field_name)
       VALUES ($1, $2, $3, now(), 'hr.employee', $4, 'updated', $5)`,
      [randomUUID(), tenantId, actorUserId, EMPLOYEE, fieldName],
    );
  }

  function listAudit(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/audit');
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  }

  async function memberWithRole(role: string): Promise<{ token: string; userId: string }> {
    const owner = await signUp(`owner-audit-${role}@example.com`);
    await createTenant(TENANT_A, owner.userId);
    await addMembership(TENANT_A, owner.userId, 'owner');

    if (role === 'owner') {
      return { token: await accessToken(owner.identityToken, TENANT_A), userId: owner.userId };
    }

    const user = await signUp(`audit-${role}@example.com`);
    await addMembership(TENANT_A, user.userId, role);
    return { token: await accessToken(user.identityToken, TENANT_A), userId: user.userId };
  }

  // --- Yetki: allow ---------------------------------------------------------

  it('owner denetim kaydini gorebilir -> 200', async () => {
    const { token, userId } = await memberWithRole('owner');
    await seedEntry(TENANT_A, userId, 'job_title');

    const response = await listAudit(token);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      resourceType: 'hr.employee',
      resourceId: EMPLOYEE,
      action: 'updated',
      fieldName: 'job_title',
    });
  });

  it('admin denetim kaydini gorebilir -> 200', async () => {
    const { token } = await memberWithRole('admin');

    expect((await listAudit(token)).status).toBe(200);
  });

  // --- Yetki: deny (deny-by-default) ---------------------------------------

  it('⚠️ member denetim kaydini GOREMEZ -> 403', async () => {
    const { token } = await memberWithRole('member');

    expect((await listAudit(token)).status).toBe(403);
  });

  it('⚠️ viewer denetim kaydini GOREMEZ -> 403', async () => {
    const { token } = await memberWithRole('viewer');

    expect((await listAudit(token)).status).toBe(403);
  });

  it('kimliksiz istek -> 401', async () => {
    expect((await listAudit(undefined)).status).toBe(401);
  });

  it('KIMLIK token i (tenant secilmemis) -> 403', async () => {
    const owner = await signUp('owner-audit-id@example.com');
    await createTenant(TENANT_A, owner.userId);
    await addMembership(TENANT_A, owner.userId, 'owner');

    expect((await listAudit(owner.identityToken)).status).toBe(403);
  });

  // --- ⚠️ DEGER SIZMAZ ------------------------------------------------------

  it('⚠️ cevap govdesi DEGER TASIMAZ — yalnizca alan ADI', async () => {
    const { token, userId } = await memberWithRole('owner');
    await seedEntry(TENANT_A, userId, 'amount');

    const response = await listAudit(token);
    const body = JSON.stringify(response.body);

    // Kaydedilen: hangi alan degisti.
    expect(response.body.items[0].fieldName).toBe('amount');

    // Kaydedilmeyen: degerin kendisi ve onu tasiyabilecek her ad.
    expect(body).not.toContain(SECRET_VALUE);
    for (const key of ['value', 'oldValue', 'newValue', 'before', 'after', 'payload', 'diff']) {
      expect(response.body.items[0]).not.toHaveProperty(key);
    }
  });

  it('cevap alanlari BIREBIR sozlesmedeki kadardir', async () => {
    const { token, userId } = await memberWithRole('owner');
    await seedEntry(TENANT_A, userId, 'work_phone');

    const response = await listAudit(token);

    const items = response.body.items as Record<string, unknown>[];

    expect(Object.keys(items[0] ?? {}).sort()).toEqual([
      'action',
      'actorUserId',
      'fieldName',
      'id',
      'occurredAt',
      'resourceId',
      'resourceType',
    ]);
  });

  // --- RLS ------------------------------------------------------------------

  it('⚠️ liste YALNIZCA mevcut tenant in kaydini gosterir (RLS)', async () => {
    const ownerA = await signUp('owner-audit-a@example.com');
    await createTenant(TENANT_A, ownerA.userId);
    await addMembership(TENANT_A, ownerA.userId, 'owner');

    const ownerB = await signUp('owner-audit-b@example.com');
    await createTenant(TENANT_B, ownerB.userId);
    await addMembership(TENANT_B, ownerB.userId, 'owner');

    await seedEntry(TENANT_A, ownerA.userId, 'job_title');
    await seedEntry(TENANT_B, ownerB.userId, 'amount');
    await seedEntry(TENANT_B, ownerB.userId, 'work_email');

    const response = await listAudit(await accessToken(ownerA.identityToken, TENANT_A));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].fieldName).toBe('job_title');
  });

  // --- Filtre ve sayfalama --------------------------------------------------

  it('kaynak turu ve id ile filtreler', async () => {
    const { token, userId } = await memberWithRole('owner');
    await seedEntry(TENANT_A, userId, 'job_title');

    const other = await listAudit(token).query({
      resourceType: 'hr.employee',
      resourceId: '018f3a2b-7c4d-7e1f-9b3c-0000000000ff',
    });
    const mine = await listAudit(token).query({
      resourceType: 'hr.employee',
      resourceId: EMPLOYEE,
    });

    expect(other.body.total).toBe(0);
    expect(mine.body.total).toBe(1);
  });

  it('⚠️ resourceId TEK BASINA verilirse 422', async () => {
    const { token } = await memberWithRole('owner');

    expect((await listAudit(token).query({ resourceId: EMPLOYEE })).status).toBe(422);
  });

  it('absurt limit e 422 doner', async () => {
    const { token } = await memberWithRole('owner');

    expect((await listAudit(token).query({ limit: 9999 })).status).toBe(422);
  });

  it('sayfalama meta si doner ve limit i uygular', async () => {
    const { token, userId } = await memberWithRole('owner');
    await seedEntry(TENANT_A, userId, 'job_title');
    await seedEntry(TENANT_A, userId, 'work_phone');
    await seedEntry(TENANT_A, userId, 'work_email');

    const response = await listAudit(token).query({ limit: 2, offset: 0 });

    expect(response.body).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(response.body.items).toHaveLength(2);
  });
});
