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
 * Randevu uclari — RBAC + RLS zinciri UCTAN UCA (ADR-0035 Slice 1).
 *
 * `finance-http` / `projects-http` ile ayni harness. Bu modulun KENDINE OZGU
 * iddialari:
 *
 *   - ⚠️ **Katalog GENIS: `viewer` OKUR, `member` YAZAR ama SILEMEZ.** Bir
 *     onceki modul (Finans) projedeki ILK dar katalogu getirmisti; bu modul o
 *     cizgiye DONMEZ. Bir randevu takvimi PAYLASILAN bir is gercegidir.
 *   - ⚠️ **`crmContactId` ve `serviceNote` govdede REDDEDILIR** (422), sessizce
 *     yok sayilmaz — yazma yollari Slice 2 ve 3.
 *   - ⚠️ **Takvim penceresi YARI ACIK**: `from` DAHIL, `to` HARIC. Onceki uc
 *     modulun "ikisi de dahil" kuralindan SAPAN tek davranis.
 *   - Durum gecisleri KISITLANMAZ (`no_show` -> `completed`).
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';

/** `items[].scheduledAt` projeksiyonu — `supertest` body'si `any`'dir. */
function scheduledAts(body: unknown): string[] {
  const items = (body as { items?: readonly { scheduledAt: string }[] }).items ?? [];
  return items.map((row) => row.scheduledAt);
}

describe('Randevu uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    // Hermetiklik: gelistiricinin `.env`'i gercek bir saglayici yaziyorsa
    // testler para harcardi. ⚠️ Bu modul Slice 1'de HICBIR AI cagrisi yapmaz;
    // satir yine de duruyor cunku `AppModule` diger modulleri de ayaga
    // kaldiriyor.
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
    await database.ownerPool.query('TRUNCATE appointments.appointments CASCADE');
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
    const user = await signUp(`${role}-${String(seq)}-ap@example.com`);
    await createTenant(tenantId, user.userId);
    await addMembership(tenantId, user.userId, role);
    return accessToken(user.identityToken, tenantId);
  }

  function api() {
    return request(httpServer(app));
  }

  function createAppointment(token: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ scheduledAt: '2026-08-20T14:30:00Z', durationMinutes: 30, ...body });
  }

  function listAppointments(token: string, query = '') {
    return api().get(`/api/v1/appointments${query}`).set('Authorization', `Bearer ${token}`);
  }

  // --- ⚠️ KATALOG GENIS (ADR-0035 §9) -------------------------------------

  it('kimliksiz istek 401 alir', async () => {
    const response = await api().get('/api/v1/appointments');
    expect(response.status).toBe(401);
  });

  it.each(['owner', 'admin', 'member', 'viewer'])('%s randevulari OKUR', async (role) => {
    // ⚠️ BU, FINANS'IN `member`/`viewer` 403 TESTININ BILINCLI KARSITIDIR.
    // Bir randevu takvimi PAYLASILAN bir is gercegidir: ekipteki kimsenin
    // "bugun kim geliyor"u gorememesi modulun amacini bozar.
    const token = await tokenFor(role);

    const read = await listAppointments(token);
    expect(read.status).toBe(200);
  });

  it.each(['owner', 'admin', 'member'])('%s randevu YAZAR', async (role) => {
    const token = await tokenFor(role);

    const created = await createAppointment(token);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ durationMinutes: 30, status: 'scheduled' });
  });

  it('viewer YAZAMAZ (403)', async () => {
    const token = await tokenFor('viewer');

    const created = await createAppointment(token);
    expect(created.status).toBe(403);
  });

  it('⚠️ member SILEMEZ ama YAZABILIR — ayrim gercektir', async () => {
    // Randevu kaydirmak gunluk bir istir; bir kaydi YOK ETMEK degil. Silme
    // GERI ALINAMAZ ve bu modulde denetim izi YOKTUR (ADR-0035 §5).
    const owner = await tokenFor('owner');
    const created = await createAppointment(owner);

    const memberUser = await signUp(`member-del-${String(seq)}-ap@example.com`);
    await addMembership(TENANT_A, memberUser.userId, 'member');
    const member = await accessToken(memberUser.identityToken, TENANT_A);

    const patched = await api()
      .patch(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${member}`)
      .send({ status: 'completed' });
    expect(patched.status).toBe(200);

    const removed = await api()
      .delete(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${member}`);
    expect(removed.status).toBe(403);
  });

  it('owner siler (204) ve kayit LISTEDEN DUSER', async () => {
    const owner = await tokenFor('owner');
    const created = await createAppointment(owner);

    const removed = await api()
      .delete(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);
    expect(removed.status).toBe(204);

    const read = await listAppointments(owner);
    expect(read.body.total).toBe(0);
  });

  it('olmayan kaydi silmek 404 doner', async () => {
    const owner = await tokenFor('owner');

    const removed = await api()
      .delete(`/api/v1/appointments/${nextId('9c4d')}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(removed.status).toBe(404);
  });

  // --- ⚠️ SLICE SINIRI: UC ALAN GOVDEDE REDDEDILIR -------------------------

  it.each([
    ['crmContactId', '018f3a2b-7c4d-7e1f-9c4d-000000000001'],
    ['serviceNote', 'Dis temizligi'],
  ])('%s govdede REDDEDILIR (422) — SESSIZCE YOK SAYILMAZ', async (field, value) => {
    // ⚠️ BU TESTIN ISI BIR SLICE SINIRINI KILITLEMEKTIR. Kolonlar migration
    // `0026`'da ACIK duruyor ama yazma yollari Slice 2 (`crmContactId`) ve
    // Slice 3 (`serviceNote`).
    //
    // `.strict()` olmasaydi alan SESSIZCE yok sayilirdi ve istemci kisi
    // bagladigini SANIP baglanmadigini HIC OGRENEMEZDI. Bu, ADR-0033 Slice 1'in
    // dersinin (dogrulanamayan isaretciyi kabul etme) HTTP tarafindaki
    // karsiligidir.
    const owner = await tokenFor('owner');

    const created = await createAppointment(owner, { [field]: value });
    expect(created.status).toBe(422);
  });

  // --- Alan dogrulamalari (ADR-0035 §2) ------------------------------------

  it.each([0, -30, 1.5, 1441])('sure %s reddedilir (422)', async (durationMinutes) => {
    const owner = await tokenFor('owner');

    const created = await createAppointment(owner, { durationMinutes });
    expect(created.status).toBe(422);
  });

  it('⚠️ OFSETSIZ zaman REDDEDILIR — sunucunun yerel saatine dusmesin diye', async () => {
    // `2026-08-20T14:30` ofsetsizdir ve sunucunun yerel saatine gore
    // yorumlanirdi: ayni istek iki farkli sunucuda IKI FARKLI ANI kaydeder ve
    // fark SESSIZ olurdu.
    const owner = await tokenFor('owner');

    const created = await createAppointment(owner, { scheduledAt: '2026-08-20T14:30' });
    expect(created.status).toBe(422);
  });

  it('taninmayan durum reddedilir (422)', async () => {
    const owner = await tokenFor('owner');

    const created = await createAppointment(owner, { status: 'postponed' });
    expect(created.status).toBe(422);
  });

  it('bos PATCH govdesi reddedilir (422)', async () => {
    const owner = await tokenFor('owner');
    const created = await createAppointment(owner);

    const patched = await api()
      .patch(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({});

    expect(patched.status).toBe(422);
  });

  // --- Durum gecisleri (ADR-0035 §2, `Appointment` sinif yorumu) -----------

  it('⚠️ `no_show` -> `completed` gecisi MESRUDUR — kisit YOK', async () => {
    // Kisi bir saat gec geldi. Engellemek kullaniciyi yazilima YALAN SOYLEMEYE
    // iterdi: durumu hic guncellemez, veri bayatlar ve Slice 4'te AI "gelmedi
    // orani yuksek" der.
    const owner = await tokenFor('owner');
    const created = await createAppointment(owner, { status: 'no_show' });

    const patched = await api()
      .patch(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'completed' });

    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('completed');
  });

  it('gonderilmeyen alana DOKUNULMAZ (PATCH, PUT degil)', async () => {
    const owner = await tokenFor('owner');
    const created = await createAppointment(owner, { durationMinutes: 45 });

    const patched = await api()
      .patch(`/api/v1/appointments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'completed' });

    expect(patched.body.durationMinutes).toBe(45);
    expect(patched.body.scheduledAt).toBe(created.body.scheduledAt);
  });

  // --- ⚠️ TAKVIM PENCERESI: `from` DAHIL, `to` HARIC (ADR-0035 §9) ---------

  it('⚠️ `to` SINIRI HARICTIR — sinirdaki randevu pencereye GIRMEZ', async () => {
    // ⚠️ BU, BU MODULUN ONCEKI UC MODULDEN SAPAN TEK OKUMA DAVRANISIDIR ve
    // testin var olma sebebi budur. Orada sinirlar takvim GUNUYDU ve ikisi de
    // dahildi ("1-31 Mart" 31 Mart'i icerir); burada bir ANDIR.
    //
    // Haftalik grid "pazartesi 00:00'dan gelecek pazartesi 00:00'a" diye sorar;
    // `<=` olsaydi gelecek haftanin ILK ANINDAKI randevu IKI HAFTADA DA
    // gorunurdu — sessiz bir cift sayim.
    const owner = await tokenFor('owner');
    await createAppointment(owner, { scheduledAt: '2026-08-17T00:00:00Z' }); // from — DAHIL
    await createAppointment(owner, { scheduledAt: '2026-08-20T14:30:00Z' }); // ic
    await createAppointment(owner, { scheduledAt: '2026-08-24T00:00:00Z' }); // to — HARIC

    const read = await listAppointments(
      owner,
      '?from=2026-08-17T00:00:00Z&to=2026-08-24T00:00:00Z',
    );

    expect(read.status).toBe(200);
    expect(read.body.total).toBe(2);
    expect(scheduledAts(read.body)).toEqual([
      '2026-08-17T00:00:00.000Z',
      '2026-08-20T14:30:00.000Z',
    ]);
  });

  it('liste ARTAN sirada doner — takvim, gecmis akisi degil', async () => {
    // ⚠️ `finance.transactions`in `desc` siralamasindan bilincli sapma: islem
    // listesi "en son ne oldu" der, randevu listesi bir TAKVIMDIR.
    const owner = await tokenFor('owner');
    await createAppointment(owner, { scheduledAt: '2026-08-22T09:00:00Z' });
    await createAppointment(owner, { scheduledAt: '2026-08-20T14:30:00Z' });

    const read = await listAppointments(owner);

    expect(scheduledAts(read.body)).toEqual([
      '2026-08-20T14:30:00.000Z',
      '2026-08-22T09:00:00.000Z',
    ]);
  });

  it('`from` `to` dan sonraysa 422', async () => {
    const owner = await tokenFor('owner');

    const read = await listAppointments(
      owner,
      '?from=2026-08-24T00:00:00Z&to=2026-08-17T00:00:00Z',
    );

    expect(read.status).toBe(422);
  });

  it('durum filtresi calisir ve sayaci da daraltir', async () => {
    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir; yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve sayfalayici var
    // olmayan sayfalar gosterirdi.
    const owner = await tokenFor('owner');
    await createAppointment(owner, { scheduledAt: '2026-08-20T09:00:00Z', status: 'scheduled' });
    await createAppointment(owner, { scheduledAt: '2026-08-21T09:00:00Z', status: 'no_show' });

    const read = await listAppointments(owner, '?status=no_show');

    expect(read.body.total).toBe(1);
    expect(scheduledAts(read.body)).toEqual(['2026-08-21T09:00:00.000Z']);
  });

  it('taninmayan sorgu parametresi reddedilir (422)', async () => {
    const owner = await tokenFor('owner');

    const read = await listAppointments(owner, '?contactId=abc');
    expect(read.status).toBe(422);
  });
});
