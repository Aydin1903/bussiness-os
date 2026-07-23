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
 * `POST /api/v1/auth/resend-verification` — uctan uca.
 *
 * Sinirlarin GERCEKTEN uygulandigini kanitlar: sayimlar veritabanindaki
 * defterden gelir, kodun gecersizlesmesi gercek satirda gorunur.
 *
 * En kritik iddia: hesap bazli sinirlarin (60 sn · 5/saat) yaniti 202'dir ve
 * yalnizca IP siniri 429 uretir. Biri "hata mesajini netlestirelim" derse bu
 * testler kirmizi yanar — cunku o netlik, hesabin varligini sizdirmaktir (P2).
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
const PASSWORD = 'parola123';

describe('resend-verification (uctan uca)', () => {
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

  function register(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/register').send(body);
  }

  function resend(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/resend-verification').send(body);
  }

  function verify(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/verify-email').send(body);
  }

  /**
   * Defter satirlarini GERIYE kaydirir — testin gercek zamani beklemesi
   * gerekmesin. Bekleme suresi bir ZAMAN kuralidir; 60 saniye uyumak testi
   * kullanilamaz kilardi.
   */
  async function ageRequests(seconds: number): Promise<void> {
    await database.ownerPool.query(
      `UPDATE platform.verification_code_requests
         SET requested_at = requested_at - make_interval(secs => $1)`,
      [seconds],
    );
  }

  async function activeCodes(): Promise<number> {
    const rows = await database.ownerPool.query(
      'SELECT 1 FROM platform.email_verification_codes WHERE consumed_at IS NULL',
    );
    return rows.rowCount ?? 0;
  }

  async function requestCount(): Promise<number> {
    const rows = await database.ownerPool.query(
      'SELECT 1 FROM platform.verification_code_requests',
    );
    return rows.rowCount ?? 0;
  }

  it('kayit da deftere yazilir (60 sn kurali kayittan sonra baslar)', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    expect(await requestCount()).toBe(1);
  });

  it('bekleme suresi DOLMADAN yeni kod uretmez ama 202 doner', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    const response = await resend({ email: EMAIL });

    // 429 DEGIL: hesap bazli sinira 429 donmek hesabin varligini dogrular (P2).
    expect(response.status).toBe(202);
    expect(await activeCodes()).toBe(1);
  });

  it('bekleme suresi dolunca YENI kod uretir ve eskisini gecersizlestirir', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await ageRequests(61);

    const response = await resend({ email: EMAIL });

    expect(response.status).toBe(202);
    // ADR-0019: ayni anda gecerli kod BIR tanedir.
    expect(await activeCodes()).toBe(1);

    const consumed = await database.ownerPool.query(
      'SELECT 1 FROM platform.email_verification_codes WHERE consumed_at IS NOT NULL',
    );
    expect(consumed.rowCount).toBe(1);
  });

  it('yeni kod teslim edilir ve ESKI kod artik calismaz', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await relay.runOnce();
    const oldCode = /\b(\d{6})\b/.exec(emailPort.sent[0]?.textBody ?? '')?.[1] ?? '';

    await ageRequests(61);
    await resend({ email: EMAIL });
    await relay.runOnce();
    const newCode = /\b(\d{6})\b/.exec(emailPort.sent[1]?.textBody ?? '')?.[1] ?? '';

    expect(newCode).not.toBe(oldCode);
    // Eski kod gecersizlestirildi; kullanilamaz.
    expect((await verify({ email: EMAIL, code: oldCode })).status).toBe(400);
    expect((await verify({ email: EMAIL, code: newCode })).status).toBe(200);
  });

  it('saatlik HESAP siniri asilinca sessizce atlar — yine 202', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    // Kayit 1 satir yazdi; 4 resend daha ile hesap siniri (5) dolar.
    for (let i = 0; i < 4; i += 1) {
      await ageRequests(61);
      await resend({ email: EMAIL });
    }

    await ageRequests(61);
    const response = await resend({ email: EMAIL });

    expect(response.status).toBe(202);
    // Sinir doldu: 6. istek deftere yazilir ama KOD uretilmez.
    expect(await requestCount()).toBe(6);
    const codes = await database.ownerPool.query('SELECT 1 FROM platform.email_verification_codes');
    expect(codes.rowCount).toBe(5);
  });

  it('BILINMEYEN e-posta icin de 202 doner ve deftere yazilir', async () => {
    const response = await resend({ email: 'yok@example.com' });

    expect(response.status).toBe(202);
    // Kritik: yazilmasaydi IP siniri bilinmeyen adreslerle atlatilirdi.
    expect(await requestCount()).toBe(1);
  });

  it('bilinmeyen e-posta ile kayitli e-postanin yaniti AYNIDIR', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await ageRequests(61);

    const known = await resend({ email: EMAIL });
    const unknown = await resend({ email: 'yok@example.com' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it('IP siniri asilinca 429 doner', async () => {
    // 20 istek IP sinirini doldurur; her tur bekleme suresini de sifirlar.
    for (let i = 0; i < 20; i += 1) {
      await resend({ email: `user${String(i)}@example.com` });
    }

    const response = await resend({ email: 'baska@example.com' });

    // Hesaptan BAGIMSIZ bir sinir: 429 hicbir sey sizdirmaz.
    expect(response.status).toBe(429);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('IP siniri asan istek de deftere yazilir', async () => {
    for (let i = 0; i < 20; i += 1) {
      await resend({ email: `user${String(i)}@example.com` });
    }

    await resend({ email: 'baska@example.com' });

    // Sayilmasaydi sinir kendi kendini gevsetirdi.
    expect(await requestCount()).toBe(21);
  });

  it('zaten dogrulanmis hesaba yeni kod uretmez ama 202 doner', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await relay.runOnce();
    const code = /\b(\d{6})\b/.exec(emailPort.sent[0]?.textBody ?? '')?.[1] ?? '';
    await verify({ email: EMAIL, code });

    await ageRequests(61);
    const response = await resend({ email: EMAIL });

    expect(response.status).toBe(202);
    expect(await activeCodes()).toBe(0);
  });

  it('gecersiz e-posta bicimine 422 doner', async () => {
    expect((await resend({ email: 'gecersiz' })).status).toBe(422);
  });

  it('tanimsiz alan gonderilirse 422 doner (strict govde)', async () => {
    expect((await resend({ email: EMAIL, code: '123456' })).status).toBe(422);
  });
});
