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
 * `GET /api/v1/knowledge/notes` — sayfali not listesi.
 *
 * GERCEK PostgreSQL (siralama, kirpma ve RLS veritabaninda olup bitiyor) +
 * SAHTE embedding. Anahtar gerektirmez, her CI kosusunda calisir.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';
const PREVIEW_LENGTH = 40;

interface ListItem {
  readonly id: string;
  readonly title: string | null;
  readonly preview: string;
  readonly bodyLength: number;
  readonly createdAt: string;
}

describe('GET /knowledge/notes (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.LLM_PROVIDER = 'fake';
    // Kucuk tutuldu: kirpma iddiasi kisa metinlerle de gosterilebilmeli.
    process.env.KNOWLEDGE_NOTE_PREVIEW_LENGTH = String(PREVIEW_LENGTH);

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
    await database.ownerPool.query(
      'TRUNCATE knowledge.rate_limits, knowledge.daily_report_runs, knowledge.messages, ' +
        'knowledge.conversations, knowledge.note_chunks, knowledge.notes CASCADE',
    );
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  let seq = 0;
  function nextId(): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${String(seq).padStart(12, '0')}`;
  }

  async function signInAs(role: string, email: string, tenantId = TENANT_A): Promise<string> {
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
    const userId = String(rows.rows[0]?.id);

    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, $2, 'Test', 'active', $3) ON CONFLICT (id) DO NOTHING`,
      [tenantId, `tenant-${tenantId.slice(-4)}`, userId],
    );
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, $4, 'active', now())`,
      [nextId(), tenantId, userId, role],
    );

    const switched = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${String(login.body.identityToken)}`)
      .send({ tenantId });

    return String(switched.body.accessToken);
  }

  async function addNote(token: string, body: string, title: string | null = null): Promise<void> {
    const response = await request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, body });

    if (response.status !== 201) {
      throw new Error(`Not eklenemedi: ${String(response.status)}`);
    }
  }

  function list(token: string | undefined, query = '') {
    const call = request(httpServer(app)).get(`/api/v1/knowledge/notes${query}`);
    return token === undefined ? call.send() : call.set('Authorization', `Bearer ${token}`).send();
  }

  function items(body: unknown): ListItem[] {
    return (body as { items: ListItem[] }).items;
  }

  // --- Siralama --------------------------------------------------------------

  it('EN YENI ONCE siralar', async () => {
    const token = await signInAs('owner', 'order@example.com');
    await addNote(token, 'birinci');
    await addNote(token, 'ikinci');
    await addNote(token, 'ucuncu');

    const response = await list(token);

    expect(response.status).toBe(200);
    expect(items(response.body).map((item) => item.preview)).toEqual([
      'ucuncu',
      'ikinci',
      'birinci',
    ]);
  });

  it('AYNI created_at te bile siralama KARARLI (tie-breaker)', async () => {
    // Onboarding yedi notu saniyeler icinde yazar. `created_at` esitliginde
    // sira sayfadan sayfaya degisseydi, sayfalamada bir not iki kez ya da hic
    // gorunurdu.
    const token = await signInAs('owner', 'stable@example.com');
    await addNote(token, 'a');
    await addNote(token, 'b');
    await addNote(token, 'c');
    await database.ownerPool.query(
      "UPDATE knowledge.notes SET created_at = '2026-08-04T10:00:00Z'",
    );

    const first = items((await list(token)).body).map((item) => item.id);
    const second = items((await list(token)).body).map((item) => item.id);

    expect(first).toEqual(second);
  });

  // --- Sayfalama -------------------------------------------------------------

  it('limit ve offset uygulanir, total TOPLAMI verir', async () => {
    const token = await signInAs('owner', 'page@example.com');
    for (const body of ['bir', 'iki', 'uc', 'dort', 'bes']) {
      await addNote(token, body);
    }

    const response = await list(token, '?limit=2&offset=2');

    expect(response.body).toMatchObject({ total: 5, limit: 2, offset: 2 });
    expect(items(response.body)).toHaveLength(2);
  });

  it('sayfalar BIRBIRIYLE ORTUSMEZ', async () => {
    const token = await signInAs('owner', 'nooverlap@example.com');
    for (const body of ['bir', 'iki', 'uc', 'dort']) {
      await addNote(token, body);
    }

    const page1 = items((await list(token, '?limit=2&offset=0')).body).map((item) => item.id);
    const page2 = items((await list(token, '?limit=2&offset=2')).body).map((item) => item.id);

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1.some((id) => page2.includes(id))).toBe(false);
  });

  it('varsayilanlar uygulanir (limit=20, offset=0)', async () => {
    const token = await signInAs('owner', 'defaults@example.com');
    await addNote(token, 'bir not');

    expect((await list(token)).body).toMatchObject({ limit: 20, offset: 0 });
  });

  it('bos tenant bos liste doner (hata DEGIL)', async () => {
    const token = await signInAs('owner', 'emptylist@example.com');

    const response = await list(token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it('offset sondan buyukse bos sayfa doner ama total DOGRU kalir', async () => {
    const token = await signInAs('owner', 'beyond@example.com');
    await addNote(token, 'tek not');

    const response = await list(token, '?limit=10&offset=100');

    expect(items(response.body)).toHaveLength(0);
    expect(response.body.total).toBe(1);
  });

  // --- Kirpma ----------------------------------------------------------------

  it('UZUN govde KIRPILIR, bodyLength TAM uzunlugu verir', async () => {
    // Kirpmanin varlik sebebi: 500.000 karakterlik bir notu listede tam
    // dondurmek megabaytlarca yanit demektir.
    const token = await signInAs('owner', 'long@example.com');
    const longBody = 'x'.repeat(PREVIEW_LENGTH * 3);
    await addNote(token, longBody);

    const item = items((await list(token)).body)[0];

    expect(item?.preview).toHaveLength(PREVIEW_LENGTH);
    expect(item?.bodyLength).toBe(PREVIEW_LENGTH * 3);
  });

  it('KISA govde OLDUGU GIBI doner', async () => {
    const token = await signInAs('owner', 'short@example.com');
    await addNote(token, 'kisa not');

    const item = items((await list(token)).body)[0];

    expect(item?.preview).toBe('kisa not');
    expect(item?.bodyLength).toBe(8);
  });

  it('baslik korunur; basliksiz notta null doner', async () => {
    const token = await signInAs('owner', 'title@example.com');
    await addNote(token, 'govde', 'Bir baslik');
    await addNote(token, 'baslksiz govde');

    const listed = items((await list(token)).body);

    expect(listed[0]?.title).toBeNull();
    expect(listed[1]?.title).toBe('Bir baslik');
  });

  it('createdAt ISO 8601 string doner', async () => {
    const token = await signInAs('owner', 'iso@example.com');
    await addNote(token, 'bir not');

    expect(items((await list(token)).body)[0]?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  // --- RLS -------------------------------------------------------------------

  it('BASKA tenant in notlari GORUNMEZ (RLS)', async () => {
    const tokenB = await signInAs('owner', 'rls-b@example.com', TENANT_B);
    await addNote(tokenB, 'B TENANTININ NOTU');

    const tokenA = await signInAs('owner', 'rls-a@example.com', TENANT_A);
    await addNote(tokenA, 'A nin notu');

    const response = await list(tokenA);

    // Sorguda elle `WHERE tenant_id` YOK — daraltmayi RLS yapiyor.
    expect(response.body.total).toBe(1);
    expect(items(response.body)[0]?.preview).toBe('A nin notu');
  });

  it('ayni tenant taki BASKA kullanicinin notu GORUNUR (not TENANT indir)', async () => {
    const alice = await signInAs('owner', 'shared-alice@example.com');
    await addNote(alice, 'Alice in notu');

    const bob = await signInAs('member', 'shared-bob@example.com');

    expect((await list(bob)).body.total).toBe(1);
  });

  // --- Dogrulama ve yetki ----------------------------------------------------

  it('gecersiz limit 422', async () => {
    const token = await signInAs('owner', 'badlimit@example.com');

    expect((await list(token, '?limit=0')).status).toBe(422);
    expect((await list(token, '?limit=999')).status).toBe(422);
  });

  it('negatif offset 422', async () => {
    const token = await signInAs('owner', 'badoffset@example.com');

    expect((await list(token, '?offset=-1')).status).toBe(422);
  });

  it('tanimsiz sorgu parametresi 422 (strict)', async () => {
    const token = await signInAs('owner', 'strict@example.com');

    expect((await list(token, '?sirala=asc')).status).toBe(422);
  });

  it('KIMLIKSIZ istek 403', async () => {
    expect((await list(undefined)).status).toBe(403);
  });

  it('viewer rolu 403 alir (note:read yok)', async () => {
    const token = await signInAs('viewer', 'viewer@example.com');

    expect((await list(token)).status).toBe(403);
  });

  it('member rolu OKUYABILIR', async () => {
    const token = await signInAs('member', 'member@example.com');

    expect((await list(token)).status).toBe(200);
  });
});
