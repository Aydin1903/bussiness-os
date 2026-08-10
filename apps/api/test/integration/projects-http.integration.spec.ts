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
 * Projeler uclari — RBAC + RLS zinciri UCTAN UCA (ADR-0033 Slice 1-2).
 *
 * `crm-http.integration.spec` ile ayni harness ve ayni iddia sinifi. Bu
 * modulun KENDINE OZGU dort iddiasi:
 *
 *   - `GET /projects/tasks` GOLGELENMIYOR: `ProjectController`in `GET :id`
 *     rotasi onu yutmuyor (controller KAYIT SIRASI dogruluk kosuludur).
 *   - PROJESIZ gorev olusturulabiliyor ve "Yapilacaklar" kutusu okunabiliyor.
 *   - Atama, tenant'in AKTIF uyesiyle SINIRLI — baska tenant'in kullanicisi
 *     reddediliyor (ADR-0033 §4).
 *   - Proje silinince gorevleri CASCADE ile gidiyor.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';

/** `items[].title` projeksiyonu — `supertest` body'si `any`'dir. */
function titles(body: unknown): string[] {
  const items = (body as { items?: readonly { title: string }[] }).items ?? [];
  return items.map((row) => row.title);
}

describe('Projeler uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();

    // ⚠️ ACIKCA `fake`: varsayilan zaten budur ama gelistiricinin `.env`'inde
    // `EMBEDDING_PROVIDER=openai` yaziyorsa testler GERCEK API'ye gider ve para
    // harcar. Testler hermetik olmak ZORUNDADIR — `identity-env`in
    // `EMAIL_PROVIDER` icin verdigi ayni karar.
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

  /** Verilen rolde TENANT_A uyesi bir kullanici — token'i ve id'siyle. */
  async function memberOfA(role: string): Promise<{ token: string; userId: string }> {
    const user = await signUp(`${role}-${String(seq)}-p@example.com`);
    await createTenant(TENANT_A, user.userId);
    await addMembership(TENANT_A, user.userId, role);
    return { token: await accessToken(user.identityToken, TENANT_A), userId: user.userId };
  }

  async function tokenFor(role: string): Promise<string> {
    return (await memberOfA(role)).token;
  }

  function api() {
    return request(httpServer(app));
  }

  function createProject(token: string, name = 'Web sitesi yenileme') {
    return api()
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, status: 'in_progress' });
  }

  function createTask(token: string, body: Record<string, unknown>) {
    return api().post('/api/v1/projects/tasks').set('Authorization', `Bearer ${token}`).send(body);
  }

  // --- Rota golgeleme: bu modulun EN KIRILGAN detayi -----------------------

  it('GET /projects/tasks, GET /projects/:id tarafindan GOLGELENMIYOR', async () => {
    // ⚠️ NestJS rotalari KAYIT SIRASINA gore eslestirir. `ProjectController`
    // once kaydedilseydi bu istek `:id` rotasina duser ve `tasks` bir UUID
    // olmadigi icin 422 donerdi. `projects.module.ts` sirayi acikca sabitliyor;
    // bu test o sirayi KILITLER.
    const owner = await tokenFor('owner');

    const response = await api()
      .get('/api/v1/projects/tasks')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  // --- Kaynak bazli izinler (ADR-0033 §7) ---------------------------------

  it('viewer OKUR ama YAZAMAZ', async () => {
    const owner = await tokenFor('owner');
    await createProject(owner);
    const viewer = await tokenFor('viewer');

    const read = await api().get('/api/v1/projects').set('Authorization', `Bearer ${viewer}`);
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    const write = await createProject(viewer, 'Olmamali');
    expect(write.status).toBe(403);
  });

  it('member YAZAR ama SILEMEZ', async () => {
    const member = await tokenFor('member');
    const created = await createProject(member);
    expect(created.status).toBe(201);

    const removed = await api()
      .delete(`/api/v1/projects/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${member}`);

    // Silme GERI ALINAMAZ ve Slice 3'ten sonra AI hafizasindan da siler;
    // `project:delete` bu yuzden `write`tan ayri tutuldu.
    expect(removed.status).toBe(403);
  });

  it('kimliksiz istek 401 alir', async () => {
    const response = await api().get('/api/v1/projects');
    expect(response.status).toBe(401);
  });

  // --- Projesiz gorev: modulun karakteristik karari ------------------------

  it('PROJESIZ gorev olusturulabilir ve kutuda gorunur', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);

    await createTask(owner, { title: 'Faturayi gonder' });
    await createTask(owner, { title: 'Ana sayfa', projectId: String(project.body.id) });

    const inbox = await api()
      .get('/api/v1/projects/tasks?withoutProject=true')
      .set('Authorization', `Bearer ${owner}`);

    expect(inbox.status).toBe(200);
    expect(titles(inbox.body)).toEqual(['Faturayi gonder']);
  });

  it('projectId ile withoutProject BIRLIKTE gonderilemez', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);

    const response = await api()
      .get(`/api/v1/projects/tasks?withoutProject=true&projectId=${String(project.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    // Sessizce birini secmek, istemci hatasini 200'e cevirirdi.
    expect(response.status).toBe(422);
  });

  it('VAR OLMAYAN projeye gorev baglanamaz (404)', async () => {
    const owner = await tokenFor('owner');

    const response = await createTask(owner, {
      title: 'Yetim',
      projectId: '018f3a2b-7c4d-7e1f-8a2b-0000000000ff',
    });

    expect(response.status).toBe(404);
  });

  // --- Atama dogrulamasi (ADR-0033 §4) ------------------------------------

  it('gorev, tenant in AKTIF uyesine atanabilir', async () => {
    const owner = await memberOfA('owner');

    const response = await createTask(owner.token, {
      title: 'Ana sayfa',
      assigneeUserId: owner.userId,
    });

    expect(response.status).toBe(201);
    expect(response.body.assigneeUserId).toBe(owner.userId);
  });

  it('BASKA TENANT in kullanicisina atama REDDEDILIR (422)', async () => {
    const owner = await memberOfA('owner');

    // B tenant'inda bir kullanici; A ile hicbir uyeligi yok.
    const outsider = await signUp('yabanci-p@example.com');
    await createTenant(TENANT_B, outsider.userId);
    await addMembership(TENANT_B, outsider.userId, 'owner');

    const response = await createTask(owner.token, {
      title: 'Sizinti denemesi',
      assigneeUserId: outsider.userId,
    });

    // 404 DEGIL 422: istekteki kaynak yok degil, govdedeki ALAN gecersiz.
    // Mesaj "kullanici yok" ile "uye degil"i AYIRT ETMEZ — bir id'nin sistemde
    // kayitli oldugunu sizdirmemek icin.
    expect(response.status).toBe(422);
  });

  it('ATANMAMIS gorev mesrudur', async () => {
    const owner = await tokenFor('owner');
    const response = await createTask(owner, { title: 'Kimseye atanmadi' });

    expect(response.status).toBe(201);
    expect(response.body.assigneeUserId).toBeNull();
  });

  // --- Cascade + sayaclar --------------------------------------------------

  it('proje silinince gorevleri CASCADE ile gider', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);
    const projectId = String(project.body.id);

    await createTask(owner, { title: 'Ana sayfa', projectId });
    await createTask(owner, { title: 'Faturayi gonder' });

    await api().delete(`/api/v1/projects/${projectId}`).set('Authorization', `Bearer ${owner}`);

    const remaining = await api()
      .get('/api/v1/projects/tasks')
      .set('Authorization', `Bearer ${owner}`);

    // Projesiz gorev AYAKTA kalir — cascade'e girmez.
    expect(titles(remaining.body)).toEqual(['Faturayi gonder']);
  });

  it('proje listesi ACIK ve GECIKMIS gorev sayaclarini tasir', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);
    const projectId = String(project.body.id);

    await createTask(owner, { title: 'Acik', projectId });
    await createTask(owner, { title: 'Gecikmis', projectId, dueOn: '2020-01-01' });
    await createTask(owner, { title: 'Bitmis', projectId, status: 'done' });
    // Kapanmis ama tarihi gecmis: GECIKMIS SAYILMAZ.
    await createTask(owner, {
      title: 'Bitmis-eski',
      projectId,
      status: 'done',
      dueOn: '2020-01-01',
    });

    const list = await api().get('/api/v1/projects').set('Authorization', `Bearer ${owner}`);

    // Sayaclar TURETILIR, kolonda saklanmaz. "Acik" kapanmislari dislar;
    // "gecikmis" onun ALT KUMESIDIR.
    expect(list.body.items[0].openTaskCount).toBe(2);
    expect(list.body.items[0].overdueTaskCount).toBe(1);
  });

  it('gecikmis filtresi kapanmis gorevleri DISLAR', async () => {
    const owner = await tokenFor('owner');

    await createTask(owner, { title: 'Gecikmis', dueOn: '2020-01-01' });
    await createTask(owner, { title: 'Bitmis-eski', status: 'done', dueOn: '2020-01-01' });
    await createTask(owner, { title: 'Tarihsiz' });

    const response = await api()
      .get('/api/v1/projects/tasks?overdue=true')
      .set('Authorization', `Bearer ${owner}`);

    expect(titles(response.body)).toEqual(['Gecikmis']);
  });

  // --- PATCH kismidir ------------------------------------------------------

  it('PATCH KISMIDIR: gonderilmeyen alan korunur', async () => {
    const owner = await tokenFor('owner');
    const created = await createTask(owner, { title: 'Ana sayfa', dueOn: '2026-12-01' });

    const updated = await api()
      .patch(`/api/v1/projects/tasks/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'in_progress' });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('in_progress');
    // `PUT` olsaydi bu alan sessizce null'lanirdi.
    expect(updated.body.dueOn).toBe('2026-12-01');
  });

  // --- Ilerleme notlari + embedding (ADR-0033 §6) -------------------------
  //
  // Bu blok Projeler'in AI'a ILK KEZ dokundugu yolu kanitlar. Entegrasyon
  // ortaminda `EMBEDDING_PROVIDER=fake`'tir: vektorler sahtedir ama AKIS
  // gercektir (chunking, baglam basligi, iki transaction, parca yazimi).

  function createNote(token: string, projectId: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/projects/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, body: 'Tasarim onaylandi, kodlamaya gecildi.', ...body });
  }

  it('GET /projects/notes de GOLGELENMIYOR', async () => {
    // `GET /projects/tasks` ile ayni tuzak; `ProgressNoteController` da
    // `ProjectController`dan ONCE kayitli olmak zorunda.
    const owner = await tokenFor('owner');

    const response = await api()
      .get('/api/v1/projects/notes')
      .set('Authorization', `Bearer ${owner}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('ilerleme notu kaydedilir ve PARCALANIR', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);

    const response = await createNote(owner, String(project.body.id));

    expect(response.status).toBe(201);
    expect(response.body.chunkCount).toBeGreaterThan(0);
  });

  it('PARCA METNI BAGLAM BASLIGI TASIR — bu slice in kritik iddiasi', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner, 'Web sitesi yenileme');

    // Govde proje adini HIC gecirmez.
    const body = 'Tasarim onaylandi, kodlamaya gecildi.';
    expect(body).not.toContain('Web sitesi');

    await createNote(owner, String(project.body.id), { body });

    const rows = await database.ownerPool.query<{ content: string }>(
      'SELECT content FROM projects.progress_note_chunks',
    );

    // Baslik olmasaydi "Web sitesi projesinde ne oldu?" sorusu HICBIR parcayla
    // eslesmezdi: notun kimligi FK kolonundadir, metinde degil.
    expect(rows.rows[0]?.content).toContain('[Web sitesi yenileme · ');
    expect(rows.rows[0]?.content).toContain(body);
  });

  it('viewer notu OKUR ama YAZAMAZ — uretmek para harcar', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);
    await createNote(owner, String(project.body.id));

    const viewer = await tokenFor('viewer');

    const read = await api().get('/api/v1/projects/notes').set('Authorization', `Bearer ${viewer}`);
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    // `progress_note:create` viewer'da YOK: bir izleyicinin sayfa yenileyerek
    // para harcayabilmesi bir butce deligi olurdu (`company:summarize` ile
    // ayni ayrim).
    const write = await createNote(viewer, String(project.body.id));
    expect(write.status).toBe(403);
  });

  it('VAR OLMAYAN projeye not baglanamaz -> 404', async () => {
    const owner = await tokenFor('owner');
    const response = await createNote(owner, '018f3a2b-7c4d-7e1f-8a2b-0000000000ee');
    expect(response.status).toBe(404);
  });

  it('BASKA PROJENIN gorevine baglanan not REDDEDILIR -> 404', async () => {
    const owner = await tokenFor('owner');
    const projectA = await createProject(owner, 'A projesi');
    const projectB = await createProject(owner, 'B projesi');

    const taskInB = await createTask(owner, {
      title: 'B nin gorevi',
      projectId: String(projectB.body.id),
    });

    // Kontrol olmasaydi iki proje birbirinin gecmisine sizardi.
    const response = await createNote(owner, String(projectA.body.id), {
      taskId: String(taskInB.body.id),
    });

    expect(response.status).toBe(404);
  });

  it('PARCASIZ not sayilir ve `reindex` ONARIR', async () => {
    const owner = await tokenFor('owner');
    const project = await createProject(owner);
    await createNote(owner, String(project.body.id));

    // "Parcasiz not" durumunu elle uret: T2'nin cokmus hali (ADR-0029 §4).
    await database.ownerPool.query('DELETE FROM projects.progress_note_chunks');

    const before = await api()
      .get('/api/v1/projects/notes/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    expect(before.body.count).toBe(1);

    const repair = await api()
      .post('/api/v1/projects/reindex')
      .set('Authorization', `Bearer ${owner}`);
    expect(repair.status).toBe(200);
    expect(repair.body).toEqual({ repaired: 1, failed: 0 });

    const after = await api()
      .get('/api/v1/projects/notes/unindexed')
      .set('Authorization', `Bearer ${owner}`);
    // Is listesi TURETILMISTIR: parcanin YOKLUGU is listesinin KENDISIDIR.
    expect(after.body.count).toBe(0);
  });

  it('notlar projeye gore filtrelenir', async () => {
    const owner = await tokenFor('owner');
    const projectA = await createProject(owner, 'A projesi');
    const projectB = await createProject(owner, 'B projesi');

    await createNote(owner, String(projectA.body.id), { body: 'A notu' });
    await createNote(owner, String(projectB.body.id), { body: 'B notu' });

    const response = await api()
      .get(`/api/v1/projects/notes?projectId=${String(projectA.body.id)}`)
      .set('Authorization', `Bearer ${owner}`);

    const bodies = (response.body.items as readonly { body: string }[]).map((row) => row.body);
    expect(bodies).toEqual(['A notu']);
  });

  it('baska tenant in gorevi 404 alir — 403 DEGIL', async () => {
    const owner = await memberOfA('owner');
    const created = await createTask(owner.token, { title: 'A nin gorevi' });

    const outsider = await signUp('digertenant-p@example.com');
    await createTenant(TENANT_B, outsider.userId);
    await addMembership(TENANT_B, outsider.userId, 'owner');
    const bToken = await accessToken(outsider.identityToken, TENANT_B);

    const response = await api()
      .get(`/api/v1/projects/tasks/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${bToken}`);

    // Varligi sizdirilmaz (P2): "yok" ile "senin degil" ayirt EDILMEZ.
    expect(response.status).toBe(404);
  });
});
