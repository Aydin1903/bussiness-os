import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { MAX_POINT_ENTRY_NOTE_CHARS } from '../../src/modules/loyalty/domain/point-entry.entity';
import { APP_PASSWORD, APP_ROLE } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Sadakat uclari — RBAC + RLS + KILIT zinciri UCTAN UCA (ADR-0051).
 *
 * ============================================================================
 * ⚠️ BU DOSYA ADR'NIN UC ZORUNLU TESTINDEN IKISINI TASIR
 * ============================================================================
 *   ZORUNLU TEST 1 — ⚠️ **ES ZAMANLILIK**: paralel harcama isteklerinin
 *   hicbiri bakiyeyi negatife dusuremez. ⚠️ Bu, modulun TEK GERCEK
 *   DEGISMEZIDIR ve ADR §4.4'e gore **VERITABANI GARANTISI YOKTUR** — bir
 *   `CHECK` satirlar arasi bir kosulu goremez. Yani bu test, korumanin
 *   KENDISINI test eder: `SELECT ... FOR UPDATE` gercekten seri hale getiriyor
 *   mu?
 *
 *   ZORUNLU TEST 3 — ⚠️ **SIFIRDAN FARKLI BAKIYE PROJEKSIYONU**: ADR-0037'nin
 *   kapanis denetimi, projeksiyona gomulu korelasyonlu bir alt sorgunun HATA
 *   VERMEDIGINI ve HER ZAMAN 0 dondurdugunu bulmustu (parcasi olan bir belge
 *   ekranda "Aranamiyor" gorunuyordu). ⚠️ Burada ayni kusur DAHA TEHLIKELIDIR:
 *   sessizce `0` donen bir bakiye musteriye "puaniniz yok" demektir.
 *   ⚠️ "Hata vermedi" YETMEZ — sayinin DOGRU oldugu iddia edilir.
 *
 * Bu modulun kendine ozgu diger iddialari:
 *   1. ⚠️ **`PATCH` UCU YOK** (§2.2) — degistirilemezlik HTTP yuzeyinde de
 *      gorunur.
 *   2. ⚠️ **409 VAR** (§1.2) — Kampanya ve Geri Bildirim'den ayrildigimiz
 *      nokta.
 *   3. ⚠️ **`crmContactId` ZORUNLU** (§6.1) ve gorunmeyen kisi **422**.
 *   4. ⚠️ Katalog GENIS: `viewer` OKUR ama hesap ACAMAZ; `member` acar ve puan
 *      yazar ama SILEMEZ.
 *   5. ⚠️ Gelecege tarihli hareket **422**.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000fc';

function idOf(body: unknown): string {
  return String((body as { id?: string }).id);
}

describe('Sadakat uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    // ⚠️ Bu modul hicbir saglayici cagirmaz (vektor yok), ama AYNI SUREC
    // icindeki diger moduller cagirir: hermetiklik icin sahte adapter.
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
    await database.ownerPool.query('TRUNCATE loyalty.point_entries, loyalty.accounts CASCADE');
    await database.ownerPool.query('TRUNCATE crm.contacts, crm.companies CASCADE');
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
    const user = await signUp(`${role}-${String(seq)}-ly@example.com`);
    await createTenant(tenantId, user.userId);
    await addMembership(tenantId, user.userId, role);
    return accessToken(user.identityToken, tenantId);
  }

  function api() {
    return request(httpServer(app));
  }

  /** CRM kisisi ACAR — ⚠️ bu modulde bir on kosuldur (§6.1). */
  async function createContact(token: string): Promise<string> {
    const company = await api()
      .post('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Sirket ${String(seq)}` });

    const contact = await api()
      .post('/api/v1/crm/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: idOf(company.body), fullName: `Musteri ${String(seq)}` });

    return idOf(contact.body);
  }

  async function createAccount(token: string): Promise<string> {
    const contactId = await createContact(token);
    const response = await api()
      .post('/api/v1/loyalty/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ crmContactId: contactId });
    return idOf(response.body);
  }

  function addEntry(token: string, accountId: string, body: Record<string, unknown>) {
    return api()
      .post(`/api/v1/loyalty/accounts/${accountId}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  // ==========================================================================
  // ⚠️ ZORUNLU TEST 1 — ES ZAMANLILIK (§4.3, §4.4)
  // ==========================================================================

  describe('⚠️⚠️ ZORUNLU TEST 1: paralel harcama bakiyeyi NEGATIFE DUSURMEZ', () => {
    it('⚠️ 500 puana ALTI paralel 100 puanlik harcama — TAM BESI gecer, bakiye 0', async () => {
      // ==========================================================================
      // ⚠️ BU, SLICE'IN EN ONEMLI TESTIDIR
      // ==========================================================================
      // ADR-0051 §4.4: "bakiye negatife dusemez" bir SATIRLAR ARASI kosuldur ve
      // bir `CHECK` onu GOREMEZ. Yani bu degismezin VERITABANI GARANTISI
      // YOKTUR — tek dayanak harcama yazan TEK kod yolu ve `SELECT ... FOR
      // UPDATE` satir kilididir.
      //
      // ⚠️ Kilit OLMASAYDI: alti istek de bakiyeyi 500 okur, altisi da kontrolu
      // GECER ve toplam 600 puan cikar — bakiye -100 olur. Hata SESSIZ
      // OLMAZDI (negatif bakiye ekranda gorunur) ama ISLETME KARSILAMAK
      // ZORUNDA KALIRDI: verilmemis bir hak harcanmis olurdu.
      //
      // ⚠️ Alti (poolMax 10'un altinda) bilincli: her istek bir transaction ve
      // bir baglanti tutar. Havuzu doldurmak testi degil ALTYAPIYI sinardi.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await addEntry(token, accountId, { direction: 'earn', points: 500 }).expect(201);

      const attempts = await Promise.all(
        Array.from({ length: 6 }, () =>
          addEntry(token, accountId, { direction: 'spend', points: 100 }),
        ),
      );

      const accepted = attempts.filter((response) => response.status === 201);
      const rejected = attempts.filter((response) => response.status === 422);

      // ⚠️ TAM BES — "en fazla bes" DEGIL. Kilit seri hale getirdigi icin
      // sonuc DETERMINISTIKTIR; "<= 5" yazmak, hicbirinin gecmedigi bozuk bir
      // implementasyonu da YESIL yakardi.
      expect(accepted).toHaveLength(5);
      expect(rejected).toHaveLength(1);

      // ⚠️ Reddin sebebi ACIKCA yetersiz bakiyedir — baska bir 422 degil.
      expect(String(rejected[0]?.body.detail)).toMatch(/Yetersiz bakiye/);

      // ⚠️ VE ASIL KANIT: sunucunun turettigi bakiye TAM OLARAK 0.
      const account = await api()
        .get(`/api/v1/loyalty/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(account.body.balance).toBe(0);

      // ⚠️ IKINCI, BAGIMSIZ KANIT: veritabanindaki satirlar da ayni seyi
      // soyluyor mu? Uygulamanin kendi sorgusu bozuksa `balance` yine 0
      // gorunebilirdi — bu sayim ONDAN BAGIMSIZDIR.
      const rows = await database.ownerPool.query<{ n: string; total: string }>(
        `SELECT count(*) AS n,
                COALESCE(SUM(CASE WHEN direction = 'earn' THEN points ELSE -points END), 0) AS total
           FROM loyalty.point_entries WHERE account_id = $1`,
        [accountId],
      );
      // 1 kazanim + 5 harcama = 6 satir; 500 - 500 = 0
      expect(Number(rows.rows[0]?.n)).toBe(6);
      expect(Number(rows.rows[0]?.total)).toBe(0);
    }, 60_000);

    it('⚠️ REDDEDILEN HARCAMA HICBIR SATIR YAZMAZ', async () => {
      // Kontrol `INSERT`ten ONCE yapilir ve ayni transaction icindedir; bir
      // "once yaz sonra kontrol et" implementasyonu burada yakalanir.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      await addEntry(token, accountId, { direction: 'earn', points: 50 }).expect(201);

      await addEntry(token, accountId, { direction: 'spend', points: 51 }).expect(422);

      const rows = await database.ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM loyalty.point_entries WHERE account_id = $1',
        [accountId],
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
    });

    it('⚠️ TAM BAKIYE KADAR harcama GECER — sinir degeri', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      await addEntry(token, accountId, { direction: 'earn', points: 120 }).expect(201);

      const response = await addEntry(token, accountId, {
        direction: 'spend',
        points: 120,
      }).expect(201);

      expect(response.body.balance).toBe(0);
    });

    it('⚠️ `earn` BAKIYEDEN BAGIMSIZDIR — sifir bakiyeye kazanim yazilabilir', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      const response = await addEntry(token, accountId, {
        direction: 'earn',
        points: 10,
      }).expect(201);

      expect(response.body.balance).toBe(10);
    });
  });

  // ==========================================================================
  // ⚠️ ZORUNLU TEST 3 — BAKIYE PROJEKSIYONU (ADR-0037'nin olculmus kusuru)
  // ==========================================================================

  describe('⚠️⚠️ ZORUNLU TEST 3: turetilen bakiye SIFIRDAN FARKLI ve DOGRU', () => {
    it('⚠️ LISTEDE bakiye satirlardan DOGRU hesaplaniyor — "0 donmedi" YETMEZ', async () => {
      // ⚠️ ADR-0037'nin kapanis denetimi, projeksiyona gomulu korelasyonlu bir
      // alt sorgunun HATA VERMEDIGINI ve HER ZAMAN 0 dondurdugunu buldu. Burada
      // ayni kusur DAHA TEHLIKELIDIR: sessizce 0 donen bir bakiye musteriye
      // "puaniniz yok" demektir.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await addEntry(token, accountId, { direction: 'earn', points: 300 }).expect(201);
      await addEntry(token, accountId, { direction: 'earn', points: 45 }).expect(201);
      await addEntry(token, accountId, { direction: 'spend', points: 120 }).expect(201);

      const list = await api()
        .get('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const row = (list.body.items as { id: string; balance: number; entryCount: number }[]).find(
        (item) => item.id === accountId,
      );

      // 300 + 45 - 120 = 225
      expect(row?.balance).toBe(225);
      expect(row?.entryCount).toBe(3);
    });

    it('⚠️ HAREKETSIZ hesap listede GORUNUR ve bakiyesi 0 (LEFT JOIN)', async () => {
      // ⚠️ `INNER JOIN` olsaydi yeni acilmis her hesap listeden DUSERDI ve
      // kullanici az once actigi hesabi GOREMEZDI.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      const list = await api()
        .get('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const row = (list.body.items as { id: string; balance: number; lastEntryAt: unknown }[]).find(
        (item) => item.id === accountId,
      );

      expect(row?.balance).toBe(0);
      expect(row?.lastEntryAt).toBeNull();
    });

    it('⚠️ BIR HESABIN BAKIYESI DIGERINE SIZMAZ — `GROUP BY` dogru anahtarda', async () => {
      // ⚠️ Yanlis bir `GROUP BY` (ya da eksik bir JOIN kosulu) her hesaba TUM
      // tenant'in toplamini yazardi ve bu, listede MAKUL GORUNEN yanlis bir
      // sayidir — tam olarak bu projenin en cok kactigi hata sinifi.
      const token = await tokenFor('owner');
      const first = await createAccount(token);
      const second = await createAccount(token);

      await addEntry(token, first, { direction: 'earn', points: 700 }).expect(201);
      await addEntry(token, second, { direction: 'earn', points: 20 }).expect(201);

      const list = await api()
        .get('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const items = list.body.items as { id: string; balance: number }[];
      expect(items.find((item) => item.id === first)?.balance).toBe(700);
      expect(items.find((item) => item.id === second)?.balance).toBe(20);
      // ⚠️ `total` HESAP sayisidir, hareket sayisi DEGIL (JOIN'li bir
      // `count(*)` hareketleri sayardi).
      expect(list.body.total).toBe(2);
    });

    it('⚠️ DUVARIN TOPLAMI listedeki bakiyelerin toplamina ESIT (§9.1)', async () => {
      // ⚠️ Ayrisirlarsa duvar bir sey der, liste baska bir sey gosterir ve fark
      // SESSIZ olur. `BALANCE_SUM` ifadesinin TEK olmasinin sebebi budur.
      const token = await tokenFor('owner');
      const first = await createAccount(token);
      const second = await createAccount(token);

      await addEntry(token, first, { direction: 'earn', points: 700 }).expect(201);
      await addEntry(token, first, { direction: 'spend', points: 250 }).expect(201);
      await addEntry(token, second, { direction: 'earn', points: 20 }).expect(201);

      const summary = await api()
        .get('/api/v1/loyalty/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(summary.body.outstandingPoints).toBe(470);
      expect(summary.body.accountCount).toBe(2);
      expect(summary.body.earnedInWindow).toBe(720);
      expect(summary.body.spentInWindow).toBe(250);
      // ⚠️ SUNUCUDAN doner — arayuz "son 30 gunde" metnini KENDI yazmaz.
      expect(summary.body.windowDays).toBe(30);
    });

    it('⚠️ `lastEntryAt` GERCEK BIR TARIH — `sql<Date>` IDDIASI degil', async () => {
      // ⚠️ ADR-0047'nin kapanis denetiminde OLCULMUS kusur: drizzle yalnizca
      // TANIMLI KOLONLARI esler; ham bir `max(timestamptz)` surucuden DIZE
      // gelir ve `sql<Date>` yalnizca DERLEYICIYE bir iddiadir.
      // `feedback-satisfaction` bu yuzden `moment.getTime is not a function`
      // ile cokmustu. Burada donusum ACIKCA yapiliyor.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      await addEntry(token, accountId, { direction: 'earn', points: 10 }).expect(201);

      const account = await api()
        .get(`/api/v1/loyalty/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // JSON'da bir ISO dize olarak goruncek; onemli olan GECERLI bir an olmasi.
      expect(Number.isNaN(Date.parse(String(account.body.lastEntryAt)))).toBe(false);
    });
  });

  // ==========================================================================
  // ⚠️ ZORUNLU KENAR: `crmContactId` ZORUNLU (§6.1) + 409 (§1.2)
  // ==========================================================================

  describe('⚠️ ZORUNLU cross-modul isaretci ve TEKILLIK', () => {
    it('⚠️ `crmContactId` OLMADAN hesap acilamaz — 422', async () => {
      // Bes modulde isaretci opsiyoneldi; burada DEGIL. Musterisi olmayan bir
      // bakiye, musteri geldiginde BULUNAMAZ.
      const token = await tokenFor('owner');

      await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(422);
    });

    it('⚠️ GORUNMEYEN kisi icin 422 — ve uc durum AYIRT EDILMEZ (§6.2)', async () => {
      // "Kisi silinmis" · "baska tenant'in" · "`contact:read` yok" AYNI cevabi
      // verir: cagiran reddin sebebinden o kisinin VAR OLDUGUNU cikaramaz.
      const token = await tokenFor('owner');

      await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ crmContactId: '018f3a2b-7c4d-7e1f-9999-000000000001' })
        .expect(422);
    });

    it('⚠️ AYNI KISIYE IKINCI HESAP -> 409 (Kampanya/Geri Bildirim den AYRILDIK)', async () => {
      const token = await tokenFor('owner');
      const contactId = await createContact(token);

      const first = await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ crmContactId: contactId })
        .expect(201);

      const second = await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ crmContactId: contactId })
        .expect(409);

      // ⚠️ Mesaj MEVCUT HESABIN id'sini tasir — 409 bir CIKMAZ SOKAK olmasin
      // diye (bu modulde kisiye gore hesap arayan bir uc YOKTUR).
      expect(String(second.body.detail)).toContain(idOf(first.body));
    });

    it('⚠️ SILINEN KISININ hesabi DURUR — ad `null`, satir DUSMEZ (§9.2)', async () => {
      // ⚠️ Bu modulde sarkan isaretci ILK KEZ kaydi KULLANILAMAZ kiliyor: adi
      // olmayan bir bakiye kimin oldugu bilinmeyen bir bakiyedir. Yine de satir
      // LISTEDEN DUSMEZ — dusseydi bakiye GORUNMEZ olurdu ve duvarin toplami
      // listeyle TUTMAZDI.
      const token = await tokenFor('owner');
      const contactId = await createContact(token);
      const created = await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ crmContactId: contactId })
        .expect(201);

      expect(created.body.contactName).not.toBeNull();

      await api()
        .delete(`/api/v1/crm/contacts/${contactId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const after = await api()
        .get(`/api/v1/loyalty/accounts/${idOf(created.body)}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // ⚠️ Ad UYDURULMAZ ve "silinmis" DE DENMEZ — o kelime, silinmis bir
      // kaydin BIR ZAMANLAR VAR OLDUGUNU sizdirirdi.
      expect(after.body.contactName).toBeNull();
      expect(after.body.crmContactId).toBe(contactId);
    });
  });

  // ==========================================================================
  // Rol turu, dogrulama kapilari, degistirilemezlik
  // ==========================================================================

  describe('⚠️ RBAC — katalog GENIS, `delete` DAR', () => {
    it('kimliksiz istek 401', async () => {
      await api().get('/api/v1/loyalty/accounts').expect(401);
    });

    it('⚠️ `viewer` OKUR ama hesap ACAMAZ (403)', async () => {
      const owner = await tokenFor('owner');
      const contactId = await createContact(owner);

      const viewerUser = await signUp(`viewer-ly-${String(seq)}@example.com`);
      await addMembership(TENANT_A, viewerUser.userId, 'viewer');
      const viewer = await accessToken(viewerUser.identityToken, TENANT_A);

      await api()
        .get('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${viewer}`)
        .expect(200);

      await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${viewer}`)
        .send({ crmContactId: contactId })
        .expect(403);
    });

    it('⚠️ `member` hesap ACAR ve PUAN YAZAR ama SILEMEZ (403)', async () => {
      const owner = await tokenFor('owner');
      const memberUser = await signUp(`member-ly-${String(seq)}@example.com`);
      await addMembership(TENANT_A, memberUser.userId, 'member');
      const member = await accessToken(memberUser.identityToken, TENANT_A);

      const contactId = await createContact(owner);
      const created = await api()
        .post('/api/v1/loyalty/accounts')
        .set('Authorization', `Bearer ${member}`)
        .send({ crmContactId: contactId })
        .expect(201);

      await addEntry(member, idOf(created.body), { direction: 'earn', points: 10 }).expect(201);

      // ⚠️ Silme GERI ALINAMAZ ve defteri de goturur — "gunluk is degil, bir
      // YONETIM ISLEMIDIR" (ADR-0043/0045/0047'nin ayni olcutu).
      await api()
        .delete(`/api/v1/loyalty/accounts/${idOf(created.body)}`)
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    });

    it('`owner` siler — 204, ve defter DE gider', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      await addEntry(token, accountId, { direction: 'earn', points: 10 }).expect(201);

      await api()
        .delete(`/api/v1/loyalty/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const rows = await database.ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM loyalty.point_entries WHERE account_id = $1',
        [accountId],
      );
      expect(Number(rows.rows[0]?.n)).toBe(0);
    });
  });

  describe('⚠️ DOGRULAMA KAPILARI', () => {
    it('⚠️ GELECEGE tarihli hareket 422 (§1.6)', async () => {
      // Bakiye tarihten BAGIMSIZ olarak butun satirlarin toplamidir; gelecege
      // tarihli bir kazanim BUGUN HENUZ KAZANILMAMIS bir puani bugunun
      // bakiyesinde gosterirdi.
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await addEntry(token, accountId, {
        direction: 'earn',
        points: 10,
        occurredAt: tomorrow,
      }).expect(422);
    });

    it('GECMISE tarihli hareket KABUL EDILIR — gercek bir ihtiyac', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      await addEntry(token, accountId, {
        direction: 'earn',
        points: 10,
        occurredAt: yesterday,
      }).expect(201);
    });

    it('⚠️ NEGATIF ve KESIRLI puan 422 — isaret `direction`da, miktar POZITIF (§1.4)', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await addEntry(token, accountId, { direction: 'earn', points: -5 }).expect(422);
      await addEntry(token, accountId, { direction: 'earn', points: 0 }).expect(422);
      // ⚠️ Puan SAYILIR, olculmez: 3,5 puan yoktur (§1.5).
      await addEntry(token, accountId, { direction: 'earn', points: 2.5 }).expect(422);
    });

    it('⚠️ UCUNCU BIR YON YOKTUR — `adjustment` 422', async () => {
      // Duzeltme TERS YONDE BIR SATIRDIR (ADR-0041'in iskonto karari).
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await addEntry(token, accountId, { direction: 'adjustment', points: 5 }).expect(422);
    });

    it('⚠️ SINIR ASAN aciklama 422 — ve HICBIR KAYIT KIRPILMADI', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await addEntry(token, accountId, {
        direction: 'earn',
        points: 5,
        note: 'x'.repeat(MAX_POINT_ENTRY_NOTE_CHARS + 1),
      }).expect(422);

      const rows = await database.ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM loyalty.point_entries WHERE account_id = $1',
        [accountId],
      );
      expect(Number(rows.rows[0]?.n)).toBe(0);
    });

    it('olmayan hesaba hareket 404, gecersiz UUID 422', async () => {
      const token = await tokenFor('owner');

      await addEntry(token, '018f3a2b-7c4d-7e1f-9999-000000000002', {
        direction: 'earn',
        points: 5,
      }).expect(404);

      await addEntry(token, 'not-a-uuid', { direction: 'earn', points: 5 }).expect(422);
    });
  });

  describe('⚠️ DEGISTIRILEMEZLIK — HTTP yuzeyi (§2.2, §2.3)', () => {
    it('⚠️ HESAP ICIN `PATCH` UCU YOKTUR — 404', async () => {
      // ⚠️ 405 degil 404: rota HIC TANIMLI DEGIL. Bir `PATCH` ucu yazmak
      // OLMAYAN BIR YOLUN VAR OLDUGUNU ima ederdi (§2.2).
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);

      await api()
        .patch(`/api/v1/loyalty/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ crmContactId: '018f3a2b-7c4d-7e1f-9999-000000000003' })
        .expect(404);
    });

    it('⚠️ TEK BIR PUAN SATIRI ICIN SILME UCU YOKTUR — 404', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      const entry = await addEntry(token, accountId, {
        direction: 'earn',
        points: 10,
      }).expect(201);

      const entryId = (entry.body as { entry: { id: string } }).entry.id;

      await api()
        .delete(`/api/v1/loyalty/accounts/${accountId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('defter EN YENI ONCE listelenir ve hesap yoksa 404', async () => {
      const token = await tokenFor('owner');
      const accountId = await createAccount(token);
      await addEntry(token, accountId, { direction: 'earn', points: 10 }).expect(201);
      await addEntry(token, accountId, { direction: 'earn', points: 20 }).expect(201);

      const entries = await api()
        .get(`/api/v1/loyalty/accounts/${accountId}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(entries.body.total).toBe(2);

      await api()
        .get('/api/v1/loyalty/accounts/018f3a2b-7c4d-7e1f-9999-000000000004/entries')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('⚠️ ROTA GOLGELEMESI (ADR-0040 in dersi)', () => {
    it('`/loyalty/summary` bir hesap id si SANILMIYOR', async () => {
      // ⚠️ Golgelenseydi `summary` `idParamSchema`ya duser ve 422 donerdi:
      // ekran calisir, HICBIR TEST KIRMIZI YANMAZDI.
      const token = await tokenFor('owner');

      await api()
        .get('/api/v1/loyalty/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await api()
        .get('/api/v1/loyalty/accounts/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(422);
    });
  });
});
