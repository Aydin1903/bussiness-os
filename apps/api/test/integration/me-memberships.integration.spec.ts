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
 * `GET /api/v1/me/memberships` — uctan uca (ADR-0028).
 *
 * Login sonrasi tenant secim adimini besleyen sorgu. En kritik iddialar:
 *   1. Yalnizca SWITCHABLE tenant'lar doner (aktif uyelik + aktif tenant).
 *   2. Kullanici yalnizca KENDI uyeliklerini gorur (RLS-bypass izolasyonu).
 *   3. Dar rol `businessos_rls_reader` BASKA hicbir tabloya/fonksiyona erisemez
 *      (Constraint 2 — ADR-0028).
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
const OTHER_EMAIL = 'other@example.com';
const PASSWORD = 'parola123';

describe('GET /me/memberships (uctan uca)', () => {
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

  function get(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/me/memberships');
    return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  }

  async function markVerified(email: string): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
  }

  /** Kayit + dogrulama + giris -> { identityToken, userId }. */
  async function signIn(email: string): Promise<{ identityToken: string; userId: string }> {
    await request(httpServer(app))
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD });
    await markVerified(email);
    const login = await request(httpServer(app))
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });

    const rows = await database.ownerPool.query<{ id: string }>(
      'SELECT id FROM platform.users WHERE email = $1',
      [email],
    );
    return { identityToken: String(login.body.identityToken), userId: String(rows.rows[0]?.id) };
  }

  async function createTenant(t: {
    id: string;
    name: string;
    status: string;
    ownerUserId: string;
  }): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [t.id, `slug-${t.id.slice(-4)}`, t.name, t.status, t.ownerUserId],
    );
  }

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

  const T_ACTIVE_1 = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
  const T_ACTIVE_2 = '018f3a2b-7c4d-7e1f-8a2b-0000000000a2';
  const T_PROVISIONING = '018f3a2b-7c4d-7e1f-8a2b-0000000000a3';
  const T_SUSPENDED_MEM = '018f3a2b-7c4d-7e1f-8a2b-0000000000a4';
  const T_OTHER = '018f3a2b-7c4d-7e1f-8a2b-0000000000a5';

  /**
   * Zengin bir senaryo kurar:
   *   - Alpha (aktif) + aktif uyelik      -> switchable
   *   - Beta  (aktif) + aktif uyelik      -> switchable
   *   - Gamma (provisioning) + aktif uyelik -> HARIC (tenant operasyonel degil)
   *   - Delta (aktif) + suspended uyelik  -> HARIC (uyelik erisim vermez)
   *   - Epsilon (aktif) BASKA kullanicinin uyeligi -> HARIC (izolasyon)
   */
  async function seedScenario(): Promise<{ identityToken: string; userId: string }> {
    const me = await signIn(EMAIL);
    const other = await signIn(OTHER_EMAIL);

    await createTenant({ id: T_ACTIVE_1, name: 'Alpha', status: 'active', ownerUserId: me.userId });
    await createTenant({ id: T_ACTIVE_2, name: 'Beta', status: 'active', ownerUserId: me.userId });
    await createTenant({
      id: T_PROVISIONING,
      name: 'Gamma',
      status: 'provisioning',
      ownerUserId: me.userId,
    });
    await createTenant({
      id: T_SUSPENDED_MEM,
      name: 'Delta',
      status: 'active',
      ownerUserId: me.userId,
    });
    await createTenant({
      id: T_OTHER,
      name: 'Epsilon',
      status: 'active',
      ownerUserId: other.userId,
    });

    await addMembership({
      tenantId: T_ACTIVE_1,
      userId: me.userId,
      role: 'owner',
      status: 'active',
    });
    await addMembership({
      tenantId: T_ACTIVE_2,
      userId: me.userId,
      role: 'member',
      status: 'active',
    });
    await addMembership({
      tenantId: T_PROVISIONING,
      userId: me.userId,
      role: 'owner',
      status: 'active',
    });
    await addMembership({
      tenantId: T_SUSPENDED_MEM,
      userId: me.userId,
      role: 'member',
      status: 'suspended',
    });
    await addMembership({
      tenantId: T_OTHER,
      userId: other.userId,
      role: 'owner',
      status: 'active',
    });

    return me;
  }

  it('yalnizca SWITCHABLE tenant lari doner (aktif uyelik + aktif tenant)', async () => {
    const me = await seedScenario();

    const response = await get(me.identityToken);

    expect(response.status).toBe(200);
    const slugsByName = (response.body.items as { tenantName: string; tenantId: string }[]).map(
      (i) => i.tenantName,
    );
    // Alpha + Beta; Gamma (provisioning), Delta (suspended uyelik), Epsilon (baskasi) YOK.
    expect(slugsByName).toEqual(['Alpha', 'Beta']);
    expect(response.body.total).toBe(2);
  });

  it('her oge tenant + rol + durum alanlarini tasir', async () => {
    const me = await seedScenario();

    const response = await get(me.identityToken);
    const alpha = (response.body.items as { tenantName: string }[]).find(
      (i) => i.tenantName === 'Alpha',
    );

    expect(alpha).toMatchObject({
      tenantId: T_ACTIVE_1,
      tenantName: 'Alpha',
      tenantSlug: `slug-${T_ACTIVE_1.slice(-4)}`,
      role: 'owner',
      status: 'active',
    });
  });

  it('BASKA kullanicinin uyeligi sizmaz (RLS-bypass izolasyonu)', async () => {
    const me = await seedScenario();

    const response = await get(me.identityToken);
    const tenantIds = (response.body.items as { tenantId: string }[]).map((i) => i.tenantId);

    expect(tenantIds).not.toContain(T_OTHER);
  });

  it('sayfalama limit i uygular ve toplami korur', async () => {
    const me = await seedScenario();

    const response = await get(me.identityToken).query({ limit: 1 });

    expect(response.body.items).toHaveLength(1);
    expect(response.body.total).toBe(2);
    expect(response.body.limit).toBe(1);
  });

  it('uyeligi olmayan kullaniciya BOS liste doner', async () => {
    const me = await signIn(EMAIL);

    const response = await get(me.identityToken);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it('kimliksiz istege 401 doner', async () => {
    const response = await get(undefined);

    expect(response.status).toBe(401);
  });

  it('absurt limit e 422 doner', async () => {
    const me = await signIn(EMAIL);

    const response = await get(me.identityToken).query({ limit: 99999 });

    expect(response.status).toBe(422);
  });

  // --- Constraint 2: dar rolun erisim sinirlari (ADR-0028) -------------------

  /**
   * Sorguyu `businessos_rls_reader` rolu KIMLIGINDE calistirir.
   *
   * `SET LOCAL ROLE` + transaction: rol yalnizca transaction boyunca gecerlidir
   * ve ROLLBACK'te kendiliginden sifirlanir — havuz baglantisini KIRLETMEZ
   * (kalici `SET ROLE`, havuzdaki bir sonraki sorguya sizardi). Ayri bir client
   * kullanilir ve daima serbest birakilir.
   */
  async function asRlsReader(sql: string): Promise<unknown> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE businessos_rls_reader');
      return await client.query(sql);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  describe('businessos_rls_reader dar rolu BASKA hicbir seye erisemez', () => {
    it('kendi fonksiyonunun okudugu tablolara SELECT verebilir (memberships, tenants)', async () => {
      // Bunlar IZINLIDIR — fonksiyonun calismasi icin gereklidir.
      await expect(
        asRlsReader('SELECT 1 FROM platform.memberships LIMIT 1'),
      ).resolves.toBeDefined();
      await expect(asRlsReader('SELECT 1 FROM platform.tenants LIMIT 1')).resolves.toBeDefined();
    });

    it('BASKA tablolara SELECT REDDEDILIR (users, credentials, refresh_tokens, outbox)', async () => {
      for (const table of ['users', 'credentials', 'refresh_tokens', 'identity_outbox']) {
        await expect(
          asRlsReader(`SELECT 1 FROM platform.${table} LIMIT 1`),
          `platform.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it('BASKA fonksiyonlara EXECUTE REDDEDILIR (resolve_tenant)', async () => {
      await expect(asRlsReader("SELECT platform.resolve_tenant('x')")).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('rol NOLOGIN ve BYPASSRLS tasir (dar ama tek yetenegi bypass)', async () => {
      const rows = await database.ownerPool.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
        "SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'businessos_rls_reader'",
      );
      expect(rows.rows[0]?.rolcanlogin).toBe(false);
      expect(rows.rows[0]?.rolbypassrls).toBe(true);
    });

    it('standing sema-yazma yetkisi TUTMAZ (CREATE gecici verilip geri alindi)', async () => {
      const rows = await database.ownerPool.query<{ create: boolean }>(
        "SELECT has_schema_privilege('businessos_rls_reader', 'platform', 'CREATE') AS create",
      );
      expect(rows.rows[0]?.create).toBe(false);
    });
  });
});
