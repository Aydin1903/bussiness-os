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
 * Finans uclari — RBAC + RLS zinciri UCTAN UCA (ADR-0034 Slice 1).
 *
 * `crm-http` / `projects-http` ile ayni harness. Bu modulun KENDINE OZGU
 * iddialari:
 *
 *   - ⚠️ **`member` ve `viewer` HICBIR SEY goremiyor.** Projedeki ILK dar
 *     permission katalogu (ADR-0034 §7); CRM ve Projeler'de dort rolun dordu de
 *     okuma aliyordu. Bu, `POST /ask` izin filtresinin Slice 5'te ilk kez
 *     gercekten tetiklenecek olmasinin ON KOSULUDUR — ve burada, izin
 *     katmaninda dogrudan sinaniyor.
 *   - Ad tekilligi 409 doner ve ARSIVLENMIS kayit da cakisir.
 *   - `direction` bir `PATCH` govdesinde KABUL EDILMEZ (sessizce yok sayilmaz).
 *   - Arsivlenmis kategori varsayilan listede GORUNMEZ.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';

/** `items[].name` projeksiyonu — `supertest` body'si `any`'dir. */
function names(body: unknown): string[] {
  const items = (body as { items?: readonly { name: string }[] }).items ?? [];
  return items.map((row) => row.name);
}

describe('Finans uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    // Hermetiklik: gelistiricinin `.env`'i gercek bir saglayici yaziyorsa
    // testler para harcardi (`projects-http`in ayni karari).
    process.env.EMBEDDING_PROVIDER = 'fake';

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
      'TRUNCATE finance.commentary_chunks, finance.commentaries, finance.transactions, finance.categories CASCADE',
    );
    await database.ownerPool.query('TRUNCATE platform.rate_limits');
    // Cross-modul testleri gercek CRM/Projeler kayitlari uretiyor (ADR-0034 §4).
    await database.ownerPool.query(
      'TRUNCATE projects.progress_note_chunks, projects.progress_notes, projects.tasks, projects.projects CASCADE',
    );
    await database.ownerPool.query(
      'TRUNCATE crm.interaction_chunks, crm.interactions, crm.opportunities, crm.contacts, crm.companies CASCADE',
    );
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

  async function tokenFor(role: string, tenantId = TENANT_A): Promise<string> {
    const user = await signUp(`${role}-${String(seq)}-f@example.com`);
    await createTenant(tenantId, user.userId);
    await addMembership(tenantId, user.userId, role);
    return accessToken(user.identityToken, tenantId);
  }

  function api() {
    return request(httpServer(app));
  }

  function createCategory(token: string, body: Record<string, unknown>) {
    return api()
      .post('/api/v1/finance/categories')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function listCategories(token: string, query = '') {
    return api().get(`/api/v1/finance/categories${query}`).set('Authorization', `Bearer ${token}`);
  }

  // --- ⚠️ PROJEDEKI ILK DAR KATALOG (ADR-0034 §7) -------------------------

  function createTransaction(token: string, body: Record<string, unknown>) {
    return api()
      .post('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        direction: 'expense',
        amount: '1500',
        currency: 'TRY',
        occurredOn: '2026-08-01',
        ...body,
      });
  }

  it.each(['member', 'viewer'])('%s finansi HIC GOREMEZ — okuma da 403', async (role) => {
    // ⚠️ BU, BU MODULUN EN AYIRT EDICI IDDIASIDIR ve `projects-http`in
    // "viewer OKUR ama YAZAMAZ" testinin BILINCLI KARSITIDIR.
    //
    // Sirketin nakit akisi, musteri listesiyle ayni hassasiyette degildir.
    // Bunun mimari yan etkisi Slice 5'te gorunecek: `POST /ask`in izin filtresi
    // bugune kadar HIC gercekten tetiklenmedi (dort rol de her kaynagi
    // goruyordu); bu satirlar o tetikcinin var oldugunu SIMDIDEN kanitliyor.
    const token = await tokenFor(role);

    const read = await listCategories(token);
    expect(read.status).toBe(403);

    const write = await createCategory(token, { name: 'Kira', direction: 'expense' });
    expect(write.status).toBe(403);

    // ⚠️ ISLEM UCLARI DA kapali — kategori kapali ama islem acik olsaydi, dar
    // katalogun butun anlami kaybolurdu: nakit akisi zaten islemlerdedir.
    const readTx = await api()
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token}`);
    expect(readTx.status).toBe(403);

    const writeTx = await createTransaction(token, {});
    expect(writeTx.status).toBe(403);

    // ⚠️ OZET DE kapali. Ozet, islemlerden TURETILMIS bir bilgidir; acik
    // birakilsaydi `transaction:read` tasimayan biri sirketin nakit akisini
    // TOPLAM uzerinden okurdu — dar katalogun butun anlami kaybolurdu.
    const summary = await api()
      .get('/api/v1/finance/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(403);

    // Yorumlar da kapali — modulun AI'a bakan yuzeyi de dar katalogun icinde.
    const commentaries = await api()
      .get('/api/v1/finance/commentaries')
      .set('Authorization', `Bearer ${token}`);
    expect(commentaries.status).toBe(403);
  });

  it.each(['owner', 'admin'])('%s okur ve yazar', async (role) => {
    const token = await tokenFor(role);

    const created = await createCategory(token, { name: 'Kira', direction: 'expense' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Kira', direction: 'expense', isArchived: false });

    const read = await listCategories(token);
    expect(read.status).toBe(200);
    expect(names(read.body)).toEqual(['Kira']);
  });

  it('kimliksiz istek 401 alir', async () => {
    const response = await api().get('/api/v1/finance/categories');
    expect(response.status).toBe(401);
  });

  // --- Ad tekilligi (ADR-0034 §3b) ----------------------------------------

  it('AYNI ad + AYNI yon 409 doner', async () => {
    const owner = await tokenFor('owner');
    await createCategory(owner, { name: 'Kira', direction: 'expense' });

    const again = await createCategory(owner, { name: 'kira', direction: 'expense' });

    // Buyuk/kucuk harf duyarsiz: "Kira" ve "kira" ayni kategoridir, yoksa
    // toplamlar SESSIZCE bolunurdu.
    expect(again.status).toBe(409);
  });

  it('AYNI ad FARKLI yonde kabul edilir', async () => {
    const owner = await tokenFor('owner');
    await createCategory(owner, { name: 'Danismanlik', direction: 'expense' });

    const income = await createCategory(owner, { name: 'Danismanlik', direction: 'income' });
    expect(income.status).toBe(201);
  });

  it('ARSIVLENMIS bir kategoriyle de cakisir — ve mesaj bunu SOYLER', async () => {
    // Kullanici listede GORMEDIGI bir satirla cakisiyor; mesaj arsivi anmasaydi
    // "ama boyle bir kategori yok" diye dusunurdu.
    const owner = await tokenFor('owner');
    const created = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    await api()
      .patch(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ isArchived: true });

    const again = await createCategory(owner, { name: 'Kira', direction: 'expense' });

    expect(again.status).toBe(409);
    expect(String(again.body.detail)).toMatch(/arsivlenmis/i);
  });

  // --- Arsivleme (ADR-0034 §3e) -------------------------------------------

  it('arsivlenmis kategori VARSAYILAN listede GORUNMEZ, includeArchived ile gorunur', async () => {
    const owner = await tokenFor('owner');
    const created = await createCategory(owner, { name: 'Eski kalem', direction: 'expense' });
    await createCategory(owner, { name: 'Yeni kalem', direction: 'expense' });

    await api()
      .patch(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ isArchived: true });

    // Varsayilan: listenin birincil tuketicisi "yeni kayitta hangi kategoriyi
    // secebilirim" sorusudur.
    const visible = await listCategories(owner);
    expect(names(visible.body)).toEqual(['Yeni kalem']);

    const all = await listCategories(owner, '?includeArchived=true');
    expect(names(all.body)).toEqual(['Eski kalem', 'Yeni kalem']);
  });

  // --- Yon degistirilemez (ADR-0034 §3c) ----------------------------------

  it('PATCH govdesinde direction REDDEDILIR — sessizce yok SAYILMAZ', async () => {
    // ⚠️ Iddia "yon degismedi" DEGIL, "istek reddedildi". `.strict()` olmasaydi
    // istemci yonu degistirdigini SANIR ve 200 alirdi — sessiz bir yalan.
    const owner = await tokenFor('owner');
    const created = await createCategory(owner, { name: 'Kira', direction: 'expense' });

    const response = await api()
      .patch(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ direction: 'income' });

    expect(response.status).toBe(422);

    const after = await api()
      .get(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(after.body.direction).toBe('expense');
  });

  it('GECERSIZ yon 422 doner', async () => {
    const owner = await tokenFor('owner');
    const response = await createCategory(owner, { name: 'Transfer', direction: 'transfer' });
    expect(response.status).toBe(422);
  });

  // --- RLS: tenant siniri ucta da tutuyor ---------------------------------

  it('baska tenant in kategorisi 404 — "yok" ile "senin degil" AYIRT EDILMEZ', async () => {
    const ownerA = await tokenFor('owner', TENANT_A);
    const created = await createCategory(ownerA, { name: 'A nin kalemi', direction: 'expense' });

    const ownerB = await tokenFor('owner', TENANT_B);
    const response = await api()
      .get(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${ownerB}`);

    // 403 degil 404: ayirmak, o id'nin baska bir tenant'ta VAR OLDUGUNU
    // sizdirirdi (P2 disiplini).
    expect(response.status).toBe(404);

    const list = await listCategories(ownerB);
    expect(names(list.body)).toEqual([]);
  });

  // --- Silme --------------------------------------------------------------

  // --- Islemler (ADR-0034 §2, §3c) ----------------------------------------

  it('tutar ve para birimi KANONIK bicimde donuyor', async () => {
    const owner = await tokenFor('owner');

    const created = await createTransaction(owner, { amount: '1500.5', currency: 'try' });

    expect(created.status).toBe(201);
    // ⚠️ Yanit, veritabanindan okunacak degerle AYNI gorunmeli: `"1500.5"`
    // yazip `"1500.50"` okumak, istemcide sessiz bir tutarsizlik uretirdi.
    expect(created.body).toMatchObject({ amount: '1500.50', currency: 'TRY' });
  });

  it('SAYI olarak gonderilen tutar kabul edilir', async () => {
    // JSON'da ondalik tip yok; sayiyi reddetmek her naif istemciyi kirardi.
    const owner = await tokenFor('owner');

    const created = await createTransaction(owner, { amount: 250.4 });

    expect(created.status).toBe(201);
    expect(created.body.amount).toBe('250.40');
  });

  it.each([
    ['0', 'sifir'],
    ['-5', 'negatif'],
    ['1.234', 'ikiden fazla ondalik'],
  ])('tutar %s reddedilir (%s)', async (amount) => {
    const owner = await tokenFor('owner');
    const response = await createTransaction(owner, { amount });
    expect(response.status).toBe(422);
  });

  it('VAR OLMAYAN takvim gunu 422 doner — 500 DEGIL', async () => {
    // ⚠️ Kalip kontrolu yetmez: `2026-02-31` regex'i gecer ve PostgreSQL'e
    // ulasirsa 500 uretirdi.
    const owner = await tokenFor('owner');
    const response = await createTransaction(owner, { occurredOn: '2026-02-31' });
    expect(response.status).toBe(422);
  });

  it('TERS yondeki kategori 422 doner ve mesaj ACIKLAYICI', async () => {
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });

    const response = await createTransaction(owner, {
      direction: 'income',
      categoryId: String(category.body.id),
    });

    expect(response.status).toBe(422);
    // Veritabani da bunu reddederdi ama mesaji kriptik olurdu; uygulamanin isi
    // tam olarak ANLASILIR mesaji uretmek.
    expect(String(response.body.detail)).toMatch(/yon/i);
  });

  it('ARSIVLENMIS kategori YENI kayitta secilemez', async () => {
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Eski kalem', direction: 'expense' });
    await api()
      .patch(`/api/v1/finance/categories/${String(category.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ isArchived: true });

    const response = await createTransaction(owner, { categoryId: String(category.body.id) });

    expect(response.status).toBe(422);
  });

  it('YALNIZCA YON degistiren PATCH, mevcut kategoriyi yeniden dogrular', async () => {
    // ⚠️ Bu, use case testinin uctan uca karsiligi: kullanici kategoriye HIC
    // dokunmuyor ama degisiklik onu gecersiz kiliyor.
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    const created = await createTransaction(owner, { categoryId: String(category.body.id) });

    const response = await api()
      .patch(`/api/v1/finance/transactions/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ direction: 'income' });

    expect(response.status).toBe(422);
  });

  it('KULLANIMDAKI kategori silinemez — 409 ve ARSIVLEME onerilir', async () => {
    // ⚠️ Slice 1'de bu yol URETILEMIYORDU (isaret eden tablo yoktu) ve
    // `CategoryInUseError` "bugun tetiklenemez" notuyla yazilmisti. Artik
    // gercek bir istekle kanitlaniyor.
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    await createTransaction(owner, { categoryId: String(category.body.id) });

    const response = await api()
      .delete(`/api/v1/finance/categories/${String(category.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(409);
    expect(String(response.body.detail)).toMatch(/arsivle/i);
  });

  it('liste TARIH ARALIGI ile filtrelenir (sinirlar DAHIL)', async () => {
    const owner = await tokenFor('owner');
    await createTransaction(owner, { amount: '10', occurredOn: '2026-07-31' });
    await createTransaction(owner, { amount: '20', occurredOn: '2026-08-01' });
    await createTransaction(owner, { amount: '30', occurredOn: '2026-08-31' });
    await createTransaction(owner, { amount: '40', occurredOn: '2026-09-01' });

    const response = await api()
      .get('/api/v1/finance/transactions?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${owner}`);

    const amounts = (response.body.items as { amount: string }[]).map((row) => row.amount);
    // Siralama TARIHE gore azalan; sinirlarin ikisi de DAHIL.
    expect(amounts).toEqual(['30.00', '20.00']);
    expect(response.body.total).toBe(2);
  });

  it('liste KATEGORISIZ islemleri DUSURMEZ ve kategori adini cozer', async () => {
    // ⚠️ `LEFT JOIN` zorunlulugunun kaniti: `INNER` olsaydi kategorisiz kayit
    // listeden sessizce duserdi.
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    await createTransaction(owner, {
      amount: '10',
      occurredOn: '2026-08-02',
      categoryId: String(category.body.id),
    });
    await createTransaction(owner, { amount: '20', occurredOn: '2026-08-01' });

    const response = await api()
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${owner}`);

    const rows = response.body.items as { amount: string; categoryName: string | null }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.categoryName).toBe('Kira');
    expect(rows[1]?.categoryName).toBeNull();
  });

  it('kategori adi KOLONDA saklanmaz — yeniden adlandirma ANINDA yansir', async () => {
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    await createTransaction(owner, { categoryId: String(category.body.id) });

    await api()
      .patch(`/api/v1/finance/categories/${String(category.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Ofis kirasi' });

    const response = await api()
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${owner}`);

    const rows = response.body.items as { categoryName: string | null }[];
    expect(rows[0]?.categoryName).toBe('Ofis kirasi');
  });

  // --- Cross-modul referanslar (ADR-0034 §4) ------------------------------

  function createCompany(token: string, name = 'Acme A.S.') {
    return api()
      .post('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
  }

  function createProject(token: string, name = 'Web sitesi yenileme') {
    return api()
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, status: 'in_progress' });
  }

  it('sirket ve proje adlari COZULUR — kolonda saklanmaz', async () => {
    // ⚠️ Adlar `crm.companies` ve `projects.projects`tadir; `finance`
    // semasindan okunamaz (Mutlak Kural 5). Her okumada iki PUBLIC INTERFACE
    // uzerinden cozuluyorlar.
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const project = await createProject(owner);

    await createTransaction(owner, {
      companyId: String(company.body.id),
      projectId: String(project.body.id),
    });

    const rows = (
      await api().get('/api/v1/finance/transactions').set('Authorization', `Bearer ${owner}`)
    ).body.items as { companyName: string | null; projectName: string | null }[];

    expect(rows[0]?.companyName).toBe('Acme A.S.');
    expect(rows[0]?.projectName).toBe('Web sitesi yenileme');
  });

  it('sirket YENIDEN ADLANDIRILINCA ad ANINDA yansir', async () => {
    // Kopyalanmis olsaydi bayatlardi — projede alti kez reddedilen ayni karar.
    const owner = await tokenFor('owner');
    const company = await createCompany(owner, 'Eski Unvan');
    await createTransaction(owner, { companyId: String(company.body.id) });

    await api()
      .patch(`/api/v1/crm/companies/${String(company.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Yeni Unvan' });

    const rows = (
      await api().get('/api/v1/finance/transactions').set('Authorization', `Bearer ${owner}`)
    ).body.items as { companyName: string | null }[];

    expect(rows[0]?.companyName).toBe('Yeni Unvan');
  });

  it('SILINEN sirketin isaretcisi SARKTA KALIR ve kayit AYAKTA durur', async () => {
    // ⚠️ ADR-0034 §4.2: cascade baska semaya uzanamaz. Bu VERI BOZULMASI
    // DEGILDIR (UUID yeniden kullanilmaz) — okuyan yol dayanikli olmak
    // zorundadir ve `companyName` sessizce `null` olur.
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    await createTransaction(owner, { companyId: String(company.body.id) });

    const deleted = await api()
      .delete(`/api/v1/crm/companies/${String(company.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(deleted.status).toBe(204);

    const list = await api()
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${owner}`);

    // Kayit 500 vermiyor, listeden DUSMUYOR; yalnizca ad cozulemiyor.
    expect(list.status).toBe(200);
    const rows = list.body.items as { companyId: string | null; companyName: string | null }[];
    expect(rows[0]?.companyId).toBe(String(company.body.id));
    expect(rows[0]?.companyName).toBeNull();
  });

  it('GORULEMEYEN sirkete kayit baglanamaz — 404', async () => {
    // ⚠️ "Yok", "baska tenant'in" ve "izin yok" AYIRT EDILMEZ; reddin
    // sebebinden o sirketin VAR OLDUGU cikarilamaz.
    const owner = await tokenFor('owner');

    const response = await createTransaction(owner, {
      companyId: '018f3a2b-7c4d-7e1f-8a2b-00000000ffff',
    });

    expect(response.status).toBe(404);
  });

  it('BASKA TENANT in projesine kayit baglanamaz', async () => {
    const ownerA = await tokenFor('owner', TENANT_A);
    const project = await createProject(ownerA);

    const ownerB = await tokenFor('owner', TENANT_B);
    const response = await createTransaction(ownerB, { projectId: String(project.body.id) });

    expect(response.status).toBe(404);
  });

  it('null gondermek BAGLANTIYI KALDIRIR', async () => {
    const owner = await tokenFor('owner');
    const company = await createCompany(owner);
    const created = await createTransaction(owner, { companyId: String(company.body.id) });

    const response = await api()
      .patch(`/api/v1/finance/transactions/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ companyId: null });

    expect(response.status).toBe(200);
    expect(response.body.companyId).toBeNull();
  });

  // --- Nakit akisi ozeti (ADR-0034 §5) ------------------------------------

  function summary(token: string, query = '') {
    return api().get(`/api/v1/finance/summary${query}`).set('Authorization', `Bearer ${token}`);
  }

  it('⚠️ FARKLI PARA BIRIMLERI TOPLANMAZ — her biri KENDI satirini alir', async () => {
    // ADR-0034 §5.1'in uctan uca kaniti. Tek bir "net" rakami dondurmek,
    // 2000 TRY + 2000 USD = 4000 gibi kullanicinin GOREMEYECEGI bir yanlis
    // uretirdi.
    const owner = await tokenFor('owner');
    await createTransaction(owner, { direction: 'income', amount: '12000', currency: 'TRY' });
    await createTransaction(owner, { direction: 'expense', amount: '8500.50', currency: 'TRY' });
    await createTransaction(owner, { direction: 'expense', amount: '1200', currency: 'USD' });

    const response = await summary(owner);

    expect(response.status).toBe(200);
    const rows = response.body.currencies as {
      currency: string;
      income: string;
      expense: string;
      net: string;
    }[];

    expect(rows).toEqual([
      { currency: 'TRY', income: '12000.00', expense: '8500.50', net: '3499.50', categories: null },
      { currency: 'USD', income: '0.00', expense: '1200.00', net: '-1200.00', categories: null },
    ]);
  });

  it('gelirsiz bir para biriminde income "0.00" doner — null DEGIL', async () => {
    // ⚠️ `COALESCE` + `numeric(20,2)` ikilisinin kaniti. `FILTER` hicbir satiri
    // tutmayinca `SUM` NULL doner ve istemci `null` ile `"0.00"`i ayirt etmek
    // zorunda kalirdi; olcek verilmeseydi de `"0"` gelirdi.
    const owner = await tokenFor('owner');
    await createTransaction(owner, { direction: 'expense', amount: '10', currency: 'USD' });

    const rows = (await summary(owner)).body.currencies as { income: string }[];
    expect(rows[0]?.income).toBe('0.00');
  });

  it('TARIH ARALIGI uygulanir (sinirlar DAHIL)', async () => {
    const owner = await tokenFor('owner');
    await createTransaction(owner, { amount: '10', occurredOn: '2026-07-31' });
    await createTransaction(owner, { amount: '20', occurredOn: '2026-08-01' });
    await createTransaction(owner, { amount: '30', occurredOn: '2026-08-31' });
    await createTransaction(owner, { amount: '40', occurredOn: '2026-09-01' });

    const rows = (await summary(owner, '?from=2026-08-01&to=2026-08-31')).body.currencies as {
      expense: string;
    }[];

    expect(rows[0]?.expense).toBe('50.00');
  });

  it('BOS aralik BOS DIZI doner — uydurulmus sifir satiri YOK', async () => {
    const owner = await tokenFor('owner');
    await createTransaction(owner, { amount: '10', occurredOn: '2026-08-01' });

    const response = await summary(owner, '?from=2027-01-01&to=2027-01-31');

    expect(response.body.currencies).toEqual([]);
  });

  it('kirilim VARSAYILAN OLARAK gelmez (categories: null)', async () => {
    const owner = await tokenFor('owner');
    await createTransaction(owner, { amount: '10' });

    const rows = (await summary(owner)).body.currencies as { categories: unknown }[];
    expect(rows[0]?.categories).toBeNull();
  });

  it('kirilim istendiginde KATEGORISIZ satir da GORUNUR', async () => {
    // ⚠️ Elenseydi kategori toplamlari para birimi toplamini TUTMAZ ve fark
    // SESSIZ olurdu (ADR-0034 §3d).
    const owner = await tokenFor('owner');
    const category = await createCategory(owner, { name: 'Kira', direction: 'expense' });
    await createTransaction(owner, { amount: '5000', categoryId: String(category.body.id) });
    await createTransaction(owner, { amount: '3500.50' });

    const rows = (await summary(owner, '?includeCategories=true')).body.currencies as {
      expense: string;
      categories: { categoryId: string | null; categoryName: string | null; total: string }[];
    }[];

    // Kirilim toplami, para birimi toplamini TUTAR.
    expect(rows[0]?.expense).toBe('8500.50');
    expect(rows[0]?.categories).toEqual([
      {
        categoryId: String(category.body.id),
        categoryName: 'Kira',
        direction: 'expense',
        total: '5000.00',
      },
      { categoryId: null, categoryName: null, direction: 'expense', total: '3500.50' },
    ]);
  });

  it('gecersiz aralik (from > to) 422 doner', async () => {
    const owner = await tokenFor('owner');
    const response = await summary(owner, '?from=2026-09-01&to=2026-08-01');
    expect(response.status).toBe(422);
  });

  it('ozet BASKA TENANT in verisini gormez', async () => {
    const ownerA = await tokenFor('owner', TENANT_A);
    await createTransaction(ownerA, { amount: '999' });

    const ownerB = await tokenFor('owner', TENANT_B);
    const response = await summary(ownerB);

    expect(response.body.currencies).toEqual([]);
  });

  // --- Finansal yorumlar (ADR-0034 §6.1) -----------------------------------

  function createCommentary(token: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/finance/commentaries')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Mart ta nakit sikisti, tahsilat gecikti.', ...body });
  }

  it('yorum kaydedilir ve INDEKSLENIR', async () => {
    const owner = await tokenFor('owner');

    const response = await createCommentary(owner, { occurredOn: '2026-03-31' });

    expect(response.status).toBe(201);
    // `chunkCount: 0` olsaydi yorum ARANABILIR DEGIL demekti.
    expect(response.body.chunkCount).toBeGreaterThan(0);
  });

  it('occurredOn verilmezse BUGUNE duser', async () => {
    const owner = await tokenFor('owner');
    await createCommentary(owner);

    const list = await api()
      .get('/api/v1/finance/commentaries')
      .set('Authorization', `Bearer ${owner}`);

    const today = new Date().toISOString().slice(0, 10);
    expect((list.body.items as { occurredOn: string }[])[0]?.occurredOn).toBe(today);
  });

  it('DONEM araligi ile filtrelenir (occurred_on uzerinde)', async () => {
    // ⚠️ Filtre `created_at` degil `occurred_on`: yorum bir DONEM hakkindadir
    // ve Nisan'da Mart icin yazilir.
    const owner = await tokenFor('owner');
    await createCommentary(owner, { occurredOn: '2026-02-28', body: 'Subat' });
    await createCommentary(owner, { occurredOn: '2026-03-31', body: 'Mart' });
    await createCommentary(owner, { occurredOn: '2026-04-30', body: 'Nisan' });

    const list = await api()
      .get('/api/v1/finance/commentaries?from=2026-03-01&to=2026-03-31')
      .set('Authorization', `Bearer ${owner}`);

    expect((list.body.items as { body: string }[]).map((row) => row.body)).toEqual(['Mart']);
  });

  it('BOS yorum 422 doner', async () => {
    const owner = await tokenFor('owner');
    expect((await createCommentary(owner, { body: '   ' })).status).toBe(422);
  });

  it('VAR OLMAYAN takvim gunu 422 doner', async () => {
    const owner = await tokenFor('owner');
    expect((await createCommentary(owner, { occurredOn: '2026-02-31' })).status).toBe(422);
  });

  it('indekslenmis yorum icin ONARIM LISTESI BOS — is listesi TURETILMISTIR', async () => {
    const owner = await tokenFor('owner');
    await createCommentary(owner);

    const unindexed = await api()
      .get('/api/v1/finance/commentaries/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(unindexed.body.count).toBe(0);

    const reindex = await api()
      .post('/api/v1/finance/reindex')
      .set('Authorization', `Bearer ${owner}`);
    expect(reindex.status).toBe(200);
    expect(reindex.body).toEqual({ repaired: 0, failed: 0 });
  });

  it('PARCASIZ yorum tespit edilir ve ONARILIR', async () => {
    // ⚠️ "Parcasiz yorum" gercek bir durumdur (ADR-0029 §4'un iki
    // transaction'li akisi). Burada parcalar ELLE silinerek o durum uretiliyor.
    const owner = await tokenFor('owner');
    const created = await createCommentary(owner);

    await database.ownerPool.query(
      'DELETE FROM finance.commentary_chunks WHERE commentary_id = $1',
      [String(created.body.commentaryId)],
    );

    const before = await api()
      .get('/api/v1/finance/commentaries/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(before.body.count).toBe(1);

    const reindex = await api()
      .post('/api/v1/finance/reindex')
      .set('Authorization', `Bearer ${owner}`);
    expect(reindex.body).toEqual({ repaired: 1, failed: 0 });

    const after = await api()
      .get('/api/v1/finance/commentaries/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(after.body.count).toBe(0);
  });

  it('ORAN SINIRI asilinca 429 ve Retry-After doner', async () => {
    // ⚠️ Sayac DOGRUDAN dolduruluyor, 30 kez istek atilmiyor: varsayilan sinir
    // 30'dur ve dongu 30 embedding cagrisi demekti. Sinanan sey sayacin nasil
    // dolduguu degil, DOLUNCA NE OLDUGUDUR.
    const owner = await tokenFor('owner');
    await createCommentary(owner);

    await database.ownerPool.query(
      `UPDATE platform.rate_limits SET request_count = 999 WHERE action = 'create_commentary'`,
    );

    const response = await createCommentary(owner);

    expect(response.status).toBe(429);
    // `Retry-After` 429'un standart tamamlayicisidir; olmadan istemci ne kadar
    // bekleyecegini bilemez ve genellikle HEMEN yeniden dener.
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('owner siler, ve olmayan kayit 404 doner', async () => {
    const owner = await tokenFor('owner');
    const created = await createCategory(owner, { name: 'Yanlis kalem', direction: 'income' });

    const removed = await api()
      .delete(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(removed.status).toBe(204);

    const again = await api()
      .delete(`/api/v1/finance/categories/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(again.status).toBe(404);
  });
});
