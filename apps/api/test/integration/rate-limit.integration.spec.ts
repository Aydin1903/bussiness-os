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
 * Oran siniri (ADR-0029 §5) — uctan uca, GERCEK PostgreSQL, SAHTE saglayici.
 *
 * ============================================================================
 * BU TEST ANAHTAR ISTEMEZ VE HER CI KOSUSUNDA CALISIR
 * ============================================================================
 * `create-note` ve `ask-knowledge` entegrasyon test'leri GERCEK saglayicilarla
 * calisir ve anahtar yoksa ATLANIR. Oran siniri o testlere birakilamazdi:
 * maliyet korumasinin kendisi, yalnizca birinin cuzdaninda para varken
 * dogrulanan bir sey olamaz.
 *
 * Burada saglayicilar SAHTEDIR (dev/CI varsayilani) — ve bu, iddiayi hic
 * zayiflatmaz: sinanan sey sayacin davranisidir, cevabin kalitesi degil.
 * Sahte adapter sayesinde 61 istegi saniyeler icinde atabiliyoruz.
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

const PASSWORD = 'parola123';
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000e1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000e2';

/** Testin hizli kosmasi icin kucuk tutuldu; mekanizma sayidan bagimsizdir. */
const ASK_LIMIT = 3;
const NOTES_LIMIT = 4;

describe('Oran siniri (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    // Uygulama RLS'e TABI olan `businessos_app` rolu ile baglanir.
    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();

    // SAHTE saglayicilar: ag cagrisi YOK, para YOK. Uretimde reddedilirler.
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.LLM_PROVIDER = 'fake';
    process.env.KNOWLEDGE_ASK_RATE_LIMIT = String(ASK_LIMIT);
    process.env.KNOWLEDGE_NOTES_RATE_LIMIT = String(NOTES_LIMIT);

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

  async function signInAs(email: string, tenantId = TENANT_A): Promise<string> {
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
       VALUES ($1, $2, $3, 'owner', 'active', now())`,
      [nextId(), tenantId, userId],
    );

    const switched = await request(httpServer(app))
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${String(login.body.identityToken)}`)
      .send({ tenantId });

    return String(switched.body.accessToken);
  }

  function ask(token: string) {
    return request(httpServer(app))
      .post('/api/v1/knowledge/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Fatura sureci nasil isliyor?' });
  }

  function addNote(token: string) {
    return request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: null, body: 'Ekip uzaktan calisiyor.' });
  }

  /**
   * Sayaci elle geri alir — bir sonraki saat penceresine gecmis gibi yapar.
   *
   * Gercek zamani beklemek (bir saat) test edilemez kilardi; saati ILERLETMEK
   * yerine SAYACI GERIYE almak, ayni seyi deterministik olarak saglar: satirin
   * `window_start`'i artik "icinde bulunulan pencere" DEGILDIR, dolayisiyla
   * bir sonraki istek YENI bir satir acar ve sifirdan sayar.
   */
  async function shiftWindowBack(): Promise<void> {
    await database.ownerPool.query(
      "UPDATE platform.rate_limits SET window_start = window_start - interval '1 hour'",
    );
  }

  function countRows(): Promise<number> {
    return database.ownerPool
      .query('SELECT count(*)::int AS n FROM platform.rate_limits')
      .then((result) => Number(result.rows[0]?.n ?? 0));
  }

  // --- /knowledge/ask --------------------------------------------------------

  describe('POST /knowledge/ask', () => {
    it('limit ALTINDAKI istekler gecer', async () => {
      const token = await signInAs('ask-under@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        expect((await ask(token)).status).toBe(200);
      }
    });

    it('limit ASILINCA 429 doner', async () => {
      const token = await signInAs('ask-over@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(token);
      }

      expect((await ask(token)).status).toBe(429);
    });

    it('429 yaniti Retry-After basligi tasir', async () => {
      const token = await signInAs('ask-retry@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(token);
      }
      const rejected = await ask(token);

      // Pencerenin bitisine kalan SANIYE — sabit bir saat degil.
      const retryAfter = Number(rejected.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(3600);
    });

    it('PENCERE sifirlaninca tekrar gecer', async () => {
      const token = await signInAs('ask-window@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(token);
      }
      expect((await ask(token)).status).toBe(429);

      await shiftWindowBack();

      // Yeni pencere = YENI satir = sifirdan sayim. Ayri bir sifirlama isi yok.
      expect((await ask(token)).status).toBe(200);
    });

    it('FARKLI kullanicilarin sayaclari KARISMAZ', async () => {
      const alice = await signInAs('ask-alice@example.com');
      const bob = await signInAs('ask-bob@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(alice);
      }
      expect((await ask(alice)).status).toBe(429);

      expect((await ask(bob)).status).toBe(200);
    });

    it('FARKLI tenant larin sayaclari KARISMAZ', async () => {
      const inA = await signInAs('ask-tenant-a@example.com', TENANT_A);
      const inB = await signInAs('ask-tenant-b@example.com', TENANT_B);

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(inA);
      }
      expect((await ask(inA)).status).toBe(429);

      expect((await ask(inB)).status).toBe(200);
    });
  });

  // --- /knowledge/notes ------------------------------------------------------

  describe('POST /knowledge/notes', () => {
    it('limit ALTINDAKI istekler gecer', async () => {
      const token = await signInAs('note-under@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        expect((await addNote(token)).status).toBe(201);
      }
    });

    it('limit ASILINCA 429 doner', async () => {
      const token = await signInAs('note-over@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(token);
      }

      expect((await addNote(token)).status).toBe(429);
    });

    it('reddedilen istek NOT YAZMAZ', async () => {
      // T0 chunking'den ONCE oldugu icin ne not satiri ne parca olusmali.
      const token = await signInAs('note-nowrite@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(token);
      }
      await addNote(token);

      const notes = await database.ownerPool.query('SELECT 1 FROM knowledge.notes');
      expect(notes.rowCount).toBe(NOTES_LIMIT);
    });

    it('PENCERE sifirlaninca tekrar gecer', async () => {
      const token = await signInAs('note-window@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(token);
      }
      expect((await addNote(token)).status).toBe(429);

      await shiftWindowBack();

      expect((await addNote(token)).status).toBe(201);
    });

    it('FARKLI kullanicilarin sayaclari KARISMAZ', async () => {
      const alice = await signInAs('note-alice@example.com');
      const bob = await signInAs('note-bob@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(alice);
      }
      expect((await addNote(alice)).status).toBe(429);

      expect((await addNote(bob)).status).toBe(201);
    });

    it('FARKLI tenant larin sayaclari KARISMAZ', async () => {
      const inA = await signInAs('note-tenant-a@example.com', TENANT_A);
      const inB = await signInAs('note-tenant-b@example.com', TENANT_B);

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(inA);
      }
      expect((await addNote(inA)).status).toBe(429);

      expect((await addNote(inB)).status).toBe(201);
    });
  });

  // --- Eylem kovalari --------------------------------------------------------

  describe('Eylem kovalari AYRIDIR', () => {
    it('/ask payi bitince not eklemek HALA gecer', async () => {
      const token = await signInAs('buckets-ask@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(token);
      }
      expect((await ask(token)).status).toBe(429);

      // ADR-0029 §5: iki eylem AYRI kovadir. Soru payini tuketmek, kurumsal
      // hafizaya katki yapmayi engellememelidir.
      expect((await addNote(token)).status).toBe(201);
    });

    it('/notes payi bitince soru sormak HALA gecer', async () => {
      const token = await signInAs('buckets-note@example.com');

      for (let i = 0; i < NOTES_LIMIT; i += 1) {
        await addNote(token);
      }
      expect((await addNote(token)).status).toBe(429);

      expect((await ask(token)).status).toBe(200);
    });

    it('iki eylem AYRI SATIRLARDA sayilir', async () => {
      const token = await signInAs('buckets-rows@example.com');

      await ask(token);
      await addNote(token);

      // Ayni kullanici + ayni tenant + ayni pencere, FARKLI eylem -> iki satir.
      expect(await countRows()).toBe(2);
    });
  });

  // --- Sayac satirinin bicimi ------------------------------------------------

  describe('Sayac satiri', () => {
    it('kullanici basina TEK satir tutar, istek basina degil', async () => {
      // Log deseni yerine sayac secilmesinin olculebilir sonucu (ADR-0029 §5).
      const token = await signInAs('single-row@example.com');

      for (let i = 0; i < ASK_LIMIT; i += 1) {
        await ask(token);
      }

      expect(await countRows()).toBe(1);

      const row = await database.ownerPool.query<{ request_count: number }>(
        'SELECT request_count FROM platform.rate_limits',
      );
      expect(row.rows[0]?.request_count).toBe(ASK_LIMIT);
    });

    it('window_start SAATE yuvarlanmistir', async () => {
      const token = await signInAs('window-start@example.com');
      await ask(token);

      const row = await database.ownerPool.query<{ window_start: Date }>(
        'SELECT window_start FROM platform.rate_limits',
      );
      const windowStart = row.rows[0]?.window_start;

      expect(windowStart?.getUTCMinutes()).toBe(0);
      expect(windowStart?.getUTCSeconds()).toBe(0);
      expect(windowStart?.getUTCMilliseconds()).toBe(0);
    });
  });
});
