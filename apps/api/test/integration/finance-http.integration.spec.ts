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
    await database.ownerPool.query('TRUNCATE finance.categories CASCADE');
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
