import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { IdentityOutboxRelay } from '../../src/modules/identity/infrastructure/identity-outbox-relay';
import { EMAIL_PORT, type EmailMessage, type EmailPort } from '../../src/shared/email.port';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Parola sifirlama — uctan uca (ADR-0024).
 *
 * Zincir: forgot-password -> (outbox tuketicisi kodu e-postalar) -> reset-password
 * -> eski parola CALISMAZ, yeni CALISIR, TUM oturumlar dusher.
 *
 * `EMAIL_PORT` kaydeden bir fake ile degistirilir; boylece teslim edilen KOD
 * gorunur olur ve testin gercek istemci gibi "e-postadan okudugu" kodla devam
 * etmesi saglanir.
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

class RecordingEmailPort implements EmailPort {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

const EMAIL = 'user@example.com';
const PASSWORD = 'eskiparola1';
const NEW_PASSWORD = 'yeniparola9';

describe('parola sifirlama (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let emailPort: RecordingEmailPort;
  let relay: IdentityOutboxRelay;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.container.getConnectionUri();
    await setIdentityTestEnv();

    emailPort = new RecordingEmailPort();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PORT)
      .useValue(emailPort)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(correlationIdMiddleware);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new ProblemDetailsFilter());

    await app.init();
    relay = app.get(IdentityOutboxRelay);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  beforeEach(async () => {
    await truncateIdentityTables(database.ownerPool);
    emailPort.sent.length = 0;
  });

  function post(path: string) {
    return request(httpServer(app)).post(`/api/v1/auth/${path}`);
  }

  /** Aktif (dogrulanmis) bir kullanici olusturur. */
  async function signUp(): Promise<void> {
    await post('register').send({ email: EMAIL, password: PASSWORD });
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [EMAIL],
    );
    // SECENEK A (paylasilan ledger): kayit da `verification_code_requests`'e
    // yazar; forgot-password'un 120 sn cooldown'i onu gorup atlardi. Gercek
    // kullanimda kayittan hemen sonra sifirlama nadirdir ve bu kisit bilinclidir;
    // test bunu, defteri geriye kaydirarak asar.
    await database.ownerPool.query(
      `UPDATE platform.verification_code_requests
         SET requested_at = requested_at - make_interval(secs => 200)`,
    );
  }

  /** Teslim edilen son e-postadan 6 haneli kodu okur (kullanici gibi). */
  function lastCode(): string {
    const body = emailPort.sent.at(-1)?.textBody ?? '';
    return /\b(\d{6})\b/.exec(body)?.[1] ?? '';
  }

  async function activeSessionCount(): Promise<number> {
    const rows = await database.ownerPool.query(
      `SELECT 1 FROM platform.token_families
         WHERE user_id = (SELECT id FROM platform.users WHERE email = $1)
           AND revoked_at IS NULL`,
      [EMAIL],
    );
    return rows.rowCount ?? 0;
  }

  // --- forgot-password -----------------------------------------------------

  it('forgot-password 202 doner ve sifirlama kodunu outbox a birakir', async () => {
    await signUp();

    const response = await post('forgot-password').send({ email: EMAIL });

    expect(response.status).toBe(202);
    const codes = await database.ownerPool.query('SELECT 1 FROM platform.password_reset_codes');
    expect(codes.rowCount).toBe(1);
  });

  it('BILINMEYEN e-posta da 202 doner (P2), kod uretmez', async () => {
    const response = await post('forgot-password').send({ email: 'yok@example.com' });

    expect(response.status).toBe(202);
    const codes = await database.ownerPool.query('SELECT 1 FROM platform.password_reset_codes');
    expect(codes.rowCount).toBe(0);
  });

  it('outbox tuketicisi sifirlama kodunu e-postayla teslim eder', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });

    await relay.runOnce();

    expect(emailPort.sent.at(-1)?.to).toBe(EMAIL);
    expect(emailPort.sent.at(-1)?.subject).toContain('sifirlama');
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  // --- reset-password: mutlu yol ------------------------------------------

  it('dogru kodla parolayi sifirlar (200) — eski parola CALISMAZ, yeni CALISIR', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });
    await relay.runOnce();
    const code = lastCode();

    const reset = await post('reset-password').send({ email: EMAIL, code, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Eski parola artik reddedilir.
    expect((await post('login').send({ email: EMAIL, password: PASSWORD })).status).toBe(401);
    // Yeni parola giris acar.
    expect((await post('login').send({ email: EMAIL, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('sifirlama TUM aktif oturumlari dusher', async () => {
    await signUp();
    // Iki oturum ac.
    await post('login').send({ email: EMAIL, password: PASSWORD });
    await post('login').send({ email: EMAIL, password: PASSWORD });
    expect(await activeSessionCount()).toBe(2);

    await post('forgot-password').send({ email: EMAIL });
    await relay.runOnce();
    await post('reset-password').send({ email: EMAIL, code: lastCode(), password: NEW_PASSWORD });

    // "hesabim ele gecirilmis olabilir" senaryosu: eski oturumlar ayakta kalamaz.
    expect(await activeSessionCount()).toBe(0);
  });

  it('sifirlama BILGILENDIRME e-postasi gonderir (kod tasimaz)', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });
    await relay.runOnce();
    await post('reset-password').send({ email: EMAIL, code: lastCode(), password: NEW_PASSWORD });
    emailPort.sent.length = 0;

    await relay.runOnce();

    const notification = emailPort.sent.at(-1);
    expect(notification?.subject).toContain('degistirildi');
    expect(notification?.textBody).not.toMatch(/\d{6}/);
  });

  // --- reset-password: redler ---------------------------------------------

  it('YANLIS koda 400 doner ve deneme sayacini KALICI artirir', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });

    const response = await post('reset-password').send({
      email: EMAIL,
      code: '000000',
      password: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    const rows = await database.ownerPool.query<{ attempt_count: number }>(
      'SELECT attempt_count FROM platform.password_reset_codes',
    );
    expect(rows.rows[0]?.attempt_count).toBe(1);
  });

  it('3 yanlis denemeden sonra DOGRU kodu da reddeder', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });
    await relay.runOnce();
    const code = lastCode();

    for (let i = 0; i < 3; i += 1) {
      await post('reset-password').send({ email: EMAIL, code: '000000', password: NEW_PASSWORD });
    }

    const response = await post('reset-password').send({ email: EMAIL, code, password: NEW_PASSWORD });
    expect(response.status).toBe(400);
  });

  it('BILINMEYEN e-postaya da AYNI 400 doner (P2)', async () => {
    const response = await post('reset-password').send({
      email: 'yok@example.com',
      code: '123456',
      password: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
  });

  it('parola politikasi ihlaline 422 doner', async () => {
    await signUp();
    await post('forgot-password').send({ email: EMAIL });
    await relay.runOnce();

    const response = await post('reset-password').send({
      email: EMAIL,
      code: lastCode(),
      password: 'kisa',
    });

    expect(response.status).toBe(422);
  });

  it('6 haneli olmayan koda 422 doner', async () => {
    await signUp();

    const response = await post('reset-password').send({
      email: EMAIL,
      code: 'abc',
      password: NEW_PASSWORD,
    });

    expect(response.status).toBe(422);
  });
});
