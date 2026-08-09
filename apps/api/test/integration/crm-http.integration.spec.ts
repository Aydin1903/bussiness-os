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
      'TRUNCATE crm.company_summaries, crm.interaction_chunks, crm.interactions, crm.opportunities, crm.contacts, crm.companies CASCADE',
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

  /**
   * ============================================================================
   * `order=priority` — GECIKMIS ONCE, SONRA EN SON GUNCELLENEN
   * ============================================================================
   * Hat (pipeline) sutun basina yalnizca birkac kart gosterir; hangi birkaci
   * oldugunu bu siralama belirler. Siralama ISTEMCIDE yapilsaydi, cekilen
   * sayfanin DISINDA kalan gecikmis bir firsat hic gorunmezdi ve "gecikmis
   * once" iddiasi sessizce yanlis olurdu.
   */
  it('order=priority GECIKMIS takipli firsati basa alir', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const id = String(company.body.id);

    // Once "yeni" olani olustur ki `recent` siralamasinda o basta olsun.
    await createOpportunity(owner, id, { title: 'Gecikmis', nextFollowUpOn: '2020-01-01' });
    await createOpportunity(owner, id, { title: 'Yeni ama gecikmemis' });

    const recent = await api()
      .get('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${owner}`);
    const priority = await api()
      .get('/api/v1/crm/opportunities?order=priority')
      .set('Authorization', `Bearer ${owner}`);

    const titles = (body: unknown): string[] =>
      (body as { items: { title: string }[] }).items.map((i) => i.title);

    // VARSAYILAN degismedi: en yeni once.
    expect(titles(recent.body)[0]).toBe('Yeni ama gecikmemis');
    // `priority`: gecikmis olan basa gecti.
    expect(titles(priority.body)[0]).toBe('Gecikmis');
  });

  it('order=priority esitlikte EN SON GUNCELLENENI ustte tutar', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const id = String(company.body.id);

    const first = await createOpportunity(owner, id, { title: 'Once acilan' });
    await createOpportunity(owner, id, { title: 'Sonra acilan' });

    // Ilk firsata DOKUN: `updated_at` ilerler.
    await api()
      .patch(`/api/v1/crm/opportunities/${String(first.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ title: 'Once acilan (guncellendi)' });

    const response = await api()
      .get('/api/v1/crm/opportunities?order=priority')
      .set('Authorization', `Bearer ${owner}`);

    const items: { title: string }[] = response.body.items;
    // Ikincil anahtar `updated_at`: `created_at` olsaydi dun guncellenen ama
    // aylar once acilmis bir firsat dibe duserdi.
    expect(items[0]?.title).toBe('Once acilan (guncellendi)');
  });

  it('gecersiz order degeri 422', async () => {
    const owner = await tokenFor('owner');

    const response = await api()
      .get('/api/v1/crm/opportunities?order=bilinmeyen')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(422);
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

  /**
   * ============================================================================
   * `companyName` — LISTE PROJEKSIYONLARINDA JOIN ILE GELIR (Slice 8b)
   * ============================================================================
   * Hat ve takipler SIRKETLER ARASI gorunumlerdir: her satir hangi sirkete ait
   * oldugunu SOYLEMEK zorundadir. Alternatif — istemcinin tum sirketleri cekip
   * id->ad haritasi kurmasi — her ekrana fazladan bir cagri ekler ve 100
   * sirketi asan tenant'ta satirin sirketini GOSTEREMEZDI.
   *
   * `companyId` KALDIRILMADI: id baglanti icin, ad gosterim icin gerekli.
   */
  it('takipler sirket ADINI da doner — id ile BIRLIKTE', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner, 'Kuzey Mimarlik');
    await createOpportunity(owner, String(company.body.id), { nextFollowUpOn: '2026-09-01' });

    const response = await api()
      .get('/api/v1/crm/follow-ups')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    expect(response.body.items[0].companyName).toBe('Kuzey Mimarlik');
    expect(response.body.items[0].companyId).toBe(String(company.body.id));
  });

  it('firsat listesi sirket ADINI doner ve HER satirda dogru sirketi gosterir', async () => {
    const owner = await tokenFor('owner');
    const kuzey = await createCompany(owner, 'Kuzey Mimarlik');
    const bati = await createCompany(owner, 'Bati Yapi');

    await createOpportunity(owner, String(kuzey.body.id), { title: 'Kuzey anlasmasi' });
    await createOpportunity(owner, String(bati.body.id), { title: 'Bati anlasmasi' });

    const response = await api()
      .get('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);

    // Satir->sirket eslesmesi TEK TEK dogrulanir: join yanlis kolonu
    // baglasaydi iki satir da ayni adi tasir ve "alan var" testi yine gecerdi.
    const items: { title: string; companyName: string }[] = response.body.items;
    const byTitle = new Map(items.map((item) => [item.title, item.companyName]));

    expect(byTitle.get('Kuzey anlasmasi')).toBe('Kuzey Mimarlik');
    expect(byTitle.get('Bati anlasmasi')).toBe('Bati Yapi');
  });

  it('sirket adi degisince liste YENI adi doner (kopya DEGIL, join)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner, 'Eski Unvan');
    await createOpportunity(owner, String(company.body.id));

    await api()
      .patch(`/api/v1/crm/companies/${String(company.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Yeni Unvan' });

    const response = await api()
      .get('/api/v1/crm/opportunities')
      .set('Authorization', `Bearer ${owner}`);

    // Ad firsat satirina KOPYALANSAYDI burada hala "Eski Unvan" yazardi —
    // ikinci bir dogruluk kaynagi ve zamanla yalan soyleyen bir alan.
    expect(response.body.items[0].companyName).toBe('Yeni Unvan');
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

  /**
   * ============================================================================
   * `lastInteractionOn` — SON TEMAS, TURETILMIS (Slice 9-B)
   * ============================================================================
   * `crm.companies`te "son temas" kolonu YOKTUR; deger her sorguda
   * `crm.interactions`tan turer. Kaliciya yazmak ikinci bir dogruluk kaynagi
   * yaratirdi ve gorusme silindiginde/tarihi degistiginde kart yalan soylerdi.
   */
  it('musteri listesi SON TEMAS gununu doner', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    await createInteraction(owner, String(company.body.id), { occurredOn: '2026-08-01' });
    await createInteraction(owner, String(company.body.id), { occurredOn: '2026-08-09' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    // EN SON gorusme — ilk eklenen degil, en buyuk `occurred_on`.
    expect(response.body.items[0].lastInteractionOn).toBe('2026-08-09');
  });

  /**
   * `LEFT` semantigi: `INNER JOIN` olsaydi yeni eklenmis her musteri listede
   * HIC gorunmezdi — sessizce kaybolan kayitlar.
   */
  it('hic gorusmesi olmayan musteri listede KALIR, degeri `null` olur', async () => {
    const owner = await tokenFor('owner');
    await createCompany(owner, 'Gorusmesiz Musteri');

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe('Gorusmesiz Musteri');
    expect(response.body.items[0].lastInteractionOn).toBeNull();
  });

  /**
   * `occurred_on`, `created_at` DEGIL: dun yapilan bir gorusme bugun
   * yazilabilir. Kullanicinin sordugu soru "en son ne zaman konustuk".
   */
  it('SON TEMAS gorusmenin OLDUGU gundur, kaydedildigi gun degil', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    // BUGUN kaydedilen ama GECMISTE gerceklesen gorusme.
    await createInteraction(owner, String(company.body.id), { occurredOn: '2020-03-04' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.body.items[0].lastInteractionOn).toBe('2020-03-04');
  });

  it('BASKA musterinin gorusmesi son temasi ETKILEMEZ', async () => {
    const owner = await tokenFor('owner');
    const sessiz = await createCompany(owner, 'Sessiz');
    const aktif = await createCompany(owner, 'Aktif');

    await createInteraction(owner, String(aktif.body.id), { occurredOn: '2026-08-09' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    const byName = new Map(
      (response.body.items as { name: string; lastInteractionOn: string | null }[]).map((item) => [
        item.name,
        item.lastInteractionOn,
      ]),
    );

    expect(byName.get('Aktif')).toBe('2026-08-09');
    expect(byName.get('Sessiz')).toBeNull();
    expect(String(sessiz.body.id)).not.toBe(String(aktif.body.id));
  });

  /**
   * ============================================================================
   * KART SAYAÇLARI — yetkili + ACIK firsat (Slice 9-B, yogunluk 2)
   * ============================================================================
   * Musteri karti 720px genisliginde ve iki kisa satirla seyrek gorunuyordu.
   * Sayaclar karti "dolduran" susler DEGIL: "kac yetkilisi var, kac acik isim
   * var" musteri listesine bakarken gercekten sorulan sorulardir.
   */
  it('musteri listesi yetkili ve ACIK firsat sayilarini doner', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const id = String(company.body.id);

    await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: id, fullName: 'Ayse Kaya' });
    await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: id, fullName: 'Mehmet Uz' });

    await createOpportunity(owner, id, { title: 'Acik is', stage: 'in_discussion' });
    await createOpportunity(owner, id, { title: 'Kazanilan', stage: 'won' });
    await createOpportunity(owner, id, { title: 'Kaybedilen', stage: 'lost' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    expect(response.body.items[0].contactCount).toBe(2);
    // KAPANMISLAR SAYILMAZ: sorulan soru "su an kac isim var", "toplam kac is
    // yaptik" degil. Uc firsat var ama yalnizca biri acik.
    expect(response.body.items[0].openOpportunityCount).toBe(1);
  });

  it('hicbiri yoksa sayaclar SIFIR doner — `null` degil', async () => {
    const owner = await tokenFor('owner');
    await createCompany(owner);

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    // Gruplanmis sayim yalnizca EN AZ BIR satiri olan musteriyi dondurur;
    // haritada bulunmayan icin sifire dusulur.
    expect(response.body.items[0].contactCount).toBe(0);
    expect(response.body.items[0].openOpportunityCount).toBe(0);
  });

  it('sayaclar SAYIDIR — `count` sonucu metne kaymaz', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: String(company.body.id), fullName: 'Ayse Kaya' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    // `::int` olmadan surucu `bigint`i STRING dondururdu ve ekranda "1" yerine
    // tirnakli bir deger olurdu.
    expect(typeof response.body.items[0].contactCount).toBe('number');
  });

  it('BASKA musterinin yetkilisi/firsati sayaca girmez', async () => {
    const owner = await tokenFor('owner');
    const bos = await createCompany(owner, 'Bos Musteri');
    const dolu = await createCompany(owner, 'Dolu Musteri');

    await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: String(dolu.body.id), fullName: 'Ayse Kaya' });
    await createOpportunity(owner, String(dolu.body.id), { stage: 'potential' });

    const response = await api()
      .get('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${owner}`);

    const items: { name: string; contactCount: number; openOpportunityCount: number }[] =
      response.body.items;
    const byName = new Map(items.map((item) => [item.name, item]));

    expect(byName.get('Dolu Musteri')?.contactCount).toBe(1);
    expect(byName.get('Dolu Musteri')?.openOpportunityCount).toBe(1);
    expect(byName.get('Bos Musteri')?.contactCount).toBe(0);
    expect(byName.get('Bos Musteri')?.openOpportunityCount).toBe(0);
    expect(String(bos.body.id)).not.toBe(String(dolu.body.id));
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

  // --- Musteri ozeti (ADR-0032) -------------------------------------------
  //
  // ⚠️ `LLM_PROVIDER=fake` ortaminda kosar: cevap SAHTEDIR ama AKIS gercektir
  // (onbellek, israf freni, claim, izinler, cascade). Metnin KALITESI burada
  // test edilmez ve edilemez — o gercek saglayici testine aittir.

  function getSummary(token: string, companyId: string) {
    return api()
      .get(`/api/v1/crm/companies/${companyId}/summary`)
      .set('Authorization', `Bearer ${token}`);
  }

  function generateSummary(token: string, companyId: string) {
    return api()
      .post(`/api/v1/crm/companies/${companyId}/summary`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('ozet hic uretilmemisse GET bos doner — 404 DEGIL', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    const response = await getSummary(owner, String(company.body.id));

    expect(response.status).toBe(200);
    expect(response.body.summary).toBeNull();
    // Hic gorusme yok: arayuz uretme dugmesini KAPATIR.
    expect(response.body.summarizable).toBe(false);
    // "Yok" ile "bayat" AYRI durumlar.
    expect(response.body.stale).toBe(false);
  });

  it('gorusme YOKSA uretim 422 — model cagrilmaz, satir bile ACILMAZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    const response = await generateSummary(owner, String(company.body.id));

    expect(response.status).toBe(422);

    const rows = await database.ownerPool.query(
      'SELECT count(*)::int AS n FROM crm.company_summaries',
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('gorusme varsa ozet URETILIR ve GET onu onbellekten doner', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    const created = await generateSummary(owner, String(company.body.id));
    expect(created.status).toBe(200);
    expect(created.body.regenerated).toBe(true);
    expect(created.body.summary).toBeTruthy();
    expect(created.body.stale).toBe(false);

    const cached = await getSummary(owner, String(company.body.id));
    expect(cached.body.summary).toBe(created.body.summary);
    expect(cached.body.generatedAt).toBeTruthy();
  });

  it('ISRAF FRENI: kaynaklar degismediyse ikinci POST yeniden URETMEZ', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    const first = await generateSummary(owner, String(company.body.id));
    const second = await generateSummary(owner, String(company.body.id));

    expect(second.status).toBe(200);
    expect(second.body.regenerated).toBe(false);
    expect(second.body.summary).toBe(first.body.summary);
  });

  it('yeni gorusme ozeti BAYAT yapar ve yeniden uretim tetikler', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));
    await generateSummary(owner, String(company.body.id));

    await createInteraction(owner, String(company.body.id));

    const stale = await getSummary(owner, String(company.body.id));
    expect(stale.body.stale).toBe(true);

    const regenerated = await generateSummary(owner, String(company.body.id));
    expect(regenerated.body.regenerated).toBe(true);
    expect(regenerated.body.stale).toBe(false);
  });

  it('claim TAZE iken ikinci istek 409 alir — model iki kez cagrilmaz', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    // Suren bir uretimi taklit et. `generated_at` NULL kalir, yani israf
    // freni devreye GIRMEZ ve istek gercekten claim'e kadar gelir.
    await database.ownerPool.query(
      `INSERT INTO crm.company_summaries (company_id, tenant_id, generating_at)
       VALUES ($1, $2, now())`,
      [String(company.body.id), TENANT_A],
    );

    const response = await generateSummary(owner, String(company.body.id));

    expect(response.status).toBe(409);
  });

  it('BAYAT claim uretimi ENGELLEMEZ — coken istek satiri kilitli birakmaz', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    // Iki dakikadan eski bir claim OLU sayilir; elle mudahale gerekmez.
    await database.ownerPool.query(
      `INSERT INTO crm.company_summaries (company_id, tenant_id, generating_at)
       VALUES ($1, $2, now() - interval '10 minutes')`,
      [String(company.body.id), TENANT_A],
    );

    const response = await generateSummary(owner, String(company.body.id));

    expect(response.status).toBe(200);
    expect(response.body.regenerated).toBe(true);
  });

  it('viewer ozeti OKUR ama URETEMEZ (company:summarize yok)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));
    await generateSummary(owner, String(company.body.id));

    const viewer = await tokenFor('viewer');

    // Okumak BEDAVA: viewer gorusmeleri zaten okuyabiliyor.
    const read = await getSummary(viewer, String(company.body.id));
    expect(read.status).toBe(200);
    expect(read.body.summary).toBeTruthy();

    // Uretmek PARA harcar.
    const write = await generateSummary(viewer, String(company.body.id));
    expect(write.status).toBe(403);
  });

  it('kimliksiz istek 401', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);

    const response = await api().get(`/api/v1/crm/companies/${String(company.body.id)}/summary`);

    expect(response.status).toBe(401);
  });

  it('ozet payi ASILINCA 429 — AYRI kova (`generate_company_summary`)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));

    // `create_interaction` kovasi DOKUNULMADAN doldurulur: ayri kova olduklari
    // ancak boyle kanitlanir.
    await database.ownerPool.query(
      `INSERT INTO platform.rate_limits (tenant_id, user_id, action, window_start, request_count)
       SELECT $1, u.id, 'generate_company_summary', date_trunc('hour', now()), 100000
       FROM platform.users u LIMIT 1`,
      [TENANT_A],
    );

    const response = await generateSummary(owner, String(company.body.id));
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('sirket silinince ozeti de gider (cascade)', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createInteraction(owner, String(company.body.id));
    await generateSummary(owner, String(company.body.id));

    await api()
      .delete(`/api/v1/crm/companies/${String(company.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .expect(204);

    const rows = await database.ownerPool.query(
      'SELECT count(*)::int AS n FROM crm.company_summaries',
    );
    // Silinen musteri AI'in hafizasinda YASAMAYA DEVAM ETMEZ (ADR-0031 §1).
    expect(rows.rows[0]?.n).toBe(0);
  });
});
