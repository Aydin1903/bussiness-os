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
 * `GET /api/v1/knowledge/notes/exists` — onboarding tetikleme kosulu
 * (ADR-0030 §3).
 *
 * GERCEK PostgreSQL, SAHTE embedding saglayicisi: bu ucun kendisi AI cagrisi
 * YAPMAZ, on kosulu olan not eklemenin de gercek bir embedding uretmesi
 * gerekmez. Sinanan sey RLS altindaki VARLIK sorgusudur — anahtar gerektirmez,
 * her CI kosusunda calisir.
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
const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';

describe('GET /knowledge/notes/exists (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    database = await startTestDatabase();

    const c = database.container;
    process.env.DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@${c.getHost()}:${String(c.getPort())}/${c.getDatabase()}`;
    await setIdentityTestEnv();
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.LLM_PROVIDER = 'fake';

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
      'TRUNCATE knowledge.rate_limits, knowledge.daily_report_runs, knowledge.messages, ' +
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

  function notesExist(token: string | undefined) {
    const call = request(httpServer(app)).get('/api/v1/knowledge/notes/exists');
    return token === undefined ? call.send() : call.set('Authorization', `Bearer ${token}`).send();
  }

  function addNote(token: string, body = 'Ekip uzaktan calisiyor.') {
    return request(httpServer(app))
      .post('/api/v1/knowledge/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: null, body });
  }

  // --- Varlik durumu ---------------------------------------------------------

  it('BOS tenant icin hasNotes false', async () => {
    const token = await signInAs('owner', 'empty@example.com');

    const response = await notesExist(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hasNotes: false });
  });

  it('not eklendikten SONRA hasNotes true', async () => {
    const token = await signInAs('owner', 'filled@example.com');
    expect((await addNote(token)).status).toBe(201);

    expect((await notesExist(token)).body).toEqual({ hasNotes: true });
  });

  it('cok not olsa da yine boolean doner (SAYMAZ)', async () => {
    const token = await signInAs('owner', 'many@example.com');
    await addNote(token, 'Birinci not.');
    await addNote(token, 'Ikinci not.');
    await addNote(token, 'Ucuncu not.');

    expect((await notesExist(token)).body).toEqual({ hasNotes: true });
  });

  // --- RLS: asil iddia -------------------------------------------------------

  it('BASKA tenant in notu hasNotes i true YAPMAZ (RLS)', async () => {
    // Onboarding acisindan kritik: B'nin notlari yuzunden A'nin kullanicisi
    // wizard'i HIC gormezse, A'nin kurumsal hafizasi bos baslar.
    const tokenB = await signInAs('owner', 'rls-b@example.com', TENANT_B);
    expect((await addNote(tokenB, 'B tenant inin notu.')).status).toBe(201);

    const tokenA = await signInAs('owner', 'rls-a@example.com', TENANT_A);

    expect((await notesExist(tokenA)).body).toEqual({ hasNotes: false });
    expect((await notesExist(tokenB)).body).toEqual({ hasNotes: true });
  });

  it('ayni tenant taki BASKA kullanici da true gorur (not TENANT indir)', async () => {
    // Not kullaniciya degil TENANT'a aittir: bir meslektas not eklediyse
    // sirketin hafizasi artik bos degildir ve wizard tekrar sorulmamalidir.
    const alice = await signInAs('owner', 'shared-alice@example.com');
    await addNote(alice, 'Alice in notu.');

    const bob = await signInAs('member', 'shared-bob@example.com');

    expect((await notesExist(bob)).body).toEqual({ hasNotes: true });
  });

  // --- Yetki -----------------------------------------------------------------

  it('KIMLIKSIZ istek 403 (guard handler dan ONCE calisir)', async () => {
    expect((await notesExist(undefined)).status).toBe(403);
  });

  it('viewer rolu 403 alir (note:read yok)', async () => {
    const token = await signInAs('viewer', 'viewer@example.com');

    expect((await notesExist(token)).status).toBe(403);
  });

  it('member rolu OKUYABILIR', async () => {
    const token = await signInAs('member', 'member@example.com');

    expect((await notesExist(token)).status).toBe(200);
  });

  it('admin rolu OKUYABILIR', async () => {
    const token = await signInAs('admin', 'admin@example.com');

    expect((await notesExist(token)).status).toBe(200);
  });
});
