import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { DailyReportWorker } from '../../src/modules/knowledge/infrastructure/daily-report-worker';
import { APP_PASSWORD, APP_ROLE } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Gunluk rapor worker'i — uctan uca (ADR-0030 §2).
 *
 * GERCEK PostgreSQL (SECURITY DEFINER fonksiyonlari, RLS, dar rol) + SAHTE LLM.
 * Sahte saglayici iddiayi zayiflatmaz: sinanan sey ZINCIRDIR — claim, tenant
 * context'i altinda not okuma, isaretleme, backoff ve dar rolun siniri. Cevabin
 * KALITESI bu testin konusu degil.
 *
 * Anahtar gerektirmez, her CI kosusunda calisir.
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

interface ReportRow {
  readonly tenant_id: string;
  readonly summary: string | null;
  readonly generated_at: Date | null;
  readonly attempt_count: number;
  readonly last_error: string | null;
  readonly next_attempt_at: Date | null;
  readonly dead_lettered_at: Date | null;
}

describe('Gunluk rapor worker (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let worker: DailyReportWorker;

  beforeAll(async () => {
    database = await startTestDatabase();

    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.LLM_PROVIDER = 'fake';

    // Zamanlayici KAPALI: turlar testte ELLE tetiklenir. Acik olsaydi arka
    // planda kosan turlar iddialarla yarisirdi.
    process.env.DAILY_REPORT_ENABLED = 'false';
    // Vade saati 0: testin kostugu her saatte "bugun" vadesi gelmis sayilir.
    process.env.DAILY_REPORT_HOUR_UTC = '0';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(correlationIdMiddleware);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new ProblemDetailsFilter());

    await app.init();
    worker = app.get(DailyReportWorker);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  beforeEach(async () => {
    await database.ownerPool.query(
      'TRUNCATE platform.rate_limits, knowledge.daily_report_runs, knowledge.messages, ' +
        'knowledge.conversations, knowledge.note_chunks, knowledge.notes CASCADE',
    );
    await truncateTenantTables(database.ownerPool);
    await truncateIdentityTables(database.ownerPool);
  });

  let seq = 0;
  function nextId(): string {
    seq += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${String(seq).padStart(12, '0')}`;
  }

  async function signInAs(role: string, email: string, tenantId = TENANT_A): Promise<string> {
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
    const userId = String(rows.rows[0]?.id);

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
      .set('Authorization', `Bearer ${String(login.body.identityToken)}`)
      .send({ tenantId });

    return String(switched.body.accessToken);
  }

  /** Not ekler — tembel seed sayesinde `daily_report_runs` satiri da olusur. */
  async function addNote(token: string, body: string): Promise<void> {
    const response = await request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: null, body });

    if (response.status !== 201) {
      throw new Error(`Not eklenemedi: ${String(response.status)}`);
    }
  }

  function reports(): Promise<ReportRow[]> {
    return database.ownerPool
      .query<ReportRow>('SELECT * FROM knowledge.daily_report_runs ORDER BY tenant_id')
      .then((result) => result.rows);
  }

  function fetchReport(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/knowledge/daily-report');
    return token === undefined ? call.send() : call.set('Authorization', `Bearer ${token}`).send();
  }

  // --- Uctan uca tur ---------------------------------------------------------

  it('tembel seed ile olusan kaydi CLAIM eder ve rapor URETIR', async () => {
    const token = await signInAs('owner', 'run@example.com');
    await addNote(token, 'Bugun fatura sureci gozden gecirildi.');

    const result = await worker.runOnce();

    expect(result).toMatchObject({ claimed: 1, generated: 1, empty: 0, deadLettered: 0 });

    const rows = await reports();
    expect(rows[0]?.generated_at).toBeInstanceOf(Date);
    expect(rows[0]?.summary).toBeTruthy();
  });

  it('IKINCI tur ayni kaydi TEKRAR claim ETMEZ', async () => {
    // `generated_at` dolu oldugu icin claim sorgusunun disinda kalir; aksi
    // halde her tur ayni rapor yeniden uretilir ve para yakardi.
    const token = await signInAs('owner', 'twice@example.com');
    await addNote(token, 'Bir not.');

    await worker.runOnce();
    const second = await worker.runOnce();

    expect(second).toMatchObject({ claimed: 0 });
  });

  it('rapor SAHTE saglayicinin ciktisini tasir (zincir gercekten calisti)', async () => {
    const token = await signInAs('owner', 'chain@example.com');
    await addNote(token, 'Muhasebe ekibi fatura kesti.');

    await worker.runOnce();

    // FakeLlmAdapter deterministik bir on ek uretir; ozetin ONDAN geldigini
    // dogrulamak, LLM'in gercekten cagrildigini kanitlar.
    const rows = await reports();
    expect(rows[0]?.summary).toContain('sahte');
  });

  // --- Tenant izolasyonu -----------------------------------------------------

  it('A nin raporu B nin notlarini ICERMEZ', async () => {
    const tokenB = await signInAs('owner', 'iso-b@example.com', TENANT_B);
    await addNote(tokenB, 'B TENANTININ GIZLI NOTU');

    const tokenA = await signInAs('owner', 'iso-a@example.com', TENANT_A);
    await addNote(tokenA, 'A nin kendi notu.');

    await worker.runOnce();

    const rows = await reports();
    const reportA = rows.find((row) => row.tenant_id === TENANT_A);
    // Notlar TENANT CONTEXT'I altinda, normal RLS ile okunuyor — bu testin
    // asil isi o gercegi kanitlamak.
    expect(reportA?.summary).not.toContain('GIZLI');
  });

  it('iki tenant AYNI turda islenir', async () => {
    const tokenA = await signInAs('owner', 'multi-a@example.com', TENANT_A);
    await addNote(tokenA, 'A notu.');
    const tokenB = await signInAs('owner', 'multi-b@example.com', TENANT_B);
    await addNote(tokenB, 'B notu.');

    expect(await worker.runOnce()).toMatchObject({ claimed: 2, generated: 2 });
  });

  // --- Bos gun ---------------------------------------------------------------

  it('penceresi disinda kalan notta BOS rapor uretilir ve kayit KAPANIR', async () => {
    // Not var ama 24 saatten eski: ozetlenecek bir sey yok. ADR-0030 "bos rapor
    // uretilir" der — atlanirsa kayit her turda yeniden claim edilirdi.
    const token = await signInAs('owner', 'empty@example.com');
    await addNote(token, 'Cok eski bir not.');
    await database.ownerPool.query(
      "UPDATE knowledge.notes SET created_at = now() - interval '48 hours'",
    );

    const result = await worker.runOnce();

    expect(result).toMatchObject({ claimed: 1, generated: 1, empty: 1 });
    const rows = await reports();
    expect(rows[0]?.generated_at).toBeInstanceOf(Date);
    expect(rows[0]?.summary).toBe('Bu donemde yeni not eklenmedi.');
  });

  // --- Vade saati ------------------------------------------------------------

  it('VADESI GELMEMIS (gelecek tarihli) kayit claim EDILMEZ', async () => {
    // Vade karari SQL'e gomulu degil: `claim_daily_report_batch` bir `p_today`
    // parametresi alir ve `report_date <= p_today` filtreler. Gelecek tarihli
    // bir kayit, esik ne olursa olsun bu turda alinmamali.
    const token = await signInAs('owner', 'future@example.com');
    await addNote(token, 'Bir not.');
    await database.ownerPool.query(
      "UPDATE knowledge.daily_report_runs SET report_date = (now() + interval '2 days')::date",
    );

    const result = await worker.runOnce();

    expect(result).toMatchObject({ claimed: 0 });
    const rows = await reports();
    expect(rows[0]?.generated_at).toBeNull();
  });

  // --- Okuma ucu -------------------------------------------------------------

  describe('GET /knowledge/daily-report', () => {
    it('rapor YOKKEN 200 + report: null', async () => {
      const token = await signInAs('owner', 'read-empty@example.com');

      const response = await fetchReport(token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ report: null });
    });

    it('URETILMEMIS kayit rapor sayilmaz', async () => {
      // Tembel seed satiri olusur ama `generated_at` NULL'dir: ozeti olmayan
      // bos bir kart gostermek yanlis olurdu.
      const token = await signInAs('owner', 'read-pending@example.com');
      await addNote(token, 'Bir not.');

      expect((await fetchReport(token)).body).toEqual({ report: null });
    });

    it('uretildikten SONRA raporu doner', async () => {
      const token = await signInAs('owner', 'read-ok@example.com');
      await addNote(token, 'Bir not.');
      await worker.runOnce();

      const response = await fetchReport(token);

      expect(response.status).toBe(200);
      expect(String(response.body.report.reportDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(response.body.report.summary)).toBeTruthy();
      expect(String(response.body.report.generatedAt)).toMatch(/T/);
    });

    it('BASKA tenant in raporu GORUNMEZ (RLS)', async () => {
      const tokenB = await signInAs('owner', 'read-b@example.com', TENANT_B);
      await addNote(tokenB, 'B notu.');
      await worker.runOnce();

      const tokenA = await signInAs('owner', 'read-a@example.com', TENANT_A);

      expect((await fetchReport(tokenA)).body).toEqual({ report: null });
    });

    it('KIMLIKSIZ istek 401', async () => {
      expect((await fetchReport(undefined)).status).toBe(401);
    });

    it('viewer rolu 403 alir (report:read yok)', async () => {
      const token = await signInAs('viewer', 'read-viewer@example.com');

      expect((await fetchReport(token)).status).toBe(403);
    });

    it('member rolu OKUYABILIR', async () => {
      const token = await signInAs('member', 'read-member@example.com');

      expect((await fetchReport(token)).status).toBe(200);
    });
  });

  // --- Constraint 2 esdegeri: dar rolun siniri DEGISMEDI --------------------

  describe('businessos_report_worker siniri (Constraint 2 esdegeri)', () => {
    async function asReportWorker(sql: string): Promise<unknown> {
      const client = await database.ownerPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE businessos_report_worker');
        const result = await client.query(sql);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    it('rol NOLOGIN + BYPASSRLS tasir', async () => {
      const rows = await database.ownerPool.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
        'SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = $1',
        ['businessos_report_worker'],
      );

      expect(rows.rows[0]).toEqual({ rolcanlogin: false, rolbypassrls: true });
    });

    it('kendi tablosuna erisebilir', async () => {
      await expect(
        asReportWorker('SELECT 1 FROM knowledge.daily_report_runs LIMIT 1'),
      ).resolves.toBeDefined();
    });

    it('DIGER knowledge tablolarina erisim REDDEDILIR — bu is yetkiyi GENISLETMEDI', async () => {
      // Worker'in notlari okumasi gerekiyordu; cozum role yetki EKLEMEK DEGIL,
      // notlari normal tenant context'i altinda okumakti. Bu test o kararin
      // bekcisidir.
      for (const table of ['notes', 'note_chunks', 'conversations', 'messages']) {
        await expect(
          asReportWorker(`SELECT 1 FROM knowledge.${table} LIMIT 1`),
          `knowledge.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it('platform semasina erisim REDDEDILIR', async () => {
      for (const table of ['tenants', 'memberships', 'users']) {
        await expect(
          asReportWorker(`SELECT 1 FROM platform.${table} LIMIT 1`),
          `platform.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });
  });
});
