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
  it('⚠️ DORT MODULUN icerigi AYNI cevapta bulusuyor — tek /ask cagrisi', async () => {
    const owner = await tokenFor('owner');
    await seedBothModules(owner);
    await seedProjects(owner);
    await seedFinance(owner);

    const response = await ask(owner, 'Son donemde sirkette neler oldu?');

    expect(response.status).toBe(200);

    const labels = new Set(sourceLabels(response.body));
    // Havuz sekiz yuvali ve ALTI katkici besliyor; hepsinin ayni anda girmesi
    // garanti DEGIL. Iddia bu yuzden "her modulden EN AZ BIR kaynak" seklinde
    // kuruluyor — modul BASINA, katkici basina degil.
    const modules = {
      knowledge: labels.has('knowledge'),
      crm: labels.has('crm-interactions') || labels.has('crm-pipeline'),
      projects: labels.has('project-notes') || labels.has('project-status'),
      finance: labels.has('finance-commentaries') || labels.has('finance-cashflow'),
    };

    expect(modules).toEqual({ knowledge: true, crm: true, projects: true, finance: true });
    expect(degraded(response.body)).toEqual([]);
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
