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
 * Bugun uc katkici var (knowledge · crm-interactions · crm-pipeline) ve uc
 * iddia gercekten olculebiliyor:
 *   1. Cross-modul: bir Knowledge notu ILE bir CRM gorusmesi AYNI cevaba
 *      kaynak olur — tek `/ask` cagrisi.
 *   2. Izni olmayan katkici HIC CAGRILMAZ ve icerigi cevaba GIRMEZ.
 *   3. Bozulan katkici `degradedSources`ta gorunur; ELENEN katkici GORUNMEZ.
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

    // ⚠️ ROL MATRISI GEREGI, "context:ask VAR ama interaction:read YOK" bir
    // kullanici BUGUN URETILEMEZ: owner/admin/member ucu de her ikisini
    // tasir, `viewer` ise ikisini de tasimaz (ADR-0031 §6).
    //
    // Yani KATKICI SEVIYESINDEKI eleme HTTP'den sinanamaz. O sozlesme
    // `AskUseCase` birim testlerinde IKI KATKICI ile sinaniyor
    // ("IZNI OLMAYAN katkici HIC CAGRILMAZ").
    //
    // Burada dogrulanan sey guard'in katkicilara HIC SIRA GELMEDEN kestigidir.
    expect((await ask(viewer)).status).toBe(403);
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
