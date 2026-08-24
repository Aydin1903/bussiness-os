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
 * IK uclari — uctan uca (ADR-0043 Slice 2).
 *
 * ============================================================================
 * ⚠️ BU DOSYA UC SEYIN KANITIDIR
 * ============================================================================
 *   1. **Izin genisligi ILK KEZ AYNI MODULDE ayrisiyor** (§7.1):
 *      `employee:read` DORT ROL, `employee:write` owner/admin,
 *      `compensation:*` TAM DAR.
 *   2. ⚠️ **API SOZLESMESI UCRET TASIMAZ** (§4.2 katman 1) — sema testinde
 *      kolonun yoklugu kanitlaniyor; burasi DISARI CIKAN GOVDENIN de temiz
 *      oldugunu kanitliyor. Ucuncu bir agdir.
 *   3. ⚠️ **DENETIM IZI GERCEKTEN YAZILIYOR** (§6) — Slice 1'in mekanizmasinin
 *      ilk canli tuketimi, AYNI TRANSACTION'da ve YALNIZCA ALAN ADIYLA.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000b1';

describe('IK uclari (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

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
    await database.ownerPool.query('TRUNCATE hr.compensation_records, hr.employees CASCADE');
    await database.ownerPool.query('TRUNCATE platform.audit_log');
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
       VALUES ($1, $2, 'Test', 'active', $3)`,
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

  /** Belirli rolde bir kullanici + owner'in token'i. */
  async function withRole(role: string): Promise<{ token: string; ownerToken: string }> {
    const owner = await signUp(`owner-hr-${role}@example.com`);
    await createTenant(TENANT_A, owner.userId);
    await addMembership(TENANT_A, owner.userId, 'owner');
    const ownerToken = await accessToken(owner.identityToken, TENANT_A);

    if (role === 'owner') {
      return { token: ownerToken, ownerToken };
    }

    const user = await signUp(`hr-${role}@example.com`);
    await addMembership(TENANT_A, user.userId, role);
    return { token: await accessToken(user.identityToken, TENANT_A), ownerToken };
  }

  function api(token: string | undefined) {
    return {
      listEmployees: () => auth(request(httpServer(app)).get('/api/v1/hr/employees'), token),
      createEmployee: (body: unknown) =>
        auth(request(httpServer(app)).post('/api/v1/hr/employees'), token).send(body as object),
      patchEmployee: (id: string, body: unknown) =>
        auth(request(httpServer(app)).patch(`/api/v1/hr/employees/${id}`), token).send(
          body as object,
        ),
      deleteEmployee: (id: string) =>
        auth(request(httpServer(app)).delete(`/api/v1/hr/employees/${id}`), token),
      getCompensation: (id: string) =>
        auth(request(httpServer(app)).get(`/api/v1/hr/employees/${id}/compensation`), token),
      addCompensation: (id: string, body: unknown) =>
        auth(request(httpServer(app)).post(`/api/v1/hr/employees/${id}/compensation`), token).send(
          body as object,
        ),
      // --- IK v2 (ADR-0044) ---
      overview: () => auth(request(httpServer(app)).get('/api/v1/hr/overview'), token),
      listLeave: () => auth(request(httpServer(app)).get('/api/v1/hr/leave'), token),
      employeeLeave: (id: string) =>
        auth(request(httpServer(app)).get(`/api/v1/hr/employees/${id}/leave`), token),
      requestLeave: (id: string, body: unknown) =>
        auth(request(httpServer(app)).post(`/api/v1/hr/employees/${id}/leave`), token).send(
          body as object,
        ),
      decideLeave: (leaveId: string, body: unknown) =>
        auth(request(httpServer(app)).patch(`/api/v1/hr/leave/${leaveId}`), token).send(
          body as object,
        ),
    };
  }

  function auth(req: request.Test, token: string | undefined): request.Test {
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  }

  const EMPLOYEE_BODY = { fullName: 'Ayse Yilmaz', jobTitle: 'Muhasebe Uzmani' };

  // ==========================================================================
  // ⚠️ IZIN GENISLIGI — ILK KEZ AYNI MODULDE AYRISIYOR (§7.1)
  // ==========================================================================
  describe('⚠️ `employee:read` GENIS — dort rol de', () => {
    it.each(['owner', 'admin', 'member', 'viewer'])(
      '%s ekip listesini gorur -> 200',
      async (role) => {
        // Bir ekip rehberi PAYLASILAN bir is gercegidir (ADR-0034 §7'nin
        // olcutu): calisanlarin birbirinin unvanini bilmesi gunluk isin ta
        // kendisidir.
        const { token } = await withRole(role);

        expect((await api(token).listEmployees()).status).toBe(200);
      },
    );
  });

  describe('⚠️ `employee:write` DAR — Teklif/Fatura dan BILINCLI SAPMA', () => {
    it.each(['owner', 'admin'])('%s calisan olusturabilir -> 201', async (role) => {
      const { token } = await withRole(role);

      expect((await api(token).createEmployee(EMPLOYEE_BODY)).status).toBe(201);
    });

    it.each(['member', 'viewer'])('⚠️ %s calisan OLUSTURAMAZ -> 403', async (role) => {
      // ADR-0041 §9.2 `member`a yazma vermisti ("bir teklif yazmak satisin
      // gunluk isidir"). Burada tersi gecerlidir: BIR MESLEKTASIN KAYDINI
      // DEGISTIRMEK KIMSENIN GUNLUK ISI DEGILDIR.
      const { token } = await withRole(role);

      expect((await api(token).createEmployee(EMPLOYEE_BODY)).status).toBe(403);
    });
  });

  describe('⚠️ `compensation:*` TAM DAR — `read` bile owner/admin', () => {
    it.each(['member', 'viewer'])('⚠️ %s ucret gecmisini GOREMEZ -> 403', async (role) => {
      const { token, ownerToken } = await withRole(role);
      const created = await api(ownerToken).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      expect((await api(token).getCompensation(employeeId)).status).toBe(403);
    });

    it.each(['member', 'viewer'])('⚠️ %s ucret YAZAMAZ -> 403', async (role) => {
      const { token, ownerToken } = await withRole(role);
      const created = await api(ownerToken).createEmployee(EMPLOYEE_BODY);

      const response = await api(token).addCompensation(String(created.body.id), {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2026-01-01',
      });

      expect(response.status).toBe(403);
    });

    it('owner ucret gecmisini gorur ve yazar', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      const added = await api(token).addCompensation(employeeId, {
        amount: 75000,
        currency: 'try',
        effectiveFrom: '2026-01-01',
      });

      expect(added.status).toBe(201);
      // ⚠️ Kanonik bicim: `75000` -> `"75000.00"`, `try` -> `"TRY"`.
      expect(added.body).toMatchObject({ amount: '75000.00', currency: 'TRY' });

      const history = await api(token).getCompensation(employeeId);
      expect(history.status).toBe(200);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.current).toMatchObject({ amount: '75000.00' });
    });
  });

  it('kimliksiz istek -> 401', async () => {
    expect((await api(undefined).listEmployees()).status).toBe(401);
  });

  // ==========================================================================
  // ⚠️ MAAS API SOZLESMESINDE DE YOK (§4.2 katman 1)
  // ==========================================================================
  describe('⚠️ calisan cevabi UCRET TASIMAZ', () => {
    it('liste ve detay cevabinda ucret alani YOKTUR — owner ile bile', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      await api(token).addCompensation(employeeId, {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2026-01-01',
      });

      const list = await api(token).listEmployees();
      const item = (list.body.items as Record<string, unknown>[])[0] ?? {};

      expect(Object.keys(item).sort()).toEqual([
        // --- IK v2 (ADR-0044 §3) — ⚠️ BES YENI ALANIN HICBIRI PARA DEGILDIR.
        'annualLeaveDays',
        'contractEndsOn',
        'createdAt',
        'department',
        'employmentStatus',
        'employmentType',
        'endedOn',
        'fullName',
        'id',
        'jobTitle',
        'managerEmployeeId',
        'platformUserId',
        'startedOn',
        'updatedAt',
        'workEmail',
        'workMode',
        'workPhone',
      ]);

      // ⚠️ En dogrudan kontrol: tutar govdenin HICBIR YERINDE gecmiyor.
      expect(JSON.stringify(list.body)).not.toContain('75000');
    });

    it('⚠️ MAASA GORE SIRALAMA/FILTRELEME KAPALIDIR -> 422', async () => {
      // ⚠️ Gerekce ince: bir deger DONMESE BILE siralamanin kendisi bilgi
      // sizdirir — iki istekle butun ekibin ucret siralamasi cikarilirdi.
      const { token } = await withRole('owner');

      expect((await api(token).listEmployees().query({ sort: 'amount' })).status).toBe(422);
      expect((await api(token).listEmployees().query({ orderBy: 'salary' })).status).toBe(422);
      expect((await api(token).listEmployees().query({ minAmount: '1000' })).status).toBe(422);
    });

    it('⚠️ govdede `note` alani REDDEDILIR -> 422 (§1.1)', async () => {
      // Sessiz yok sayma daha kotu olurdu: kullanici yazdiginin kaydedildigini
      // SANIRDI. Bir IK kaydindaki serbest metne ilk yazilacak sey SAGLIK
      // BILGISIDIR.
      const { token } = await withRole('owner');

      const response = await api(token).createEmployee({ ...EMPLOYEE_BODY, note: 'raporlu' });

      expect(response.status).toBe(422);
    });
  });

  // ==========================================================================
  // ⚠️ DENETIM IZI — Slice 1'in ILK CANLI TUKETIMI (§6)
  // ==========================================================================
  describe('⚠️ denetim izi', () => {
    async function auditRows(): Promise<
      { action: string; field_name: string | null; resource_type: string; actor_user_id: string }[]
    > {
      const result = await database.ownerPool.query<{
        action: string;
        field_name: string | null;
        resource_type: string;
        actor_user_id: string;
      }>(
        `SELECT action, field_name, resource_type, actor_user_id
           FROM platform.audit_log ORDER BY occurred_at, field_name`,
      );
      return result.rows;
    }

    it('calisan olusturma `created` satiri yazar — alan adi YOK', async () => {
      const { token } = await withRole('owner');

      await api(token).createEmployee(EMPLOYEE_BODY);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'created',
        field_name: null,
        resource_type: 'hr.employee',
      });
    });

    it('⚠️ unvan degisikligi ALAN ADINI yazar — DEGERI YAZMAZ', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);

      await api(token).patchEmployee(String(created.body.id), {
        jobTitle: 'Kidemli Muhasebe Uzmani',
      });

      const rows = await auditRows();
      const updated = rows.filter((row) => row.action === 'updated');

      expect(updated).toHaveLength(1);
      expect(updated[0]?.field_name).toBe('job_title');

      // ⚠️ ADR-0043 §6.5'in canli kaniti: yeni unvan denetim kaydinin HICBIR
      // yerinde gecmiyor.
      const all = await database.ownerPool.query('SELECT * FROM platform.audit_log');
      expect(JSON.stringify(all.rows)).not.toContain('Kidemli');
    });

    it('iki alan degisirse IKI satir yazar ve ikisi AYNI damgayi tasir', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);

      await api(token).patchEmployee(String(created.body.id), {
        fullName: 'Ayse Demir',
        workPhone: '+90 555 111 1111',
      });

      const result = await database.ownerPool.query<{ field_name: string; occurred_at: Date }>(
        `SELECT field_name, occurred_at FROM platform.audit_log
          WHERE action = 'updated' ORDER BY field_name`,
      );

      expect(result.rows.map((row) => row.field_name)).toEqual(['full_name', 'work_phone']);
      // ⚠️ Gruplama anahtari: ayni islemin satirlari BIREBIR ayni damgayi
      // tasir (ayri bir `operation_id` kolonu YOK).
      expect(result.rows[0]?.occurred_at).toEqual(result.rows[1]?.occurred_at);
    });

    it('⚠️ HICBIR SEY DEGISMEYEN bir PATCH satir YAZMAZ', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);

      await api(token).patchEmployee(String(created.body.id), { jobTitle: 'Muhasebe Uzmani' });

      const rows = await auditRows();
      expect(rows.filter((row) => row.action === 'updated')).toHaveLength(0);
    });

    it('⚠️ UCRET EKLEME denetim satiri YAZMAZ — defter zaten cevapliyor (§6.2)', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const before = (await auditRows()).length;

      await api(token).addCompensation(String(created.body.id), {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2026-01-01',
      });

      expect((await auditRows()).length).toBe(before);

      // ⚠️ Ama "kim, ne zaman" sorusu YINE DE cevaplanabilir: defterin kendi
      // kolonlari (`recorded_by_user_id` + `recorded_at`) bunu tasir.
      const ledger = await database.ownerPool.query<{ recorded_by_user_id: string }>(
        'SELECT recorded_by_user_id FROM hr.compensation_records',
      );
      expect(ledger.rows[0]?.recorded_by_user_id).toBeTruthy();
    });

    it('denetim satiri AKTORU tasir', async () => {
      const { token } = await withRole('owner');

      await api(token).createEmployee(EMPLOYEE_BODY);

      const rows = await auditRows();
      expect(rows[0]?.actor_user_id).toBeTruthy();
    });
  });

  // ==========================================================================
  // Is kurallari
  // ==========================================================================
  describe('is kurallari', () => {
    it('⚠️ ucret kaydi olan calisan SILINEMEZ -> 409', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      await api(token).addCompensation(employeeId, {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2026-01-01',
      });

      expect((await api(token).deleteEmployee(employeeId)).status).toBe(409);
    });

    it('ucret kaydi olmayan calisan silinebilir -> 204', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);

      expect((await api(token).deleteEmployee(String(created.body.id))).status).toBe(204);
    });

    /**
     * ⚠️ ADR-0044 §1 — v1'DEKI 409 KALDIRILDI VE BU BILINCLIDIR.
     *
     * v1 ayni yururluk tarihine ikinci kaydi reddediyordu. Sonucu sudur:
     * yanlis girilen bir maasi duzeltmenin HICBIR yolu yoktu ve kullanici
     * UYDURMA BIR TARIH yazmaya itiliyordu — yani gecmis bozuluyordu.
     *
     * ⚠️ Defter yine EKLEME-YALNIZDIR: eski satir SILINMEZ, uzerine YAZILMAZ.
     * Duzeltme YENI BIR SATIRDIR; hangisinin gecerli oldugunu `recordedAt`
     * sirasi soyler ve eski satir `supersededAt` ile ISARETLI kalir.
     */
    it('⚠️ ayni yururluk tarihine IKINCI ucret bir DUZELTMEDIR -> 201', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      await api(token).addCompensation(employeeId, {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2020-01-01',
      });
      const correction = await api(token).addCompensation(employeeId, {
        amount: '82000',
        currency: 'TRY',
        effectiveFrom: '2020-01-01',
      });

      expect(correction.status).toBe(201);

      const history = await api(token).getCompensation(employeeId);

      // Guncel ucret DUZELTILMIS tutardir.
      expect(history.body.current.amount).toBe('82000.00');
      // ⚠️ ESKI SATIR SILINMEDI — defter ekleme-yalnizdir.
      const amounts: { amount: string }[] = history.body.items;

      expect(amounts).toHaveLength(2);
      expect(amounts.map((row) => row.amount).sort()).toEqual(['75000.00', '82000.00']);
    });

    /**
     * ⚠️ `supersededAt` TURETILIR, KOLON YOKTUR (§1.4).
     *
     * Bu iddia olmadan ekranda ayni tarihli iki satir gorunur ve hangisinin
     * gecerli oldugu SOYLENMEZ — kullanici yanlis rakami okur, hata SESSIZ.
     */
    it('⚠️ duzeltilen satir `supersededAt` tasir, gecerli satir TASIMAZ', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      await api(token).addCompensation(employeeId, {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2020-01-01',
      });
      await api(token).addCompensation(employeeId, {
        amount: '82000',
        currency: 'TRY',
        effectiveFrom: '2020-01-01',
      });

      const items: { amount: string; supersededAt: string | null }[] = (
        await api(token).getCompensation(employeeId)
      ).body.items;

      const stale = items.find((row) => row.amount === '75000.00');
      const live = items.find((row) => row.amount === '82000.00');

      expect(stale?.supersededAt).not.toBeNull();
      expect(live?.supersededAt).toBeNull();
    });

    /** ⚠️ FARKLI tarihler duzeltme DEGILDIR — ikisi de gecerli gecmistir. */
    it('farkli yururluk tarihlerinde HICBIRI duzeltilmis sayilmaz', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      const employeeId = String(created.body.id);

      await api(token).addCompensation(employeeId, {
        amount: '75000',
        currency: 'TRY',
        effectiveFrom: '2020-01-01',
      });
      await api(token).addCompensation(employeeId, {
        amount: '82000',
        currency: 'TRY',
        effectiveFrom: '2021-01-01',
      });

      const items: { supersededAt: string | null }[] = (
        await api(token).getCompensation(employeeId)
      ).body.items;

      expect(items.every((row) => row.supersededAt === null)).toBe(true);
    });

    it('⚠️ uye OLMAYAN kullaniciya baglanamaz -> 422', async () => {
      const { token } = await withRole('owner');
      const outsider = await signUp('disaridan@example.com');

      const response = await api(token).createEmployee({
        ...EMPLOYEE_BODY,
        platformUserId: outsider.userId,
      });

      expect(response.status).toBe(422);
    });

    it('takvimde OLMAYAN gun -> 422', async () => {
      const { token } = await withRole('owner');

      expect(
        (await api(token).createEmployee({ ...EMPLOYEE_BODY, startedOn: '2026-02-31' })).status,
      ).toBe(422);
    });

    it('⚠️ `ended` durumunda ayrilma tarihi zorunlu -> 422', async () => {
      const { token } = await withRole('owner');

      expect(
        (await api(token).createEmployee({ ...EMPLOYEE_BODY, employmentStatus: 'ended' })).status,
      ).toBe(422);
    });

    it('olmayan calisan -> 404', async () => {
      const { token } = await withRole('owner');

      expect((await api(token).deleteEmployee('018f3a2b-7c4d-7e1f-8a2b-0000000000ff')).status).toBe(
        404,
      );
    });

    it('gecersiz uuid -> 422 (rota golgelemesi)', async () => {
      const { token } = await withRole('owner');

      expect((await api(token).deleteEmployee('not-a-uuid')).status).toBe(422);
    });
  });

  // ==========================================================================
  // ⚠️ IK v2 — IZIN TAKIBI (ADR-0044 §2)
  // ==========================================================================
  describe('⚠️ izin takibi', () => {
    async function employee(token: string): Promise<string> {
      const created = await api(token).createEmployee({ ...EMPLOYEE_BODY, annualLeaveDays: 14 });
      return String(created.body.id);
    }

    it('talep 201 doner ve gun sayisini TURETIR (bas ve son dahil)', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);

      const response = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-05',
      });

      expect(response.status).toBe(201);
      expect(response.body.days).toBe(5);
      expect(response.body.status).toBe('pending');
    });

    // ========================================================================
    // ⚠️ SAGLIK VERISI SINIRI — UCUN KENDISINDE (ADR-0043 §3)
    // ========================================================================
    // Ikisi de arayuzde de yok, ama SINIR SUNUCUDA DURMALIDIR: arayuz bir gun
    // degisebilir, uc degismez.

    it('⚠️ govdede `reason` alani REDDEDILIR -> 422', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);

      const response = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-05',
        reason: 'raporlu',
      });

      expect(response.status).toBe(422);
    });

    it('⚠️ `sick` izin turu REDDEDILIR -> 422', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);

      const response = await api(token).requestLeave(employeeId, {
        type: 'sick',
        startsOn: '2026-09-01',
        endsOn: '2026-09-05',
      });

      expect(response.status).toBe(422);
    });

    it('bitis baslangictan onceyse -> 422', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);

      expect(
        (
          await api(token).requestLeave(employeeId, {
            type: 'annual',
            startsOn: '2026-09-05',
            endsOn: '2026-09-01',
          })
        ).status,
      ).toBe(422);
    });

    // ========================================================================
    // ⚠️ IZIN GENISLIKLERI: `leave:request` GENIS, `leave:decide` DAR
    // ========================================================================

    it('⚠️ member KENDI izin talebini yazabilir -> 201 (`employee:write`ten GENIS)', async () => {
      const { token, ownerToken } = await withRole('member');
      const employeeId = await employee(ownerToken);

      expect(
        (
          await api(token).requestLeave(employeeId, {
            type: 'annual',
            startsOn: '2026-09-01',
            endsOn: '2026-09-02',
          })
        ).status,
      ).toBe(201);
    });

    it('⚠️ viewer izinleri GORUR ama TALEP EDEMEZ -> 200 / 403', async () => {
      const { token, ownerToken } = await withRole('viewer');
      const employeeId = await employee(ownerToken);

      expect((await api(token).employeeLeave(employeeId)).status).toBe(200);
      expect(
        (
          await api(token).requestLeave(employeeId, {
            type: 'annual',
            startsOn: '2026-09-01',
            endsOn: '2026-09-02',
          })
        ).status,
      ).toBe(403);
    });

    it('⚠️ member TALEP EDER ama KARAR VEREMEZ -> 403', async () => {
      const { token, ownerToken } = await withRole('member');
      const employeeId = await employee(ownerToken);
      const created = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-02',
      });

      expect(
        (await api(token).decideLeave(String(created.body.id), { status: 'approved' })).status,
      ).toBe(403);
    });

    it('owner onaylar -> 200; IKINCI karar -> 409', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);
      const created = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-02',
      });
      const leaveId = String(created.body.id);

      const approved = await api(token).decideLeave(leaveId, { status: 'approved' });
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('approved');
      expect(approved.body.decidedByUserId).not.toBeNull();

      expect((await api(token).decideLeave(leaveId, { status: 'rejected' })).status).toBe(409);
    });

    // ========================================================================
    // ⚠️ BAKIYE TURETILIR — KOLON YOKTUR (§2.3)
    // ========================================================================

    it('⚠️ yalnizca ONAYLANMIS YILLIK izin hak edisten duser', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);

      // (1) onaylanmis yillik: 2 gun -> DUSER
      const annual = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-02',
      });
      await api(token).decideLeave(String(annual.body.id), { status: 'approved' });

      // (2) BEKLEYEN yillik: dusmez — talep bir tuketim degildir
      await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-10-01',
        endsOn: '2026-10-10',
      });

      // (3) ONAYLANMIS UCRETSIZ: dusmez — ucretsiz izin yillik hakki tuketmez
      const unpaid = await api(token).requestLeave(employeeId, {
        type: 'unpaid',
        startsOn: '2026-11-01',
        endsOn: '2026-11-10',
      });
      await api(token).decideLeave(String(unpaid.body.id), { status: 'approved' });

      const balance = await api(token).employeeLeave(employeeId);

      expect(balance.body.entitlementDays).toBe(14);
      expect(balance.body.usedDays).toBe(2);
      expect(balance.body.remainingDays).toBe(12);
    });

    /**
     * ⚠️ NEGATIF BAKIYE MESRUDUR VE GIZLENMEZ (§2.3).
     *
     * Hak edisinden fazla izin kullanmis bir calisan GERCEK bir durumdur;
     * sifirda kirpmak IK'nin gormesi gereken seyi SAKLAMAK olurdu.
     */
    it('⚠️ hak edis asilirsa kalan NEGATIF doner — kirpilmaz', async () => {
      const { token } = await withRole('owner');
      const created = await api(token).createEmployee({ ...EMPLOYEE_BODY, annualLeaveDays: 0 });
      const employeeId = String(created.body.id);

      const annual = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-05',
      });
      await api(token).decideLeave(String(annual.body.id), { status: 'approved' });

      const balance = await api(token).employeeLeave(employeeId);

      expect(balance.body.usedDays).toBe(5);
      expect(balance.body.remainingDays).toBe(-5);
    });

    it('⚠️ IZIN SILINEMEZ — DELETE ucu YOKTUR (404)', async () => {
      const { token } = await withRole('owner');
      const employeeId = await employee(token);
      const created = await api(token).requestLeave(employeeId, {
        type: 'annual',
        startsOn: '2026-09-01',
        endsOn: '2026-09-02',
      });

      const response = await auth(
        request(httpServer(app)).delete(`/api/v1/hr/leave/${String(created.body.id)}`),
        token,
      );

      expect(response.status).toBe(404);
    });

    it('olmayan izin -> 404', async () => {
      const { token } = await withRole('owner');

      expect(
        (
          await api(token).decideLeave('018f3a2b-7c4d-7e1f-8a2b-0000000000ff', {
            status: 'approved',
          })
        ).status,
      ).toBe(404);
    });
  });

  // ==========================================================================
  // ⚠️ DUVARIN IKI UYDUSU — SUNUCUDAN, SAYFADAN DEGIL
  // ==========================================================================
  describe('⚠️ oda ozeti (`GET /hr/overview`)', () => {
    it('bugun izinde olani ve yaklasan sozlesme bitisini SAYAR', async () => {
      const { token } = await withRole('owner');
      const today = new Date().toISOString().slice(0, 10);

      const onLeave = await api(token).createEmployee({ ...EMPLOYEE_BODY, annualLeaveDays: 30 });
      const leave = await api(token).requestLeave(String(onLeave.body.id), {
        type: 'annual',
        startsOn: today,
        endsOn: today,
      });
      await api(token).decideLeave(String(leave.body.id), { status: 'approved' });

      const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      await api(token).createEmployee({ fullName: 'Mehmet Kaya', contractEndsOn: soon });

      const overview = await api(token).overview();

      expect(overview.status).toBe(200);
      expect(overview.body.onLeaveToday).toBe(1);
      expect(overview.body.contractsEndingSoon).toBe(1);
    });

    /**
     * ⚠️ BEKLEYEN izin "bugun izinde" SAYILMAZ: talep bir izin DEGILDIR.
     * Sayilsaydi duvar, henuz onaylanmamis bir izni OLMUS gibi gosterirdi.
     */
    it('BEKLEYEN izin sayilmaz', async () => {
      const { token } = await withRole('owner');
      const today = new Date().toISOString().slice(0, 10);

      const created = await api(token).createEmployee(EMPLOYEE_BODY);
      await api(token).requestLeave(String(created.body.id), {
        type: 'annual',
        startsOn: today,
        endsOn: today,
      });

      expect((await api(token).overview()).body.onLeaveToday).toBe(0);
    });
  });
});
