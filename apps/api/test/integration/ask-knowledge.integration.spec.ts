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
 * `POST /api/v1/ask` — uctan uca, GERCEK OpenAI + GERCEK DeepSeek.
 *
 * ============================================================================
 * BU TEST GERCEK PARA HARCAR — anahtarlar yoksa ATLANIR
 * ============================================================================
 * Iddialarin cogu ancak GERCEK modelle anlamlidir: "baglamdan cevap veriyor",
 * "uydurmuyor", "gecmisi kullaniyor". Sahte adapter ile bunlar test EDILEMEZ —
 * `FakeLlmAdapter` bicim uretir, ANLAM uretmez.
 *
 * IKI anahtar gerekir: embedding OpenAI'dan, completion DeepSeek'ten
 * (ADR-0030 §1.3 — iki port, iki saglayici). Biri bile yoksa suite skip eder ve
 * bunu GORUNUR sekilde loglar; aksi halde "yesil" bir kosu aslinda hic
 * calismamis olurdu.
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
const HAS_KEYS = OPENAI_API_KEY !== '' && DEEPSEEK_API_KEY !== '';

if (!HAS_KEYS) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  ask-knowledge.integration ATLANDI: OPENAI_API_KEY ve/veya DEEPSEEK_API_KEY yok.\n' +
      '   RAG akisi bu kosuda GERCEK modellerle dogrulanmadi.\n',
  );
}

const PASSWORD = 'parola123';
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';

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

describe.skipIf(!HAS_KEYS)('POST /ask (uctan uca, gercek modeller)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();

    // GERCEK saglayicilar: bu testin varlik sebebi.
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = OPENAI_API_KEY;
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = DEEPSEEK_API_KEY;

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
      'TRUNCATE knowledge.daily_report_runs, platform.messages, platform.conversations, ' +
        'knowledge.note_chunks, knowledge.notes CASCADE',
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

  async function signInAs(role: string, email: string, tenantId = TENANT_A): Promise<string> {
    const { userId, identityToken } = await signUp(email);

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
      .set('Authorization', `Bearer ${identityToken}`)
      .send({ tenantId });

    return String(switched.body.accessToken);
  }

  /** Slice 2'nin akisiyla not ekler — retrieval'in bagli oldugu on kosul. */
  async function addNote(token: string, body: string, title?: string): Promise<string> {
    const response = await request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: title ?? null, body });

    if (response.status !== 201) {
      throw new Error(`Not eklenemedi: ${String(response.status)}`);
    }
    return String(response.body.noteId);
  }

  function ask(token: string | undefined, body: object) {
    const call = request(httpServer(app)).post('/api/v1/ask');
    return token === undefined
      ? call.send(body)
      : call.set('Authorization', `Bearer ${token}`).send(body);
  }

  // --- Retrieval dogrulugu (ASIL iddia) -------------------------------------

  it('BAGLAMDAKI nota dayali dogru cevap verir ve kaynagi bildirir', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    const accountingNote = await addNote(
      token,
      'Muhasebe ekibimiz her ayin son is gunu fatura kesiyor. Faturalar Logo programi uzerinden hazirlanip e-fatura olarak gonderiliyor.',
      'Fatura sureci',
    );
    await addNote(
      token,
      'Sunucularimiz Kubernetes uzerinde calisiyor ve Argo CD ile deploy ediliyor.',
    );

    const response = await ask(token, { question: 'Fatura sureci nasil isliyor?' });

    expect(response.status).toBe(200);
    // Cevap NOTTAN gelmeli: notta gecen somut bir ayrinti aranir.
    expect(String(response.body.answer).toLowerCase()).toMatch(/logo|e-fatura|son is gunu/);
    // Kaynak, retrieval'in GERCEK satirlarindan turer — model uyduramaz.
    expect(sourceIds(response.body)).toContain(accountingNote);
  }, 120_000);

  it('BAGLAMDA OLMAYAN soruda UYDURMAZ, yonlendirir', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    await addNote(token, 'Muhasebe ekibimiz her ayin son is gunu fatura kesiyor.');

    const response = await ask(token, {
      question: 'Kuzey Kutbu ndaki ofisimizde kac penguen calisiyor?',
    });

    expect(response.status).toBe(200);
    const answer = String(response.body.answer).toLowerCase();
    // Sistem promptunun 2. kurali: duz "bilmiyorum" degil, YONLENDIRME.
    expect(answer).toMatch(/not|ekle/);
    // Uydurma kontrolu: baglamda olmayan bir sayi/olgu URETILMEMELI.
    expect(answer).not.toMatch(/\bpenguen (calisiyor|var|bulunuyor)\b/);
  }, 120_000);

  // --- Konusma hafizasi (ADR-0030 §1) ---------------------------------------

  it('ilk soruda YENI konusma acar ve id sini doner', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    await addNote(token, 'Sirketimiz yazilim gelistiriyor.');

    const response = await ask(token, { question: 'Sirket ne is yapiyor?' });

    expect(response.body.conversationId).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await database.ownerPool.query('SELECT 1 FROM platform.conversations');
    expect(rows.rowCount).toBe(1);
  }, 120_000);

  it('soru ve cevap messages tablosuna yazilir', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    await addNote(token, 'Sirketimiz yazilim gelistiriyor.');

    await ask(token, { question: 'Sirket ne is yapiyor?' });

    const rows = await database.ownerPool.query<{ role: string }>(
      'SELECT role FROM platform.messages ORDER BY created_at, id',
    );
    expect(rows.rows.map((row) => row.role)).toEqual(['user', 'assistant']);
  }, 120_000);

  it('IKINCI soruda conversationId ile GECMIS gercekten kullanilir', async () => {
    const token = await signInAs('owner', 'owner@example.com');
    await addNote(
      token,
      'Muhasebe ekibimiz her ayin son is gunu fatura kesiyor. Fatura surecini ' +
        'Ayse Yilmaz yonetiyor. Ayse Yilmaz muhasebe ekibinde calisir.',
    );

    const first = await ask(token, { question: 'Fatura surecini kim yonetiyor?' });
    expect(first.status).toBe(200);

    // Takip sorusu ONCEKI TURU acikca isaret eder ve kendi basina eksiksizdir.
    // Onceki hali ("Peki o kisi hangi ekipte calisiyor?") sistem promptunun
    // hem 2. kuralina (baglamda yok -> yonlendir) hem 3. kuralina (belirsiz
    // -> netlestirici soru sor) kacis birakiyordu; test bu yuzden KARARSIZDI.
    //
    // Iddia ZAYIFLAMADI, aksine: kisinin adi YALNIZCA gecmiste gecer, notta
    // hangi kisinin sorulduguna dair bir ipucu yoktur. Gecmis gecirilmezse
    // model kimi kastettigimizi cozemez ve "muhasebe" diyemez.
    const second = await ask(token, {
      question: 'Bir onceki cevabinda adini verdigin kisi hangi ekipte calisiyor?',
      conversationId: String(first.body.conversationId),
    });

    expect(second.status).toBe(200);
    expect(second.body.conversationId).toBe(String(first.body.conversationId));
    expect(String(second.body.answer).toLowerCase()).toMatch(/muhasebe/);

    // Iki tur = dort mesaj.
    const rows = await database.ownerPool.query('SELECT 1 FROM platform.messages');
    expect(rows.rowCount).toBe(4);
  }, 180_000);

  // --- RLS: tenant izolasyonu ------------------------------------------------

  it('BASKA tenant in notu kaynak olarak GELMEZ (RLS)', async () => {
    const tokenB = await signInAs('owner', 'b@example.com', TENANT_B);
    const secretNote = await addNote(tokenB, 'B tenant inin gizli fatura sureci notu.');

    const tokenA = await signInAs('owner', 'a@example.com', TENANT_A);
    await addNote(tokenA, 'A tenant inin kendi notu: ekip uzaktan calisiyor.');

    const response = await ask(tokenA, { question: 'Fatura sureci nasil isliyor?' });

    expect(response.status).toBe(200);
    // Sorguda elle `WHERE tenant_id` YOK — daraltmayi RLS yapiyor. Bu testin
    // asil isi, o gercegin calistigini KANITLAMAK.
    expect(sourceIds(response.body)).not.toContain(secretNote);
    expect(String(response.body.answer)).not.toContain('gizli');
  }, 120_000);

  // --- Konusma sahipligi: RLS'in KAPSAMADIGI sinir --------------------------

  it('AYNI tenant taki BASKA kullanicinin conversationId si 403', async () => {
    const alice = await signInAs('owner', 'alice@example.com');
    await addNote(alice, 'Fatura surecini Ayse Yilmaz yonetiyor.');

    const first = await ask(alice, { question: 'Fatura surecini kim yonetiyor?' });
    expect(first.status).toBe(200);
    const conversationId = String(first.body.conversationId);

    // Bob ayni tenant'ta ve `knowledge:ask` izni VAR — RLS onu durdurmaz,
    // cunku konusma satiri kendi tenant'inda. Duran sey use case'deki
    // sahiplik kontrolu.
    const bob = await signInAs('member', 'bob@example.com');
    const stolen = await ask(bob, { question: 'Ne konusulmustu?', conversationId });

    expect(stolen.status).toBe(403);

    // Sessizce YENI konusma da acilmamali: 403 dondurup arka planda devam
    // etmek, hatayi kullanicidan gizlemek olurdu.
    const conversations = await database.ownerPool.query('SELECT 1 FROM platform.conversations');
    expect(conversations.rowCount).toBe(1);

    // Alice'in gecmisi buyumemis olmali (iki mesaj: soru + cevap).
    const messages = await database.ownerPool.query(
      'SELECT 1 FROM platform.messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(messages.rowCount).toBe(2);
  }, 180_000);

  it('VAR OLMAYAN conversationId 403 (500 DEGIL)', async () => {
    // Bu kontrolden once, bilinmeyen bir id T2'de yabanci anahtar ihlaline
    // dusup 500 uretiyordu — gizli bir hata.
    const token = await signInAs('owner', 'owner@example.com');

    const response = await ask(token, {
      question: 'soru',
      conversationId: '018f3a2b-7c4d-7e1f-8a2b-0000000000ff',
    });

    expect(response.status).toBe(403);
  });

  // --- Yetki ve dogrulama ---------------------------------------------------

  it('KIMLIKSIZ istek 401 (guard handler dan ONCE calisir)', async () => {
    // Kimlik YOK -> 401. Tenant secilmemis kimlik -> 403 (asagida). Ikisi
    // AYRI seylerdir: 401 tazeleme/yeniden giris tetikler, 403 tetiklememeli.
    expect((await ask(undefined, { question: 'soru' })).status).toBe(401);
  });

  it('viewer rolu 403 alir (knowledge:ask yok)', async () => {
    const token = await signInAs('viewer', 'viewer@example.com');

    expect((await ask(token, { question: 'soru' })).status).toBe(403);
  });

  it('member rolu SORABILIR', async () => {
    const token = await signInAs('member', 'member@example.com');
    await addNote(token, 'Ekip uzaktan calisiyor.');

    expect((await ask(token, { question: 'Ekip nasil calisiyor?' })).status).toBe(200);
  }, 120_000);

  it('bos soru 422', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    expect((await ask(token, { question: '   ' })).status).toBe(422);
  });

  it('gecersiz conversationId (UUID degil) 422', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    expect((await ask(token, { question: 'soru', conversationId: 'abc' })).status).toBe(422);
  });

  it('tanimsiz alan (strict govde) 422', async () => {
    const token = await signInAs('owner', 'owner@example.com');

    expect((await ask(token, { question: 'soru', systemPrompt: 'uydur' })).status).toBe(422);
  });
});
