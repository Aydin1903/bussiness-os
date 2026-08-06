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
 * Yeniden indeksleme — ADR-0029'un "chunk siz not" bilinen sinirinin onarimi.
 *
 * GERCEK PostgreSQL: tespit bir LEFT JOIN'dir ve RLS'in IKI tabloda birden
 * calismasina dayanir — bu ancak gercek veritabaninda kanitlanir. Embedding
 * SAHTE; sinanan sey zincir, vektorun kalitesi degil.
 *
 * Kirik durum GERCEKCI uretilir: not eklenir, sonra chunk'lari silinir. Bu,
 * embedding'in T1'den SONRA cokmesiyle olusan durumun aynisidir.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000e1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000e2';
const BATCH_SIZE = 2;

/**
 * `sources` icinden id projeksiyonu (ADR-0031 §5.1).
 *
 * `supertest`'in `body`'si `any`'dir; tip DARALTMASI burada yapilir ki
 * cagri yerleri `any` tasimasin (DEVELOPMENT_RULES 2.3).
 */
function sourceIds(body: unknown): string[] {
  const sources = (body as { sources?: readonly { id: string }[] }).sources ?? [];
  return sources.map((source) => source.id);
}

describe('Yeniden indeksleme (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.LLM_PROVIDER = 'fake';
    // Kucuk batch: "tek cagri hepsini onarmaz, remaining ile devam edilir"
    // iddiasi ancak boyle gosterilebilir.
    process.env.KNOWLEDGE_REINDEX_BATCH_SIZE = String(BATCH_SIZE);

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
      'TRUNCATE platform.rate_limits, knowledge.daily_report_runs, platform.messages, ' +
        'platform.conversations, knowledge.note_chunks, knowledge.notes CASCADE',
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

  async function addNote(token: string, body: string): Promise<string> {
    const response = await request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: null, body });

    if (response.status !== 201) {
      throw new Error(`Not eklenemedi: ${String(response.status)}`);
    }
    return String(response.body.noteId);
  }

  /** Embedding'in T1'den SONRA cokmesiyle olusan durumu birebir uretir. */
  async function breakIndex(noteId: string): Promise<void> {
    await database.ownerPool.query('DELETE FROM knowledge.note_chunks WHERE note_id = $1', [
      noteId,
    ]);
  }

  function unindexed(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/knowledge/notes/unindexed');
    return token === undefined ? call.send() : call.set('Authorization', `Bearer ${token}`).send();
  }

  function reindex(token: string | undefined) {
    const call = request(httpServer(app)).post('/api/v1/knowledge/reindex');
    return token === undefined ? call.send() : call.set('Authorization', `Bearer ${token}`).send();
  }

  function chunkCount(noteId: string): Promise<number> {
    return database.ownerPool
      .query('SELECT count(*)::int AS n FROM knowledge.note_chunks WHERE note_id = $1', [noteId])
      .then((result) => Number(result.rows[0]?.n ?? 0));
  }

  // --- Tespit ----------------------------------------------------------------

  it('saglikli tenant ta sayi SIFIR', async () => {
    const token = await signInAs('owner', 'healthy@example.com');
    await addNote(token, 'Duzgun indekslenmis bir not.');

    const response = await unindexed(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 0 });
  });

  it('chunk siz not TESPIT EDILIR (LEFT JOIN)', async () => {
    const token = await signInAs('owner', 'broken@example.com');
    const noteId = await addNote(token, 'Bu notun indeksi bozulacak.');
    await breakIndex(noteId);

    expect((await unindexed(token)).body).toEqual({ count: 1 });
  });

  it('yalnizca BOZUK olanlar sayilir', async () => {
    const token = await signInAs('owner', 'mixed@example.com');
    const broken = await addNote(token, 'bozuk olacak');
    await addNote(token, 'saglam kalacak');
    await breakIndex(broken);

    expect((await unindexed(token)).body).toEqual({ count: 1 });
  });

  it('BASKA tenant in bozuk notu SAYILMAZ (RLS, iki tabloda birden)', async () => {
    const tokenB = await signInAs('owner', 'rls-b@example.com', TENANT_B);
    await breakIndex(await addNote(tokenB, 'B nin bozuk notu'));

    const tokenA = await signInAs('owner', 'rls-a@example.com', TENANT_A);

    expect((await unindexed(tokenA)).body).toEqual({ count: 0 });
    expect((await unindexed(tokenB)).body).toEqual({ count: 1 });
  });

  // --- Onarim ----------------------------------------------------------------

  it('bozuk not ONARILIR ve chunk lari geri gelir', async () => {
    const token = await signInAs('owner', 'repair@example.com');
    const noteId = await addNote(token, 'Onarilacak notun govdesi.');
    await breakIndex(noteId);
    expect(await chunkCount(noteId)).toBe(0);

    const response = await reindex(token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ repaired: 1, failed: 0, remaining: 0 });
    expect(await chunkCount(noteId)).toBeGreaterThan(0);
  });

  it('onarimdan sonra sayi SIFIRA duser', async () => {
    const token = await signInAs('owner', 'zero@example.com');
    await breakIndex(await addNote(token, 'bozuk not'));

    await reindex(token);

    expect((await unindexed(token)).body).toEqual({ count: 0 });
  });

  it('BATCH kadar onarir, remaining ile devam edilir', async () => {
    const token = await signInAs('owner', 'batch@example.com');
    for (const body of ['bir', 'iki', 'uc']) {
      await breakIndex(await addNote(token, body));
    }

    const first = await reindex(token);

    expect(first.body).toMatchObject({ repaired: BATCH_SIZE, remaining: 3 - BATCH_SIZE });

    const second = await reindex(token);
    expect(second.body).toMatchObject({ repaired: 1, remaining: 0 });
  });

  it('IKINCI onarim MUKERRER chunk yazmaz (idempotent)', async () => {
    const token = await signInAs('owner', 'idempotent@example.com');
    const noteId = await addNote(token, 'Bir not.');
    await breakIndex(noteId);

    await reindex(token);
    const afterFirst = await chunkCount(noteId);

    const second = await reindex(token);

    // Ikinci turda onarilacak bir sey YOK: not artik chunk'li.
    expect(second.body).toMatchObject({ repaired: 0, remaining: 0 });
    expect(await chunkCount(noteId)).toBe(afterFirst);
  });

  it('BASKA tenant in bozuk notu ONARILMAZ (RLS)', async () => {
    const tokenB = await signInAs('owner', 'iso-b@example.com', TENANT_B);
    const noteB = await addNote(tokenB, 'B nin notu');
    await breakIndex(noteB);

    const tokenA = await signInAs('owner', 'iso-a@example.com', TENANT_A);
    const result = await reindex(tokenA);

    expect(result.body).toMatchObject({ repaired: 0 });
    expect(await chunkCount(noteB)).toBe(0);
  });

  it('onarilacak sey yoksa 200 ve sifirlar doner', async () => {
    const token = await signInAs('owner', 'nothing@example.com');

    const response = await reindex(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ repaired: 0, failed: 0, remaining: 0 });
  });

  // --- Onarilan not GERCEKTEN aranabilir -------------------------------------

  it('onarilan not artik ARANABILIR', async () => {
    // Bu testin asil iddiasi: onarim chunk yazmakla kalmiyor, notu AI icin
    // gercekten bulunur hale getiriyor.
    const token = await signInAs('owner', 'searchable@example.com');
    const noteId = await addNote(token, 'Fatura surecini Ayse Yilmaz yonetiyor.');
    await breakIndex(noteId);

    const before = await request(httpServer(app))
      .post('/api/v1/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Fatura surecini kim yonetiyor?' });
    expect(before.body.sources).toEqual([]);

    await reindex(token);

    const after = await request(httpServer(app))
      .post('/api/v1/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Fatura surecini kim yonetiyor?' });
    expect(sourceIds(after.body)).toContain(noteId);
  });

  // --- Yetki -----------------------------------------------------------------

  it('KIMLIKSIZ istekler 401', async () => {
    expect((await unindexed(undefined)).status).toBe(401);
    expect((await reindex(undefined)).status).toBe(401);
  });

  it('viewer rolu ikisinden de 403 alir', async () => {
    const token = await signInAs('viewer', 'viewer@example.com');

    expect((await unindexed(token)).status).toBe(403);
    expect((await reindex(token)).status).toBe(403);
  });

  it('member rolu ikisini de yapabilir', async () => {
    const token = await signInAs('member', 'member@example.com');

    expect((await unindexed(token)).status).toBe(200);
    expect((await reindex(token)).status).toBe(200);
  });
});
