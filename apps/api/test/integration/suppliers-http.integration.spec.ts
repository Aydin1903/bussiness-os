import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { MAX_INTERACTION_BODY_CHARS } from '../../src/modules/suppliers/domain/supplier-interaction.entity';
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
 * Tedarikci uclari — RBAC + RLS + embedding zinciri UCTAN UCA (ADR-0040).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — ADR-0037 VE ADR-0039'UN ORTAK DERSI
 * ============================================================================
 * Iki kapanis denetimi de ayni seyi buldu: kusurlar YALNIZCA GERCEK BIR HTTP
 * ISTEGIYLE gorundu. ADR-0037'de uc kusur (multipart `.optional()`, projeksiyona
 * gomulu alt sorgu, ham `Readable`), ADR-0039'da bir kusur (negatif esik 422
 * yerine HAM 500). Dordu de birim testleriyle GORUNMUYORDU.
 *
 * Bu modulun kendine ozgu iddialari:
 *
 *   1. ⚠️ **ROTA SIRASI**: `GET /suppliers/contacts` istegi `GET /suppliers/:id`
 *      tarafindan GOLGELENMEMELI. Golgelenseydi `contacts` bir UUID sanilir ve
 *      422 donerdi — ekran calisir, hicbir test kirmizi yanmaz.
 *   2. ⚠️ **Katalog GENIS**: `viewer` OKUR, `member` YAZAR ama SILEMEZ.
 *   3. ⚠️ **Izin adlari NITELENMIS**: CRM'in `contact:read` / `interaction:read`
 *      izinleri TEK SATIR DEGISMEDI.
 *   4. ⚠️ **FK yonleri ZIT**: tedarikci silinince gorusmeler GIDER (KVKK),
 *      kisi silinince KALIR.
 *   5. ⚠️ **Sinir asan metin 422**, sessiz kirpma yok; takvimde olmayan gun de
 *      422 — HAM 500 DEGIL.
 *   6. ⚠️ **`staleAfterRename`**: ad degisince vektorler bayatlar ve bunu
 *      kullaniciya SOYLERIZ.
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

function idOf(body: unknown): string {
  return String((body as { id?: string }).id);
}

describe('Tedarikci uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    // Hermetiklik: gelistiricinin `.env`'i gercek bir saglayici yaziyorsa
    // testler PARA HARCARDI. ⚠️ Bu modul her gorusmede embedding uretir.
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
      'TRUNCATE suppliers.interactions, suppliers.contacts, suppliers.suppliers CASCADE',
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
    const user = await signUp(`${role}-${String(seq)}-sup@example.com`);
    await createTenant(tenantId, user.userId);
    await addMembership(tenantId, user.userId, role);
    return accessToken(user.identityToken, tenantId);
  }

  function api() {
    return request(httpServer(app));
  }

  function createSupplier(token: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yildiz Civata', ...body });
  }

  function createInteraction(
    token: string,
    supplierId: string,
    body: Record<string, unknown> = {},
  ) {
    return api()
      .post('/api/v1/suppliers/interactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        occurredOn: '2026-08-21',
        body: 'fiyat listesi guncellendi, M8 vidada %6 zam',
        ...body,
      });
  }

  // --- ⚠️ ROTA SIRASI — bu modulun EN SESSIZ riski ------------------------

  describe('⚠️ ROTA SIRASI: sabit yollar `:id` TARAFINDAN GOLGELENMIYOR', () => {
    it('`GET /suppliers/contacts` bir UUID sanilmiyor', async () => {
      // ⚠️ Golgelenseydi `contacts` `idParamSchema`ya duser ve 422 donerdi:
      // ekran calisir, hicbir test kirmizi yanmaz. Bu tam olarak `crm.module.ts`
      // in yorumla isaretledigi tuzaktir — burada TEK CONTROLLER + SABIT YOLLAR
      // ONCE ile kokten kesildi.
      const token = await tokenFor('owner');
      const supplier = await createSupplier(token);

      const response = await api()
        .get(`/api/v1/suppliers/contacts?supplierId=${idOf(supplier.body)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [] });
    });

    it('`GET /suppliers/interactions` bir UUID sanilmiyor', async () => {
      const token = await tokenFor('owner');

      const response = await api()
        .get('/api/v1/suppliers/interactions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ items: [], total: 0 });
    });

    it('`POST /suppliers/reindex` bir UUID sanilmiyor', async () => {
      const token = await tokenFor('owner');

      const response = await api()
        .post('/api/v1/suppliers/reindex')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ repaired: 0, failed: 0 });
    });

    it('`GET /suppliers/:id` HALA CALISIYOR — sabit yollar onu kirmadi', async () => {
      const token = await tokenFor('owner');
      const supplier = await createSupplier(token);

      const response = await api()
        .get(`/api/v1/suppliers/${idOf(supplier.body)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ name: 'Yildiz Civata' });
    });
  });

  // --- ⚠️ KATALOG GENIS (ADR-0040 §5.2) -----------------------------------

  it('kimliksiz istek 401 alir', async () => {
    expect((await api().get('/api/v1/suppliers')).status).toBe(401);
    expect((await api().get('/api/v1/suppliers/interactions')).status).toBe(401);
  });

  it.each(['owner', 'admin', 'member', 'viewer'])('%s tedarikcileri OKUR', async (role) => {
    // ⚠️ Finans'in DAR katalogunun bilincli karsiti: kimden mal alindigi
    // PAYLASILAN bir operasyonel gercektir. Siparis veren, teslimati
    // karsilayan kisi TAM OLARAK `member`dir.
    const token = await tokenFor(role);

    expect(
      (await api().get('/api/v1/suppliers').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);
  });

  it.each(['owner', 'admin', 'member'])('%s tedarikci YAZAR', async (role) => {
    const token = await tokenFor(role);

    const created = await createSupplier(token);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Yildiz Civata' });
  });

  it('viewer YAZAMAZ (403)', async () => {
    const token = await tokenFor('viewer');

    expect((await createSupplier(token)).status).toBe(403);
  });

  it('viewer GORUSME de YAZAMAZ (403)', async () => {
    const owner = await tokenFor('owner');
    const supplier = await createSupplier(owner);

    const viewerUser = await signUp(`viewer-int-${String(seq)}-sup@example.com`);
    await addMembership(TENANT_A, viewerUser.userId, 'viewer');
    const viewer = await accessToken(viewerUser.identityToken, TENANT_A);

    expect((await createInteraction(viewer, idOf(supplier.body))).status).toBe(403);
  });

  it('⚠️ member YAZAR ama SILEMEZ — ayrim gercektir', async () => {
    // Silme GERI ALINAMAZ ve AI HAFIZASINDAN DA SILER (cascade zinciri
    // vektorleri goturur). "Bir gorusme kaydedebilir" ile "bir tedarikciyi ve
    // TUM gecmisini silebilir" farkli yetkilerdir.
    const owner = await tokenFor('owner');
    const supplier = await createSupplier(owner);

    const memberUser = await signUp(`member-del-${String(seq)}-sup@example.com`);
    await addMembership(TENANT_A, memberUser.userId, 'member');
    const member = await accessToken(memberUser.identityToken, TENANT_A);

    const patched = await api()
      .patch(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${member}`)
      .send({ phone: '0216' });
    expect(patched.status).toBe(200);

    const removed = await api()
      .delete(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${member}`);
    expect(removed.status).toBe(403);
  });

  // --- ⚠️ DOGRULAMA KAPILARI ----------------------------------------------

  it('⚠️ AYNI VERGI NO KUCUK HARFLE -> 409, ham 500 DEGIL (§1.1)', async () => {
    const token = await tokenFor('owner');
    await createSupplier(token, { taxNumber: 'TR-1234567890' });

    const duplicate = await createSupplier(token, {
      name: 'Baska Firma',
      taxNumber: 'tr-1234567890',
    });

    expect(duplicate.status).toBe(409);
    expect(String(duplicate.body.detail)).toMatch(/duyarsiz/);
  });

  it('⚠️ SINIR ASAN GORUSME METNI -> 422 ve HICBIR KAYIT ACILMAZ (§2.2)', async () => {
    // SESSIZ KIRPMA YASAK: kirpsaydi kullanici metninin yarisinin arandigini
    // HIC ogrenemezdi.
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);

    const response = await createInteraction(token, idOf(supplier.body), {
      body: 'x'.repeat(MAX_INTERACTION_BODY_CHARS + 1),
    });

    expect(response.status).toBe(422);

    const rows = await database.ownerPool.query<{ n: string }>(
      'SELECT count(*) AS n FROM suppliers.interactions',
    );
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });

  it('⚠️ TAKVIMDE OLMAYAN GUN -> 422, HAM 500 DEGIL', async () => {
    // Zod yalnizca KALIBI dogrular; `2026-02-31` onu GECER. Domain kontrolu
    // olmasaydi deger veritabanina kadar gider ve kullanici 500 alirdi —
    // ADR-0039'un negatif esik kusurunun AYNI SEKLI.
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);

    const response = await createInteraction(token, idOf(supplier.body), {
      occurredOn: '2026-02-31',
    });

    expect(response.status).toBe(422);
  });

  it('sinir asan odeme kosullari -> 422', async () => {
    const token = await tokenFor('owner');

    expect((await createSupplier(token, { paymentTerms: 'x'.repeat(201) })).status).toBe(422);
  });

  it('taninmayan alan -> 422 (`.strict()`)', async () => {
    const token = await tokenFor('owner');

    expect((await createSupplier(token, { stage: 'negotiation' })).status).toBe(422);
  });

  it('olmayan tedarikciye gorusme -> 404', async () => {
    const token = await tokenFor('owner');

    const response = await createInteraction(token, '018f3a2b-7c4d-7e1f-8a2b-00000000dead');
    expect(response.status).toBe(404);
  });

  it('⚠️ BASKA TEDARIKCININ KISISI -> 404 — FK bunu YAKALAMAZ (§1.3)', async () => {
    // Sema ici FK yalnizca "boyle bir kisi var mi" der, "bu tedarikcinin mi"
    // demez. Ayirt edilseydi, baska bir tedarikcide o id'nin VAR OLDUGU
    // sizardi.
    const token = await tokenFor('owner');
    const a = await createSupplier(token, { name: 'A' });
    const b = await createSupplier(token, { name: 'B' });

    const contactOfB = await api()
      .post('/api/v1/suppliers/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: idOf(b.body), fullName: 'B nin kisisi' });

    const response = await createInteraction(token, idOf(a.body), {
      contactId: idOf(contactOfB.body),
    });

    expect(response.status).toBe(404);
  });

  // --- ⚠️ FK YONLERI — iki ZIT karar (§1.3) --------------------------------

  it('⚠️ TEDARIKCI SILININCE gorusmeler de GIDER — KVKK girdisi', async () => {
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);
    await createInteraction(token, idOf(supplier.body));

    const removed = await api()
      .delete(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const rows = await database.ownerPool.query<{ n: string }>(
      'SELECT count(*) AS n FROM suppliers.interactions',
    );
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });

  it('⚠️ KISI SILININCE gorusme KAYDI KALIR (`SET NULL`)', async () => {
    // Ayrilan bir satin alma sorumlusunun silinmesi kurumsal hafizayi
    // goturseydi hata SESSIZ olurdu.
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);
    const contact = await api()
      .post('/api/v1/suppliers/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: idOf(supplier.body), fullName: 'Ahmet' });

    await createInteraction(token, idOf(supplier.body), { contactId: idOf(contact.body) });

    const removed = await api()
      .delete(`/api/v1/suppliers/contacts/${idOf(contact.body)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const list = await api()
      .get('/api/v1/suppliers/interactions')
      .set('Authorization', `Bearer ${token}`);

    expect(list.body).toMatchObject({ total: 1 });
    expect((list.body as { items: { contactId: string | null }[] }).items[0]?.contactId).toBeNull();
  });

  // --- ⚠️ AD DEGISIMI VE ONARIM (§6) ---------------------------------------

  it('⚠️ AD DEGISINCE `staleAfterRename: true` — kullaniciya SOYLENIR', async () => {
    // Ad BAGLAM BASLIGINA girer ama AYRI SATIRDA yasar: yeniden adlandirma o
    // tedarikcinin TUM gorusme vektorlerini bayatlatir. Sessizce birakmak,
    // "arama neden bulmuyor" sorusunu cevapsiz birakirdi.
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token, { name: 'Eski Ad' });

    const patched = await api()
      .patch(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yeni Ad' });

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ staleAfterRename: true });
  });

  it('ad DEGISMEDIYSE `staleAfterRename: false`', async () => {
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);

    const patched = await api()
      .patch(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0216' });

    expect(patched.body).toMatchObject({ staleAfterRename: false });
  });

  it('⚠️ `reindex` GERCEKTEN VEKTOR YAZAR — ad tazelenir', async () => {
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token, { name: 'Eski Ad' });
    await createInteraction(token, idOf(supplier.body));

    await api()
      .patch(`/api/v1/suppliers/${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yeni Ad' });

    const repaired = await api()
      .post('/api/v1/suppliers/reindex')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: idOf(supplier.body) });

    expect(repaired.body).toMatchObject({ repaired: 1, failed: 0 });
  });

  it('olmayan tedarikci icin `reindex` -> 404, sessizce "0" DEGIL', async () => {
    const token = await tokenFor('owner');

    const response = await api()
      .post('/api/v1/suppliers/reindex')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: '018f3a2b-7c4d-7e1f-8a2b-00000000dead' });

    expect(response.status).toBe(404);
  });

  // --- ⚠️ EMBEDDING ZINCIRI ------------------------------------------------

  it('⚠️ GORUSME YAZILINCA VEKTOR GERCEKTEN OLUSUR', async () => {
    const token = await tokenFor('owner');
    const supplier = await createSupplier(token);
    const created = await createInteraction(token, idOf(supplier.body));

    expect(created.status).toBe(201);

    const rows = await database.ownerPool.query<{ has_embedding: boolean }>(
      'SELECT embedding IS NOT NULL AS has_embedding FROM suppliers.interactions WHERE id = $1',
      [idOf(created.body)],
    );
    expect(rows.rows[0]?.has_embedding).toBe(true);
  });

  it('⚠️ TEDARIKCI YAZMAK HICBIR VEKTOR URETMEZ — sayac EMBEDDING sayar', async () => {
    const token = await tokenFor('owner');
    await createSupplier(token);

    const rows = await database.ownerPool.query<{ n: string }>(
      "SELECT count(*) AS n FROM platform.rate_limits WHERE action = 'suppliers_embedding'",
    );
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });

  // --- ⚠️ IZIN ADLARI: CRM'E DOKUNULMADI (§5.1) ---------------------------

  it('⚠️ CRM in `contact:read` / `interaction:read` izinleri DEGISMEDI', async () => {
    // Nitelemeseydik ya CRM ile ayni izni paylasirdik (SESSIZ YETKI
    // GENISLEMESI: musteri kisilerini goren tedarikci kisilerini de gorurdu) ya
    // da CRM'in iznini yeniden adlandirirdik (BREAKING CHANGE).
    //
    // Bu iddia ayni istekte iki modulu birden gezerek gosterilir: token AYNI,
    // iki uc de 200 doner ve ikisi FARKLI izinlerden gecer.
    const token = await tokenFor('owner');

    expect(
      (await api().get('/api/v1/crm/contacts').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);

    const supplier = await createSupplier(token);
    const supplierContacts = await api()
      .get(`/api/v1/suppliers/contacts?supplierId=${idOf(supplier.body)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(supplierContacts.status).toBe(200);
  });

  // --- ⚠️ RLS: HTTP UZERINDEN ---------------------------------------------

  it('⚠️ BASKA TENANT IN TEDARIKCISI GORUNMEZ — 404 (yok/senin degil ayirt EDILMEZ)', async () => {
    const tenantB = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';
    const ownerA = await tokenFor('owner');
    const supplierA = await createSupplier(ownerA, { name: 'A nin tedarikcisi' });

    const userB = await signUp(`owner-b-${String(seq)}-sup@example.com`);
    await createTenant(tenantB, userB.userId);
    await addMembership(tenantB, userB.userId, 'owner');
    const ownerB = await accessToken(userB.identityToken, tenantB);

    const read = await api()
      .get(`/api/v1/suppliers/${idOf(supplierA.body)}`)
      .set('Authorization', `Bearer ${ownerB}`);
    expect(read.status).toBe(404);

    const list = await api().get('/api/v1/suppliers').set('Authorization', `Bearer ${ownerB}`);
    expect(list.body).toMatchObject({ total: 0 });
  });
});
