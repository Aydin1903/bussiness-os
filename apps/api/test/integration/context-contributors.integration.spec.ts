import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../src/platform/context/context.public';
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
 * TEK KURUMSAL HAFIZA — Slice 7'nin kabul testi (ADR-0031 §5).
 *
 * ============================================================================
 * BU DOSYA FAZ 5'IN URUN VAADINI SINAR
 * ============================================================================
 * CLAUDE.md'nin kurucu ornegi ("son 6 ayimizi analiz et") CRM, Finans ve
 * Projeler'e BIRLIKTE bakmayi gerektirir. Slice 3 mekanizmayi kurdu ama TEK
 * katkici vardi — yani "birlesik baglam" iddiasi o gun SINANAMAZDI.
 *
 * Bugun ALTI katkici var (knowledge · crm-interactions · crm-pipeline ·
 * project-notes · project-status · finance-commentaries · finance-cashflow) ve
 * iddialar gercekten olculebiliyor:
 *   1. Cross-modul: bir Knowledge notu ILE bir CRM gorusmesi AYNI cevaba
 *      kaynak olur — tek `/ask` cagrisi.
 *   2. Izni olmayan katkici HIC CAGRILMAZ ve icerigi cevaba GIRMEZ.
 *   3. Bozulan katkici `degradedSources`ta gorunur; ELENEN katkici GORUNMEZ.
 *
 * ============================================================================
 * ⚠️ 2. IDDIA ARTIK HTTP'DEN SINANABILIYOR — Finans Slice 6 ile
 * ============================================================================
 * Bu dosya uzun sure sunu kaydediyordu: "KATKICI SEVIYESINDEKI eleme HTTP'den
 * sinanamaz", cunku `context:ask` tasiyip bir katkicinin iznini TASIMAYAN bir
 * rol YOKTU (owner/admin/member ucu de her seyi tasiyordu, `viewer` ise
 * `context:ask` bile tasimiyordu).
 *
 * Finans'in DAR permission katalogu (ADR-0034 §7) o boslugu kapatti:
 * `member` -> `context:ask` VAR, `cashflow:read` / `commentary:read` YOK.
 * Asagidaki "member Finans icerigini GOREMEZ" testi, ADR-0031 §5.3'un
 * tasarimin en kritik detayi dedigi filtrenin ILK GERCEK sinavidir.
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

/** Yanit govdesinden kaynak etiketlerini cikarir (`body` `any`'dir). */
function sourceLabels(body: unknown): string[] {
  const sources = (body as { sources?: readonly { source: string }[] }).sources ?? [];
  return sources.map((entry) => entry.source);
}

function degraded(body: unknown): string[] {
  return [...((body as { degradedSources?: readonly string[] }).degradedSources ?? [])];
}

const PASSWORD = 'parola123';
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';

describe('Tek kurumsal hafiza — katkicilar (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
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
    await database.ownerPool.query(
      'TRUNCATE knowledge.note_chunks, knowledge.notes, platform.messages, platform.conversations CASCADE',
    );
    await database.ownerPool.query(
      'TRUNCATE finance.commentary_chunks, finance.commentaries, finance.transactions, finance.categories CASCADE',
    );
    await database.ownerPool.query(
      'TRUNCATE projects.progress_note_chunks, projects.progress_notes, projects.tasks, projects.projects CASCADE',
    );
    await database.ownerPool.query('TRUNCATE appointments.appointments CASCADE');
    await database.ownerPool.query('TRUNCATE feedback.responses CASCADE');
    await database.ownerPool.query('TRUNCATE platform.rate_limits');
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  let seq = 0;
  function nextId(prefix: string): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-${prefix}-${String(seq).padStart(12, '0')}`;
  }

  function api() {
    return request(httpServer(app));
  }

  async function signUp(email: string): Promise<{ userId: string; identityToken: string }> {
    await api().post('/api/v1/auth/register').send({ email, password: PASSWORD });
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [email],
    );
    const login = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    const rows = await database.ownerPool.query<{ id: string }>(
      'SELECT id FROM platform.users WHERE email = $1',
      [email],
    );
    return { userId: String(rows.rows[0]?.id), identityToken: String(login.body.identityToken) };
  }

  async function tokenFor(role: string): Promise<string> {
    const user = await signUp(`${role}-${String(seq)}@example.com`);
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-ctx', 'Test', 'active', $2)
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_A, user.userId],
    );
    await database.ownerPool.query(
      `INSERT INTO platform.memberships (id, tenant_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, $4, 'active', now())`,
      [nextId('8a2b'), TENANT_A, user.userId, role],
    );
    const response = await api()
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${user.identityToken}`)
      .send({ tenantId: TENANT_A });
    return String(response.body.accessToken);
  }

  /** Knowledge tarafina bir not, CRM tarafina bir sirket + gorusme yazar. */
  async function seedBothModules(token: string): Promise<{ companyId: string }> {
    await api()
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Muhasebe sureci', body: 'Faturalar ayin son is gunu kesilir.' });

    const company = await api()
      .post('/api/v1/crm/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Tekstil' });

    await api()
      .post('/api/v1/crm/interactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId: String(company.body.id),
        occurredOn: '2026-08-12',
        body: 'Toplanti iyi gecti, butce onaylandi.',
      });

    return { companyId: String(company.body.id) };
  }

  function ask(token: string, question = 'Sirkette neler oluyor?') {
    return api().post('/api/v1/ask').set('Authorization', `Bearer ${token}`).send({ question });
  }

  /** Projeler tarafina bir proje + bir ilerleme notu yazar. */
  async function seedProjects(token: string): Promise<void> {
    const project = await api()
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Web sitesi yenileme', status: 'in_progress' });

    await api()
      .post('/api/v1/projects/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: String(project.body.id), body: 'Tasarim onaylandi, kodlamaya gecildi.' });
  }

  /** Finans tarafina bir islem + bir yorum yazar (iki katkici da beslensin). */
  async function seedFinance(token: string): Promise<void> {
    await api()
      .post('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        direction: 'expense',
        amount: '8500.50',
        currency: 'TRY',
        // Yapisal katkici SON 30 GUNE bakar; sabit bir tarih testi zamanla
        // kirardi (`today.ts`in ayni tuzagi).
        occurredOn: new Date().toISOString().slice(0, 10),
        description: 'Ofis kirasi',
      });

    await api()
      .post('/api/v1/finance/commentaries')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Bu ay nakit sikisti, X musterisi odemeyi geciktirdi.' });
  }

  /** Randevu: notlu (anlamsal) + yaklasan/gelmeyen (yapisal) kayitlar. */
  async function seedAppointments(token: string): Promise<void> {
    // Yarin icin NOTLU bir randevu — hem `appointment-notes` hem
    // `appointment-schedule` bunu gorur.
    await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheduledAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 30,
        serviceNote: 'Dis temizligi ve implant kontrolu konusuldu.',
      });
  }

  // --- 1. Cross-modul: TEK cagri, IKI modulden birlesik baglam ------------

  it('bir Knowledge notu ILE bir CRM gorusmesi AYNI cevaba kaynak olur', async () => {
    const owner = await tokenFor('owner');
    await seedBothModules(owner);

    const response = await ask(owner);

    expect(response.status).toBe(200);

    const labels = sourceLabels(response.body);
    // Faz 5'in urun vaadi: modul basina `/ask` ucuyla bu MUMKUN OLMAZDI.
    expect(labels).toContain('knowledge');
    expect(labels).toContain('crm-interactions');
  });

  /**
   * ⚠️ CLAUDE.md'NIN KURUCU ORNEGININ TAM KARSILIGI.
   *
   * _"Bir CEO 'son 6 ayimizi analiz et' der ve sistem CRM'deki musteri
   * hareketlerine, FINANS'TAKI NAKIT AKISINA, Projeler'deki teslim
   * performansina BIRLIKTE bakar."_
   *
   * Bu cumle Faz 4'te yazildi ve o gun mimari olarak IMKANSIZDI (tek modul).
   * Faz 5/CRM ucte birini, Projeler ucte ikisini karsiladi. Bu test ucunu de —
   * arti Knowledge'i — TEK bir `/ask` cagrisinda kanitlar.
   *
   * Modul basina `/ask` ucuyla bu YAPISAL OLARAK mumkun olmazdi (ADR-0031 §5).
   */
  it('⚠️ BES MODULUN icerigi AYNI cevapta bulusuyor — tek /ask cagrisi', async () => {
    const owner = await tokenFor('owner');
    await seedBothModules(owner);
    await seedProjects(owner);
    await seedFinance(owner);
    await seedAppointments(owner);

    const response = await ask(owner, 'Son donemde sirkette neler oldu?');

    expect(response.status).toBe(200);

    const labels = new Set(sourceLabels(response.body));
    // Havuz sekiz yuvali ve artik SEKIZ katkici besliyor; hepsinin ayni anda
    // girmesi garanti DEGIL. Iddia bu yuzden "her modulden EN AZ BIR kaynak"
    // seklinde kuruluyor — modul BASINA, katkici basina degil.
    const modules = {
      knowledge: labels.has('knowledge'),
      crm: labels.has('crm-interactions') || labels.has('crm-pipeline'),
      projects: labels.has('project-notes') || labels.has('project-status'),
      finance: labels.has('finance-commentaries') || labels.has('finance-cashflow'),
      appointments: labels.has('appointment-notes') || labels.has('appointment-schedule'),
    };

    expect(modules).toEqual({
      knowledge: true,
      crm: true,
      projects: true,
      finance: true,
      appointments: true,
    });
    expect(degraded(response.body)).toEqual([]);
  });

  /**
   * ⚠️ ZAMAN ILK KEZ GELECEGE DOGRU OKUNUYOR.
   *
   * Onceki DORT modulun katkicilari GECMISE bakiyordu: olan gorusme, yazilan
   * not, gerceklesen odeme, kapanan firsat. "Yarin kim geliyor" sorusunun
   * cevabi bugune kadar HICBIR modulde yoktu — ve bir gorusme notunda da
   * YAZMAZ, `scheduled_at` kolonunda yazar.
   */
  it('⚠️ yapisal katkici YAKLASAN randevuyu baglama sokar', async () => {
    const owner = await tokenFor('owner');
    await seedAppointments(owner);

    const response = await ask(owner, 'Yarin kim geliyor?');

    expect(sourceLabels(response.body)).toContain('appointment-schedule');
  });

  it('⚠️ anlamsal katkici SERVIS NOTUNU baglama sokar — ve etiketi AYRIDIR', async () => {
    // Iki katkici AYNI tabloyu okuyor (projede ilk kez); `source` etiketleri
    // ayri oldugu icin atif ve `degradedSources` dogru calisir.
    const owner = await tokenFor('owner');
    await seedAppointments(owner);

    const response = await ask(owner, 'Implant kontrolu hakkinda ne konusuldu?');

    const labels = sourceLabels(response.body);
    expect(labels).toContain('appointment-notes');
    // Ayni tablodan gelen IKI AYRI kaynak; birbirine karismiyor.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('yapisal katkici acik firsati baglama sokar', async () => {
    const owner = await tokenFor('owner');
    const { companyId } = await seedBothModules(owner);

    await api().post('/api/v1/crm/opportunities').set('Authorization', `Bearer ${owner}`).send({
      companyId,
      title: 'Yillik sozlesme',
      stage: 'proposal_sent',
      estimatedValue: '250000.00',
      currency: 'TRY',
      nextFollowUpOn: '2020-01-01',
    });

    const response = await ask(owner, 'Hangi anlasmalar takipte gecikti?');

    // Bu sorunun cevabi bir gorusme notunda YAZMAZ; bir kolonda yazar.
    expect(sourceLabels(response.body)).toContain('crm-pipeline');
  });

  // --- 2. Izin elemesi: iki katkici varken ILK KEZ gercekten sinanir ------

  it('viewer `/ask` cagiramaz — guard katkici elemesinden ONCE keser', async () => {
    const viewer = await tokenFor('viewer');

    // `viewer` `context:ask` TASIMAZ (ADR-0031 §6), yani istek katkicilara HIC
    // SIRA GELMEDEN guard'da kesilir. Bu, asagidaki `member` testinden FARKLI
    // bir mekanizmadir ve ikisi karistirilmamalidir.
    expect((await ask(viewer)).status).toBe(403);
  });

  /**
   * ⚠️ ADR-0031 §5.3'UN ILK GERCEK SINAVI.
   *
   * `member`: `context:ask` VAR (istek MESRU, 200 doner) ama `cashflow:read` /
   * `commentary:read` YOK. Yani istek CALISIR, Finans katkicilari ELENIR.
   *
   * Bu senaryo Faz 5/CRM ve Projeler kapanis denetimlerinde URETILEMEDI ve her
   * ikisinde de "kapi var, tetikci yok" diye kayda gecti. Finans'in dar
   * katalogu tetikciyi uretti.
   */
  it('⚠️ member `/ask` cagirabilir ama FINANS ICERIGINI GOREMEZ', async () => {
    const owner = await tokenFor('owner');
    await seedFinance(owner);
    // Ayni tenant'ta Finans DISI bir kaynak da olsun ki cevabin bos kalmadigi,
    // yalnizca Finans'in ELENDIGI gorulebilsin.
    await api()
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${owner}`)
      .send({ body: 'Faturalar ayin son is gunu kesilir.' });

    // Once OWNER sorar: Finans katkicilari GERCEKTEN calisiyor mu?
    const asOwner = await ask(owner, 'Nakit akisimiz nasil gidiyor?');
    expect(asOwner.status).toBe(200);
    expect(sourceLabels(asOwner.body)).toContain('finance-cashflow');

    // Sonra MEMBER ayni soruyu sorar.
    const member = await tokenFor('member');
    const asMember = await ask(member, 'Nakit akisimiz nasil gidiyor?');

    // 1. Istek MESRU — 403 DEGIL. `context:ask` var.
    expect(asMember.status).toBe(200);

    // 2. Finans kaynaklarinin HICBIRI cevaba girmedi.
    const labels = sourceLabels(asMember.body);
    expect(labels).not.toContain('finance-cashflow');
    expect(labels).not.toContain('finance-commentaries');

    // 3. ⚠️ VE `degradedSources`TA DA GORUNMUYOR. Bu ayrim ADR-0031 §5.5'in
    //    kendisidir: BOZULAN katkici gorunur (kullanici eksikligi bilmeli),
    //    ELENEN katkici GORUNMEZ (aksi halde kullanicinin goremedigi bir
    //    kaynagin VARLIGI sizardi).
    expect(degraded(asMember.body)).not.toContain('finance-cashflow');
    expect(degraded(asMember.body)).not.toContain('finance-commentaries');

    // 4. Cevap yine de calisti: gorebildigi kaynak iceride.
    expect(labels).toContain('knowledge');
  });

  it('CRM verisi YOKKEN cevap yalnizca Knowledge kaynagi tasir', async () => {
    const owner = await tokenFor('owner');
    await api()
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${owner}`)
      .send({ body: 'Faturalar ayin son is gunu kesilir.' });

    const response = await ask(owner);

    expect(sourceLabels(response.body)).toContain('knowledge');
    expect(sourceLabels(response.body)).not.toContain('crm-interactions');
  });

  // --- 3. degradedSources: BOZULAN gorunur, ELENEN gorunmez --------------

  it('saglikli akista degradedSources BOSTUR', async () => {
    const owner = await tokenFor('owner');
    await seedBothModules(owner);

    const response = await ask(owner);

    // Elenen katkici buraya GIRMEZ: "alamadik" ile "goremezsin" ayri
    // seylerdir ve ikincisi bir kaynagin VARLIGINI sizdirirdi.
    expect(degraded(response.body)).toEqual([]);
  });

  // ==========================================================================
  // ⚠️ ADR-0045 §3.5 + §3.4 — KAPANIS DENETIMININ IKI SABIT MADDESI
  // ==========================================================================

  describe('⚠️ Geri Bildirim (ADR-0045) — havuzdaki yeri', () => {
    async function addFeedback(
      token: string,
      body: { rating: number; comment?: string | null },
    ): Promise<void> {
      await api()
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: body.rating,
          ...(body.comment == null ? {} : { comment: body.comment }),
          receivedAt: new Date().toISOString(),
        });
    }

    it('⚠️ YORUMLU geri bildirim `/ask` cevabina KAYNAK OLUR (§3.1)', async () => {
      // Havuza DISARIDAN GELEN ILK SES: bugune kadar her anlatiyi SIRKET
      // kendisi yazmisti (gorusme notu, ilerleme notu, servis notu). Burada
      // gomulen metin MUSTERININ KENDI CUMLESIDIR.
      const token = await tokenFor('owner');
      await addFeedback(token, { rating: 2, comment: 'siparisim iki hafta gecikti' });

      const response = await api()
        .post('/api/v1/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'musteriler neden memnun degil' });

      expect(response.status).toBe(200);
      const sources = response.body.sources as readonly { source: string }[];
      expect(sources.map((entry) => entry.source)).toContain('feedback-comments');
    });

    it('⚠️ §3.5 SINAVI: YORUMSUZ puanin `/ask`te HICBIR SESI YOKTUR', async () => {
      // ============================================================
      // ⚠️ BU, MODULUN YAZILI BILINEN SINIRIDIR — BIR KUSUR DEGIL
      // ============================================================
      // Yorumsuz bir kaydin gomulecek metni yoktur (§1.4), dolayisiyla vektoru
      // KALICI OLARAK `NULL`dur ve anlamsal katkici `embedding IS NOT NULL`
      // suzer.
      //
      // ⚠️ BU TESTIN ISI SINIRIN SESSIZCE DEGISMEDIGINI kanitlamaktir. Biri
      // iyi niyetle "yorumsuz kayitlari da gomelim" derse (ornegin yalnizca
      // baslikla), havuza ICERIKSIZ vektorler girer ve BASKA MODULLERIN
      // parcalarini disari iter — hata SESSIZ olurdu.
      const token = await tokenFor('owner');
      await addFeedback(token, { rating: 1, comment: null });

      const response = await api()
        .post('/api/v1/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'musteriler neden memnun degil' });

      expect(response.status).toBe(200);
      const sources = response.body.sources as readonly { source: string }[];
      expect(sources.map((entry) => entry.source)).not.toContain('feedback-comments');
      // ⚠️ ELENDI DEGIL, HIC YOKTU: bozulan bir katkici `degradedSources`ta
      // gorunurdu. Bos olmasi, kaydin sessizce YOK SAYILDIGINI degil
      // SOYLEYECEK SEYI OLMADIGINI gosterir.
      expect(response.body.degradedSources).toEqual([]);
    });
  });

  describe('⚠️ ADR-0036 / ADR-0042 esik durumu — KAPANIS DENETIMI MADDESI', () => {
    it('⚠️ YAPISAL kaynak sayisi 8`DE — T2 (2K/3 = 6) ATESLEDI ve bu NORMAL', () => {
      // ============================================================
      // ⚠️ BU TEST BIR ESIGI KILITLER, BIR DAVRANISI DEGIL
      // ============================================================
      // ADR-0042 §3'un T2 esigi: "satir donduren yapisal kaynak sayisi 2K/3'u
      // GECTIGINDE". `K = 8` icin esik 6'dir.
      //
      // ⚠️ BU TEST 2026-08-27'DE GERCEGE YETISTIRILDI (6/9/15 -> 8/10/18) ve
      // eski beklenti burada KAYITLI KALIYOR ki neyin degistigi gorulsun:
      //
      //   ~~structural 6 · semantic 9 · toplam 15~~
      //
      // ⚠️ Testin KENDI YAZILI ONGORUSU GERCEKLESTI: "biri
      // `feedback-satisfaction`i eklerse bu test KIRMIZI YANAR — ve kirmizi
      // yanmasi DOGRUDUR: o gun once `retrieval.select` gozlemlenebilirlik
      // satiri, sonra olcum, sonra AYRI BIR PLATFORM ADR'si gerekir."
      //
      // ⚠️ VE SIRA TERSINE CEVRILMEDI — ucu de yapildi:
      //   1. `retrieval.select` yazildi        -> ADR-0046 (2026-08-25)
      //   2. denetim tenant'i + OLCUM yapildi  -> ADR-0048 (2026-08-25)
      //   3. AYRI BIR PLATFORM ADR'si yazildi  -> ADR-0050 (2026-08-26)
      //
      // ⚠️ ADR-0050'nin sonucu: taban `ceil(K/3)`, `K` = 8 ve rerank
      // DEGISMEDI — ama T2'nin ANLAMI degisti:
      //
      //   "Bir tetikleyici her zaman atesliyorsa, artik bir tetikleyici
      //    degildir. T2 bundan sonra HER modulde ateslenecek."
      //
      // ⚠️ Yani bu test artik "T2 ateslemesin" DEMIYOR; ⚠️ **havuzun
      // BILESIMININ SESSIZCE DEGISMEDIGINI** soyluyor. Bir modul yeni bir
      // katkici eklerse yine KIRMIZI YANAR ve yine DOGRU yanar: eklenen her
      // kaynak, yapisal tarafta TAM 3 olan yuva payindan baska bir kaynagin
      // sesini kisar (ADR-0050 §Karar 1, dort soruda olculdu).
      //
      // ⚠️ 12. modul (Sadakat) bu sayilara DOKUNMAZ: SIFIR katkici ekler
      // (ADR-0051 §3) — IK'dan sonra ikinci, ama FARKLI sebeple.
      const registry = app.get<RetrievalContributorRegistry>(RETRIEVAL_CONTRIBUTOR_REGISTRY);
      const all = registry.all();

      const structural = all.filter((c) => c.contributionKind === 'structural');
      const semantic = all.filter((c) => c.contributionKind === 'semantic');

      // ⚠️ `campaign-gap` (ADR-0047) + `feedback-satisfaction` (ADR-0045'in
      // askidaki adayi) ile 6 -> 8.
      expect(structural).toHaveLength(8);
      // ⚠️ `campaign-notes` (ADR-0047) ile 9 -> 10.
      expect(semantic).toHaveLength(10);
      // Fan-out: toplam kayitli katkici sayisi.
      expect(all).toHaveLength(18);
    });

    it('⚠️ `feedback-comments` ANLAMSAL kaydedildi — yapisal DEGIL', () => {
      const registry = app.get<RetrievalContributorRegistry>(RETRIEVAL_CONTRIBUTOR_REGISTRY);
      const feedback = registry.all().find((c) => c.source === 'feedback-comments');

      expect(feedback).toBeDefined();
      expect(feedback?.contributionKind).toBe('semantic');
      expect(feedback?.permission).toBe('feedback:read');
    });
  });

  it('BOZULAN katkici istegi cokertmez, degradedSources ta RAPORLANIR', async () => {
    const owner = await tokenFor('owner');
    await seedBothModules(owner);

    // Katkiciyi veritabani seviyesinde bozalim: `crm.interaction_chunks`
    // okunamaz hale gelirse anlamsal katkici hata firlatir.
    await database.ownerPool.query('REVOKE SELECT ON crm.interaction_chunks FROM businessos_app');

    try {
      const response = await ask(owner);

      // Istek TAMAMLANIR: bir modulun sorunu sistemi durdurmaz...
      expect(response.status).toBe(200);
      // ...ama SESSIZCE atlanmaz.
      expect(degraded(response.body)).toContain('crm-interactions');
      // Knowledge etkilenmez.
      expect(sourceLabels(response.body)).toContain('knowledge');
    } finally {
      await database.ownerPool.query('GRANT SELECT ON crm.interaction_chunks TO businessos_app');
    }
  });
});
