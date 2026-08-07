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

/** `items[].title` projeksiyonu — `supertest` body'si `any`'dir. */
function followUpTitles(body: unknown): string[] {
  const items = (body as { items?: readonly { title: string }[] }).items ?? [];
  return items.map((row) => row.title);
}

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
    await database.ownerPool.query(
      'TRUNCATE crm.interaction_chunks, crm.interactions, crm.opportunities, crm.contacts, crm.companies CASCADE',
    );
    await database.ownerPool.query('TRUNCATE platform.rate_limits');
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
  // --- Firsatlar ve takipler (ADR-0031 §2, §3) ----------------------------

  function createOpportunity(token: string, companyId: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: 'Yillik sozlesme', ...body });
  }

  it('viewer firsat OKUR ama YAZAMAZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createOpportunity(owner, String(company.body.id));

    const viewer = await tokenFor('viewer');

    const read = await api()
      .get('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${viewer}`);
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    const write = await createOpportunity(viewer, String(company.body.id));
    expect(write.status).toBe(403);
  });

  it('member firsat SILEMEZ (opportunity:delete owner/admin)', async () => {
    const member = await tokenFor('member');
    const company = await createCompany(member);
    const created = await createOpportunity(member, String(company.body.id));
    expect(created.status).toBe(201);

    const deleted = await api()
      .delete(`/api/v1/crm/opportunities/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${member}`);
    expect(deleted.status).toBe(403);
  });

  it('TUTAR varsa PARA BIRIMI zorunlu -> 422', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    const response = await createOpportunity(owner, String(company.body.id), {
      estimatedValue: '250000.00',
    });

    expect(response.status).toBe(422);
  });

  it('KAYBEDILDI -> GORUSULUYOR gecisi 200 doner (asama sirasi DAYATILMAZ)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createOpportunity(owner, String(company.body.id), { stage: 'lost' });

    const reopened = await api()
      .patch(`/api/v1/crm/opportunities/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ stage: 'in_discussion' });

    expect(reopened.status).toBe(200);
    expect(reopened.body.stage).toBe('in_discussion');
  });

  it('AYNI asama tekrar gonderilince stageChangedAt DEGISMEZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createOpportunity(owner, String(company.body.id), {
      stage: 'in_discussion',
    });
    const before = String(created.body.stageChangedAt);

    const patched = await api()
      .patch(`/api/v1/crm/opportunities/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ stage: 'in_discussion', title: 'Yeni baslik' });

    // "Kac gundur bu asamada" sinyali bir no-op guncellemeyle silinemez.
    expect(String(patched.body.stageChangedAt)).toBe(before);
    expect(patched.body.title).toBe('Yeni baslik');
  });

  it('GERCEK asama degisiminde stageChangedAt ILERLER', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createOpportunity(owner, String(company.body.id), {
      stage: 'potential',
    });

    const patched = await api()
      .patch(`/api/v1/crm/opportunities/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ stage: 'proposal_sent' });

    expect(new Date(String(patched.body.stageChangedAt)).getTime()).toBeGreaterThanOrEqual(
      new Date(String(created.body.stageChangedAt)).getTime(),
    );
  });

  it('takipler KRONOLOJIK doner ve GECIKMIS olanlar DAHILDIR', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    await createOpportunity(owner, String(company.body.id), {
      title: 'Gelecek',
      nextFollowUpOn: '2026-12-01',
    });
    await createOpportunity(owner, String(company.body.id), {
      title: 'Gecikmis',
      nextFollowUpOn: '2020-01-01',
    });

    const response = await api()
      .get('/api/v1/crm/follow-ups')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    // Gecikmisler EN ONEMLILERIDIR: dislanmaz, basa gelir.
    expect(followUpTitles(response.body)).toEqual(['Gecikmis', 'Gelecek']);
  });

  it('takipler KAPANAN firsati DISLAR (kendiliginden duser)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createOpportunity(owner, String(company.body.id), {
      nextFollowUpOn: '2026-09-01',
    });

    const before = await api()
      .get('/api/v1/crm/follow-ups')
      .set('Authorization', `Bearer ${owner}`);
    expect(before.body.items).toHaveLength(1);

    await api()
      .patch(`/api/v1/crm/opportunities/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ stage: 'won' });

    const after = await api().get('/api/v1/crm/follow-ups').set('Authorization', `Bearer ${owner}`);

    // Ayri bir tabloda bunu ELLE silmek gerekirdi ve biri unutuldugunda liste
    // yalan soylerdi.
    expect(after.body.items).toHaveLength(0);
  });

  it('takipler TARIHI OLMAYAN firsati DISLAR', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createOpportunity(owner, String(company.body.id));

    const response = await api()
      .get('/api/v1/crm/follow-ups')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.body.items).toHaveLength(0);
  });

  it('firsat VAR OLMAYAN sirkete baglanamaz -> 404', async () => {
    const owner = await tokenFor('owner');
    const response = await createOpportunity(owner, nextId('9c3d'));
    expect(response.status).toBe(404);
  });
  // --- Gorusmeler + embedding (ADR-0031 §4) -------------------------------
  //
  // Bu blok CRM'in AI'a ILK KEZ dokundugu yolu kanitlar. Entegrasyon
  // ortaminda `EMBEDDING_PROVIDER=fake`'tir: vektorler sahtedir ama AKIS
  // gercektir (chunking, baglam basligi, iki transaction, parca yazimi).

  function createInteraction(token: string, companyId: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/crm/interactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        occurredOn: '2026-08-12',
        body: 'Toplanti iyi gecti, butce onaylandi.',
        ...body,
      });
  }

  it('gorusme kaydedilir ve PARCALANIR', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    const response = await createInteraction(owner, String(company.body.id));

    expect(response.status).toBe(201);
    expect(response.body.chunkCount).toBeGreaterThan(0);
  });

  it('PARCA METNI BAGLAM BASLIGI TASIR — bu slice in kritik iddiasi', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner, 'Acme Tekstil');

    // Govde "Acme" kelimesini HIC gecirmez.
    const body = 'Toplanti iyi gecti, butce onaylandi.';
    expect(body).not.toContain('Acme');

    const created = await createInteraction(owner, String(company.body.id), { body });

    const rows = await database.ownerPool.query<{ content: string }>(
      'SELECT content FROM crm.interaction_chunks WHERE interaction_id = $1',
      [String(created.body.interactionId)],
    );

    // Baslik olmasaydi "Acme ile ne konustuk?" sorusu HICBIR parcayla
    // eslesmezdi: gorusmenin kimligi FK kolonundadir, metinde degil.
    expect(rows.rows[0]?.content).toContain('Acme Tekstil');
    expect(rows.rows[0]?.content).toContain('2026-08-12');
    expect(rows.rows[0]?.content).toContain('butce onaylandi');
  });

  it('viewer gorusme OKUR ama YAZAMAZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    const viewer = await tokenFor('viewer');

    const read = await api()
      .get('/api/v1/crm/interactions')
      .set('Authorization', `Bearer ${viewer}`);
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    const write = await createInteraction(viewer, String(company.body.id));
    expect(write.status).toBe(403);
  });

  it('gorusme VAR OLMAYAN sirkete baglanamaz -> 404', async () => {
    const owner = await tokenFor('owner');
    const response = await createInteraction(owner, nextId('9c3d'));
    expect(response.status).toBe(404);
  });

  it('BOS govde 422', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const response = await createInteraction(owner, String(company.body.id), { body: '   ' });
    expect(response.status).toBe(422);
  });

  it('gorusmeler companyId ile filtrelenir', async () => {
    const owner = await tokenFor('owner');
    const first = await createCompany(owner, 'Birinci');
    const second = await createCompany(owner, 'Ikinci');

    await createInteraction(owner, String(first.body.id), { body: 'Birinci gorusme' });
    await createInteraction(owner, String(second.body.id), { body: 'Ikinci gorusme' });

    const filtered = await api()
      .get(`/api/v1/crm/interactions?companyId=${String(first.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].body).toBe('Birinci gorusme');
  });

  // --- Yeniden indeksleme — ILK GUNDEN (ADR-0029 dersinin karsiligi) ------

  it('parcasiz gorusme TESPIT edilir ve ONARILIR', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createInteraction(owner, String(company.body.id));

    // Parcalari silerek "parcasiz gorusme" durumunu uret — T1 commit olduktan
    // sonra embedding cokerse ortaya cikan durumun aynisi.
    await database.ownerPool.query('DELETE FROM crm.interaction_chunks WHERE interaction_id = $1', [
      String(created.body.interactionId),
    ]);

    const before = await api()
      .get('/api/v1/crm/interactions/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(before.body.count).toBe(1);

    const repaired = await api()
      .post('/api/v1/crm/reindex')
      .set('Authorization', `Bearer ${owner}`);
    expect(repaired.status).toBe(200);
    expect(repaired.body.repaired).toBe(1);

    const after = await api()
      .get('/api/v1/crm/interactions/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(after.body.count).toBe(0);
  });

  it('onarilan parca da BAGLAM BASLIGI tasir', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner, 'Acme Tekstil');
    const created = await createInteraction(owner, String(company.body.id));

    await database.ownerPool.query('DELETE FROM crm.interaction_chunks WHERE interaction_id = $1', [
      String(created.body.interactionId),
    ]);
    await api().post('/api/v1/crm/reindex').set('Authorization', `Bearer ${owner}`);

    const rows = await database.ownerPool.query<{ content: string }>(
      'SELECT content FROM crm.interaction_chunks WHERE interaction_id = $1',
      [String(created.body.interactionId)],
    );

    // Denormalizasyonun telafisi budur: sirket adi degisirse reindex duzeltir.
    expect(rows.rows[0]?.content).toContain('Acme Tekstil');
  });

  it('viewer reindex CAGIRAMAZ (interaction:create yok)', async () => {
    const viewer = await tokenFor('viewer');
    const response = await api()
      .post('/api/v1/crm/reindex')
      .set('Authorization', `Bearer ${viewer}`);
    expect(response.status).toBe(403);
  });

  it('gorusme payi ASILINCA 429 doner ve gorusme YAZILMAZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    // Kovayi doldur: `create_interaction` AYRI bir kovadir.
    await database.ownerPool.query(
      `INSERT INTO platform.rate_limits (tenant_id, user_id, action, window_start, request_count)
       SELECT $1, u.id, 'create_interaction', date_trunc('hour', now()), 100000
       FROM platform.users u LIMIT 1`,
      [TENANT_A],
    );

    const response = await createInteraction(owner, String(company.body.id));
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  });
});
