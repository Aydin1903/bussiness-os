import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import {
  MAX_FEEDBACK_CHANNEL_CHARS,
  MAX_FEEDBACK_COMMENT_CHARS,
} from '../../src/modules/feedback/domain/feedback-response.entity';
import { APP_PASSWORD, APP_ROLE } from './support/database-roles';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Geri bildirim uclari — RBAC + RLS + embedding zinciri UCTAN UCA (ADR-0045).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — ADR-0037 VE ADR-0039'UN ORTAK DERSI
 * ============================================================================
 * Iki kapanis denetimi de ayni seyi buldu: kusurlar YALNIZCA GERCEK BIR HTTP
 * ISTEGIYLE gorundu (multipart `.optional()`, projeksiyona gomulu alt sorgu,
 * ham `Readable`, negatif esik 422 yerine HAM 500). Dordu de birim testleriyle
 * GORUNMUYORDU.
 *
 * Bu modulun kendine ozgu iddialari:
 *
 *   1. ⚠️ **`PATCH` UCU YOK** (§2) — degistirilemezligin BIRINCI katmani HTTP
 *      yuzeyinde de gorunur.
 *   2. ⚠️ **AMA `DELETE` VAR** (§2.2) — ve `member` onu KULLANAMAZ.
 *   3. ⚠️ **ROTA SIRASI**: `POST /feedback/reindex` istegi `GET /feedback/:id`
 *      tarafindan GOLGELENMEMELI.
 *   4. ⚠️ **Katalog GENIS**: `viewer` OKUR ama YAZAMAZ; `member` YAZAR ama
 *      SILEMEZ.
 *   5. ⚠️ **Olcek disi puan 422**, sinir asan yorum 422 — sessiz kirpma YOK.
 *   6. ⚠️ **Yorumsuz kayit KABUL EDILIR** (§1.4) ve saglayiciya HIC GITMEZ.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f7';
const RECEIVED = '2026-08-24T16:30:00.000Z';

function idOf(body: unknown): string {
  return String((body as { id?: string }).id);
}

describe('Geri bildirim uclari (uctan uca)', () => {
  let app: INestApplication;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    // Uygulama RLS'e TABI olan `businessos_app` ile baglanir — superuser DEGIL.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    // Hermetiklik: gelistiricinin `.env`'i gercek bir saglayici yaziyorsa
    // testler PARA HARCARDI.
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
    await database.ownerPool.query('TRUNCATE feedback.responses CASCADE');
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
    const user = await signUp(`${role}-${String(seq)}-fb@example.com`);
    await createTenant(tenantId, user.userId);
    await addMembership(tenantId, user.userId, role);
    return accessToken(user.identityToken, tenantId);
  }

  function api() {
    return request(httpServer(app));
  }

  function createFeedback(token: string, body: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rating: 2,
        comment: 'siparisim iki hafta gecikti ve kimse donmedi',
        channel: 'Google',
        receivedAt: RECEIVED,
        ...body,
      });
  }

  // --- ⚠️ ROTA SIRASI — bu modulun EN SESSIZ riski ------------------------

  describe('⚠️ ROTA SIRASI: sabit yol `:id` TARAFINDAN GOLGELENMIYOR', () => {
    it('`POST /feedback/reindex` bir UUID sanilmiyor', async () => {
      // ⚠️ Golgelenseydi `reindex` `idParamSchema`ya duser ve 422 donerdi:
      // ekran calisir, hicbir test kirmizi yanmaz. TEK CONTROLLER + SABIT YOL
      // ONCE ile kokten kesildi (ADR-0040'in dersi).
      const token = await tokenFor('owner');

      const response = await api()
        .post('/api/v1/feedback/reindex')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ repaired: 0, failed: 0 });
    });

    it('`GET /feedback/<UUID>` 404, `not-a-uuid` 422 — AYIRT EDICI', async () => {
      const token = await tokenFor('owner');

      const missing = await api()
        .get(`/api/v1/feedback/${nextId('9c4d')}`)
        .set('Authorization', `Bearer ${token}`);
      const malformed = await api()
        .get('/api/v1/feedback/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(missing.status).toBe(404);
      expect(malformed.status).toBe(422);
    });
  });

  // --- ⚠️ DEGISTIRILEMEZ AMA SILINEBILIR (§2) -----------------------------

  describe('⚠️ DEGISTIRILEMEZ AMA SILINEBILIR (§2)', () => {
    it('⚠️ `PATCH /feedback/:id` DIYE BIR UC YOKTUR', async () => {
      // Degistirilemezligin BIRINCI katmani (izin) HTTP yuzeyinde de gorunur:
      // uc hic yazilmadi. Nest bilinmeyen bir metot/rota icin 404 doner.
      const token = await tokenFor('owner');
      const created = await createFeedback(token);

      const response = await api()
        .patch(`/api/v1/feedback/${idOf(created.body)}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5 });

      expect(response.status).toBe(404);
    });

    it('owner SILEBILIR — 204 ve kayit gercekten gider (KVKK, §2.2)', async () => {
      const token = await tokenFor('owner');
      const created = await createFeedback(token);

      const deleted = await api()
        .delete(`/api/v1/feedback/${idOf(created.body)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(deleted.status).toBe(204);

      const after = await api()
        .get(`/api/v1/feedback/${idOf(created.body)}`)
        .set('Authorization', `Bearer ${token}`);

      expect(after.status).toBe(404);
    });

    it('⚠️ olmayan kaydi silmek SESSIZ BASARILI DONMEZ — 404', async () => {
      // KVKK talebi baglaminda sessiz basari, kullanicinin "silindi sandim"
      // demesi demektir.
      const token = await tokenFor('owner');

      const response = await api()
        .delete(`/api/v1/feedback/${nextId('9c4d')}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  // --- Rol turu (§5) -------------------------------------------------------

  describe('rol turu — katalog GENIS, `delete` DAR', () => {
    it('kimliksiz istek 401', async () => {
      const response = await api().get('/api/v1/feedback');

      expect(response.status).toBe(401);
    });

    it('viewer OKUR ama YAZAMAZ (403)', async () => {
      const token = await tokenFor('viewer');

      expect(
        (await api().get('/api/v1/feedback').set('Authorization', `Bearer ${token}`)).status,
      ).toBe(200);
      expect((await createFeedback(token)).status).toBe(403);
    });

    it('⚠️ member YAZAR ama SILEMEZ (403) — silme bir YONETIM islemidir', async () => {
      const owner = await tokenFor('owner');
      const created = await createFeedback(owner);

      const member = await tokenFor('member');

      expect((await createFeedback(member)).status).toBe(201);
      expect(
        (
          await api()
            .delete(`/api/v1/feedback/${idOf(created.body)}`)
            .set('Authorization', `Bearer ${member}`)
        ).status,
      ).toBe(403);
    });
  });

  // --- Dogrulama kapilari (§1) --------------------------------------------

  describe('dogrulama kapilari — SESSIZ KIRPMA YOK', () => {
    it('⚠️ olcek disi puan 422 (0 ve 6)', async () => {
      const token = await tokenFor('owner');

      expect((await createFeedback(token, { rating: 0 })).status).toBe(422);
      expect((await createFeedback(token, { rating: 6 })).status).toBe(422);
    });

    it('⚠️ ONDALIK puan 422 — `smallint` onu SESSIZCE YUVARLARDI', async () => {
      const token = await tokenFor('owner');

      expect((await createFeedback(token, { rating: 4.5 })).status).toBe(422);
    });

    it('⚠️ OFSETSIZ zaman 422 — ayni istek iki sunucuda IKI FARKLI AN olurdu', async () => {
      const token = await tokenFor('owner');

      expect((await createFeedback(token, { receivedAt: '2026-08-24T16:30:00' })).status).toBe(422);
    });

    it('⚠️ sinir asan yorum 422 ve HICBIR KAYIT KIRPILMADI', async () => {
      const token = await tokenFor('owner');

      const response = await createFeedback(token, {
        comment: 'a'.repeat(MAX_FEEDBACK_COMMENT_CHARS + 1),
      });

      expect(response.status).toBe(422);

      // ⚠️ Kirpilmis bir kayit YAZILMADI: liste bos.
      const list = await api().get('/api/v1/feedback').set('Authorization', `Bearer ${token}`);
      expect(list.body.total).toBe(0);
    });

    it('tam sinirdaki yorum KABUL EDILIR', async () => {
      const token = await tokenFor('owner');

      const response = await createFeedback(token, {
        comment: 'a'.repeat(MAX_FEEDBACK_COMMENT_CHARS),
      });

      expect(response.status).toBe(201);
    });

    it('sinir asan kanal etiketi 422', async () => {
      const token = await tokenFor('owner');

      expect(
        (await createFeedback(token, { channel: 'x'.repeat(MAX_FEEDBACK_CHANNEL_CHARS + 1) }))
          .status,
      ).toBe(422);
    });

    it('⚠️ bilinmeyen alan 422 — `.strict()`', async () => {
      const token = await tokenFor('owner');

      expect((await createFeedback(token, { nps: 9 })).status).toBe(422);
    });

    it('⚠️ GOREMEDIGI bir kisiye baglamak 404 (§6.1)', async () => {
      // "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" AYNI
      // hatayi verir — dizin ucunu ayirt etmez, dolayisiyla cagiran da
      // SIZDIRAMAZ.
      const token = await tokenFor('owner');

      expect((await createFeedback(token, { crmContactId: nextId('9c4d') })).status).toBe(404);
    });
  });

  // --- ⚠️ Yorum OPSIYONEL (§1.4) ------------------------------------------

  describe('⚠️ yorum OPSIYONEL — ve bedeli kayitli (§1.4, §3.5)', () => {
    it('YORUMSUZ kayit 201 doner ve vektoru KALICI OLARAK bos kalir', async () => {
      const token = await tokenFor('owner');

      const response = await createFeedback(token, { comment: null });

      expect(response.status).toBe(201);
      expect(response.body.comment).toBeNull();

      // ⚠️ Vektor yok ve OLMAYACAK: gomulecek metin yoktur. Bedeli §3.5'te
      // kayitli — bu kaydin `POST /ask` havuzunda HICBIR SESI OLMAZ.
      const rows = await database.ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM feedback.responses WHERE embedding IS NULL',
      );
      expect(rows.rows[0]?.n).toBe('1');
    });

    it('YORUMLU kayit GOMULUR', async () => {
      const token = await tokenFor('owner');

      await createFeedback(token);

      const rows = await database.ownerPool.query<{ n: string }>(
        'SELECT count(*) AS n FROM feedback.responses WHERE embedding IS NOT NULL',
      );
      expect(rows.rows[0]?.n).toBe('1');
    });

    it('⚠️ YORUMSUZ kayit onarim is listesine GIRMEZ — `reindex` onu SECMEZ', async () => {
      // `embedding IS NULL` TEK BASINA yorumsuz kayitlari da secerdi ve onarim
      // SONSUZA KADAR ayni satirlari isleyip `repaired: 0` donerdi.
      const token = await tokenFor('owner');
      await createFeedback(token, { comment: null });

      const response = await api()
        .post('/api/v1/feedback/reindex')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.body).toEqual({ repaired: 0, failed: 0 });
    });
  });

  // --- Liste ---------------------------------------------------------------

  describe('liste', () => {
    it('EN YENI ONCE siralar', async () => {
      const token = await tokenFor('owner');
      await createFeedback(token, { receivedAt: '2026-08-20T10:00:00.000Z', rating: 1 });
      await createFeedback(token, { receivedAt: '2026-08-24T10:00:00.000Z', rating: 5 });

      const response = await api().get('/api/v1/feedback').set('Authorization', `Bearer ${token}`);

      const items = response.body.items as readonly { rating: number }[];
      expect(items.map((item) => item.rating)).toEqual([5, 1]);
    });

    it('puan bandi filtreler', async () => {
      const token = await tokenFor('owner');
      await createFeedback(token, { rating: 1 });
      await createFeedback(token, { rating: 5 });

      const response = await api()
        .get('/api/v1/feedback?maxRating=2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].rating).toBe(1);
    });

    it('⚠️ `minRating > maxRating` 422 — anlamsiz bir filtre sessizce bos donmez', async () => {
      const token = await tokenFor('owner');

      const response = await api()
        .get('/api/v1/feedback?minRating=5&maxRating=2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(422);
    });
  });
});
