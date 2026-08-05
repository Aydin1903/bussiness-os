import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { TARGET_CHUNK_CHARS } from '../../src/shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../src/shared/embedding.port';
import { APP_PASSWORD, APP_ROLE } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * `POST /api/v1/knowledge/notes` — uctan uca, GERCEK OpenAI ile (ADR-0029 §4).
 *
 * ============================================================================
 * BU TEST GERCEK PARA HARCAR — ve anahtar yoksa ATLANIR
 * ============================================================================
 * `EmbeddingPort`'un OpenAI implementasyonu ancak gercek bir cagriyla
 * kanitlanir; sahte adapter ile test etmek `OpenAiEmbeddingAdapter`'i hic
 * sinamazdi ve ADR-0007'nin kabul testi ("yeni saglayici = yalnizca yeni
 * adapter") dogrulanmamis kalirdi.
 *
 * CI'da `OPENAI_API_KEY` YOKTUR ve olmamalidir (her push'ta ucret). Bu yuzden
 * test anahtar yoksa `skip` eder — ama SESSIZCE degil: atlandigi konsola
 * yazilir, aksi halde "yesil" bir kosu aslinda hic calismamis olurdu.
 * ============================================================================
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? '';
const HAS_OPENAI_KEY = OPENAI_API_KEY !== '';

if (!HAS_OPENAI_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  create-note.integration ATLANDI: OPENAI_API_KEY yok.\n' +
      '   OpenAiEmbeddingAdapter bu kosuda GERCEK bir cagriyla dogrulanmadi.\n',
  );
}

const PASSWORD = 'parola123';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';

describe.skipIf(!HAS_OPENAI_KEY)('POST /knowledge/notes (uctan uca, gercek OpenAI)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    // Uygulama RLS'e TABI olan `businessos_app` rolu ile baglanir — container'in
    // superuser'i DEGIL. Aksi halde RLS bypass edilir ve tenant izolasyonu
    // iddiasi anlamsizlasir (rbac-memberships testiyle ayni gerekce).
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();

    // GERCEK saglayici: bu testin varlik sebebi.
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;

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
      'TRUNCATE knowledge.daily_report_runs, knowledge.note_chunks, knowledge.notes CASCADE',
    );
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  let seq = 0;
  function nextId(): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${String(seq).padStart(12, '0')}`;
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

  /** Belirtilen rolde bir kullanici kurar ve access token'ini doner. */
  async function signInAs(role: string, email: string): Promise<string> {
    const { userId, identityToken } = await signUp(email);

    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'acme', 'ACME', 'active', $2)
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, userId],
    );
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, $4, 'active', now())`,
      [nextId(), TENANT_ID, userId, role],
    );

    const switched = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId: TENANT_ID });

    return String(switched.body.accessToken);
  }

  function createNote(token: string | undefined, body: object) {
    const call = request(httpServer(app)).post('/api/v1/knowledge/notes');
    return token === undefined
      ? call.send(body)
      : call.set('Authorization', `Bearer ${token}`).send(body);
  }

  interface ChunkRow {
    readonly chunk_index: number;
    readonly content: string;
    readonly dims: number;
    readonly tenant_id: string;
  }

  /** Chunk'lari sahip rolle, tenant context'i altinda okur (RLS FORCE). */
  async function readChunks(): Promise<ChunkRow[]> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${TENANT_ID}'`);
      const rows = await client.query<ChunkRow>(
        `SELECT chunk_index, content, vector_dims(embedding) AS dims, tenant_id
         FROM knowledge.note_chunks ORDER BY chunk_index`,
      );
      return rows.rows;
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  // --- Mutlu yol ------------------------------------------------------------

  it('notu kaydeder ve 201 + noteId + chunkCount doner', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    const response = await createNote(token, {
      title: 'Ilk not',
      body: 'Sirketimiz yazilim gelistiriyor.',
    });

    expect(response.status).toBe(201);
    expect(response.body.noteId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.chunkCount).toBe(1);
  });

  it('not GERCEKTEN veritabanina yazilir', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    const response = await createNote(token, { title: 'Baslik', body: 'Govde metni.' });

    const rows = await database.ownerPool.query<{ title: string; body: string; tenant_id: string }>(
      'SELECT title, body, tenant_id FROM knowledge.notes WHERE id = $1',
      [String(response.body.noteId)],
    );
    expect(rows.rows[0]?.title).toBe('Baslik');
    expect(rows.rows[0]?.body).toBe('Govde metni.');
    expect(rows.rows[0]?.tenant_id).toBe(TENANT_ID);
  });

  it('chunk GERCEK 1536 boyutlu embedding ile yazilir', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    await createNote(token, { body: 'Transactional outbox deseni event teslimini garantiler.' });

    const chunks = await readChunks();
    expect(chunks).toHaveLength(1);
    // ASIL IDDIA: bu vektor gercek OpenAI'dan geldi ve boyutu dogru.
    expect(chunks[0]?.dims).toBe(EMBEDDING_DIMENSIONS);
    expect(chunks[0]?.tenant_id).toBe(TENANT_ID);
  });

  it('uzun metin BIRDEN FAZLA chunk uretir, hepsi gercek embedding tasir', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    const paragraph = 'Kurumsal hafiza modulun var olus sebebidir. '.repeat(40);

    const response = await createNote(token, { body: `${paragraph}\n\n${paragraph}` });

    expect(response.body.chunkCount).toBeGreaterThan(1);
    const chunks = await readChunks();
    expect(chunks).toHaveLength(Number(response.body.chunkCount));
    expect(chunks.every((chunk) => chunk.dims === EMBEDDING_DIMENSIONS)).toBe(true);
    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(chunks.map((_, index) => index));
    expect(chunks.every((chunk) => chunk.content.length <= TARGET_CHUNK_CHARS)).toBe(true);
  });

  it('anlamsal arama CALISIYOR — gercek embedding ler anlam tasiyor', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    await createNote(token, { body: 'Muhasebe ekibimiz fatura kesme surecini yonetiyor.' });
    await createNote(token, { body: 'Sunucularimiz Kubernetes uzerinde calisiyor.' });

    // "fatura" sorusuna en yakin chunk, muhasebe notu olmali — sahte
    // embedding'lerle bu iddia ANLAMSIZ olurdu; gercek vektorler gerekiyor.
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${TENANT_ID}'`);
      const target = await client.query<{ content: string }>(
        `SELECT content FROM knowledge.note_chunks
         ORDER BY embedding <=> (
           SELECT embedding FROM knowledge.note_chunks WHERE content ILIKE '%fatura%' LIMIT 1
         ) LIMIT 1`,
      );
      expect(target.rows[0]?.content).toContain('fatura');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  // --- Tembel seed (ADR-0030 §2) -------------------------------------------

  it('ilk notta daily_report_runs satiri OLUSUR', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    await createNote(token, { body: 'Bugunun ilk notu.' });

    const rows = await database.ownerPool.query<{ tenant_id: string; report_date: string }>(
      'SELECT tenant_id, report_date FROM knowledge.daily_report_runs',
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.tenant_id).toBe(TENANT_ID);
  });

  it('IKINCI notta TEKRAR OLUSMAZ (idempotency — ADR-0030 §2.1)', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    await createNote(token, { body: 'Birinci not.' });
    await createNote(token, { body: 'Ikinci not.' });

    // `ON CONFLICT (tenant_id, report_date) DO NOTHING` — ikinci yazim sessizce
    // atlanir ve not kaydi ETKILENMEZ.
    const rows = await database.ownerPool.query('SELECT 1 FROM knowledge.daily_report_runs');
    expect(rows.rowCount).toBe(1);

    const notes = await database.ownerPool.query('SELECT 1 FROM knowledge.notes');
    expect(notes.rowCount).toBe(2);
  });

  it('satir BEKLEYEN olarak olusur (generated_at bos)', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    await createNote(token, { body: 'Not.' });

    const rows = await database.ownerPool.query<{
      generated_at: Date | null;
      attempt_count: number;
    }>('SELECT generated_at, attempt_count FROM knowledge.daily_report_runs');
    expect(rows.rows[0]?.generated_at).toBeNull();
    expect(rows.rows[0]?.attempt_count).toBe(0);
  });

  // --- Yetki ve dogrulama ---------------------------------------------------

  it('KIMLIKSIZ istek 401 (guard handler dan ONCE calisir)', async () => {
    // ESKI DAVRANIS 403'TU ve bu yorum onu "tutarlilik" diye savunuyordu:
    // "semantik olarak 401 daha dogru olurdu, ama davranis TUM RBAC korumali
    // uclarda tutarlidir". Tespit yarim dogruydu — Knowledge uclari kendi
    // arasinda tutarliydi ama `/me/memberships` ile DEGILDI ve asil kiyas
    // noktasi oydu. Faz 4 kapanis denetiminde olculdu, `PermissionGuard`
    // duzeltildi: kimlik yoksa 401, kimlik varsa ama tenant secilmemisse 403.
    const response = await createNote(undefined, { body: 'metin' });

    expect(response.status).toBe(401);
  });

  it('KIMLIK token i (tenant secilmemis) ile 403', async () => {
    const { identityToken } = await signUp('notenant@example.com');

    // Kimlik token'i `tenant` claim'i TASIMAZ (ADR-0020 asama 1); tenant verisi
    // yazmak icin switch-tenant'tan gecmis bir access token gerekir.
    const response = await createNote(identityToken, { body: 'metin' });

    expect(response.status).toBe(403);
  });

  it('viewer rolu 403 alir (note:create yok)', async () => {
    const token = await signInAs('viewer', 'viewer@example.com');

    const response = await createNote(token, { body: 'metin' });

    expect(response.status).toBe(403);
  });

  it('member rolu YAZABILIR', async () => {
    const token = await signInAs('member', 'member@example.com');

    const response = await createNote(token, { body: 'Uye notu.' });

    expect(response.status).toBe(201);
  });

  it('bos govde 422', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    expect((await createNote(token, { body: '' })).status).toBe(422);
  });

  it('tanimsiz alan (strict govde) 422', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    const response = await createNote(token, { body: 'metin', tenantId: TENANT_ID });

    expect(response.status).toBe(422);
  });
});
