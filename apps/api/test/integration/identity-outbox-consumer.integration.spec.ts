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
import {
  EmailDeliveryError,
  EMAIL_PORT,
  type EmailMessage,
  type EmailPort,
} from '../../src/shared/email.port';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Identity outbox TUKETICISI — uctan uca.
 *
 * Zincirin son halkasi: kayit bir outbox satiri birakir, tuketici onu okur ve
 * dogrulama kodunu teslim eder. Birim testleri fake repository ile calisir;
 * burada gercek `FOR UPDATE SKIP LOCKED` sorgusu, gercek jsonb payload'i ve
 * gercek DI grafigi devrededir.
 *
 * YALNIZCA `EMAIL_PORT` degistirilir: konsol adapter'i sadece loglar ve testin
 * gozleyebilecegi bir iz birakmaz. Degisen tek sey SAGLAYICIDIR — tuketici,
 * repository ve wiring gercektir. Port/adapter ayriminin somut faydasi da budur.
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
  /** Dolu ise bu adrese gonderim basarisiz olur. */
  failFor: string | null = null;
  /** `true` ise hata KALICI isaretlenir (gecersiz adres gibi). */
  permanentFailure = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failFor === message.to) {
      return Promise.reject(
        new EmailDeliveryError('teslimat reddedildi', { permanent: this.permanentFailure }),
      );
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

const EMAIL = 'user@example.com';
const PASSWORD = 'parola123';

describe('identity outbox tuketicisi (uctan uca)', () => {
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

    // Zamanlayici testlerde KAPALI (identity-env.ts); turlari test tetikler.
    relay = app.get(IdentityOutboxRelay);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  beforeEach(async () => {
    await truncateIdentityTables(database.ownerPool);
    emailPort.sent.length = 0;
    emailPort.failFor = null;
    emailPort.permanentFailure = false;
  });

  function register(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/register').send(body);
  }

  function verify(body: Record<string, unknown>) {
    return request(httpServer(app)).post('/api/v1/auth/verify-email').send(body);
  }

  async function pendingCount(): Promise<number> {
    const rows = await database.ownerPool.query(
      'SELECT 1 FROM platform.identity_outbox WHERE published_at IS NULL',
    );
    return rows.rowCount ?? 0;
  }

  async function payloadCode(): Promise<string> {
    const rows = await database.ownerPool.query<{ code: string }>(
      "SELECT payload->>'verificationCode' AS code FROM platform.identity_outbox " +
        "WHERE event_type = 'user.registered'",
    );
    return String(rows.rows[0]?.code);
  }

  it('kayit, outbox a BEKLEYEN bir satir birakir', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    // Tuketici calismadan once kod yalnizca satirda durur; kimse teslim etmedi.
    expect(await pendingCount()).toBe(1);
    expect(emailPort.sent).toHaveLength(0);
  });

  it('tur, dogrulama kodunu e-postayla teslim eder', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    const code = await payloadCode();

    await relay.runOnce();

    expect(emailPort.sent).toHaveLength(1);
    expect(emailPort.sent[0]?.to).toBe(EMAIL);
    expect(emailPort.sent[0]?.textBody).toContain(code);
  });

  it('teslim ettigi kaydi yayinlanmis olarak isaretler', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    await relay.runOnce();

    expect(await pendingCount()).toBe(0);
  });

  it('ikinci tur AYNI e-postayi tekrar GONDERMEZ', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    await relay.runOnce();
    await relay.runOnce();

    // `published_at` filtresi olmasaydi kullanici her turda bir kod alirdi.
    expect(emailPort.sent).toHaveLength(1);
  });

  it('birden fazla bekleyen kaydi TEK turda isler', async () => {
    await register({ email: 'a@example.com', password: PASSWORD });
    await register({ email: 'b@example.com', password: PASSWORD });

    await relay.runOnce();

    expect(emailPort.sent.map((message) => message.to).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect(await pendingCount()).toBe(0);
  });

  it('user.email_verified icin e-posta GONDERMEZ ama satiri kapatir', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    const code = await payloadCode();
    await relay.runOnce();
    emailPort.sent.length = 0;

    await verify({ email: EMAIL, code });
    await relay.runOnce();

    // Denetim event'i: teslimati yoktur ama bekleyen olarak BIRAKILMAZ.
    expect(emailPort.sent).toHaveLength(0);
    expect(await pendingCount()).toBe(0);
  });

  it('teslim edilen kod GERCEKTEN calisir — zincir kapandi', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    await relay.runOnce();

    // Kod, kullanicinin e-postada gordugu METINDEN okunur — veritabanindan degil.
    const delivered = emailPort.sent[0]?.textBody ?? '';
    const code = /\b(\d{6})\b/.exec(delivered)?.[1] ?? '';

    const response = await verify({ email: EMAIL, code });

    expect(response.status).toBe(200);
  });

  // --- Yeniden deneme, backoff ve dead-letter (0006, AUTH §16.1) -----------

  interface OutboxState {
    attempt_count: number;
    last_error: string | null;
    next_attempt_at: Date | null;
    dead_lettered_at: Date | null;
    published_at: Date | null;
  }

  async function outboxState(): Promise<OutboxState | undefined> {
    const rows = await database.ownerPool.query<OutboxState>(
      `SELECT attempt_count, last_error, next_attempt_at, dead_lettered_at, published_at
         FROM platform.identity_outbox WHERE event_type = 'user.registered'`,
    );
    return rows.rows[0];
  }

  /** Backoff'u geriye kaydirir — testin gercek zamani beklemesi gerekmesin. */
  async function ageBackoff(seconds: number): Promise<void> {
    await database.ownerPool.query(
      `UPDATE platform.identity_outbox
          SET next_attempt_at = next_attempt_at - make_interval(secs => $1)`,
      [seconds],
    );
  }

  it('basarisiz teslimat sayaci artirir ve son hatayi YAZAR', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;

    await relay.runOnce();

    const state = await outboxState();
    expect(state?.attempt_count).toBe(1);
    expect(state?.last_error).toContain('teslimat reddedildi');
    expect(state?.published_at).toBeNull();
  });

  it('backoff suresi DOLMADAN kayit yeniden claim EDILMEZ', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;
    await relay.runOnce();

    // Ikinci tur hemen calisir: kayit henuz hazir degil.
    await relay.runOnce();

    // Sayac artmadi — kayit hic denenmedi. Backoff olmasaydi her tur denenirdi.
    expect((await outboxState())?.attempt_count).toBe(1);
  });

  it('backoff suresi dolunca yeniden denenir', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;
    await relay.runOnce();
    await ageBackoff(120);

    await relay.runOnce();

    expect((await outboxState())?.attempt_count).toBe(2);
  });

  it('backoff dolunca teslimat BASARILI olabilir — kayit kurtarilir', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;
    await relay.runOnce();

    // Gecici kesinti gecti.
    emailPort.failFor = null;
    await ageBackoff(120);
    await relay.runOnce();

    expect(emailPort.sent).toHaveLength(1);
    expect((await outboxState())?.published_at).not.toBeNull();
  });

  it('KALICI hata ilk denemede olu mektuba dusurur', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;
    emailPort.permanentFailure = true;

    await relay.runOnce();

    const state = await outboxState();
    expect(state?.dead_lettered_at).not.toBeNull();
    expect(state?.attempt_count).toBe(1);
  });

  it('olu mektup kayitlari bir daha CLAIM EDILMEZ', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;
    emailPort.permanentFailure = true;
    await relay.runOnce();

    // Hata duzelse bile olu kayit geri gelmez.
    emailPort.failFor = null;
    await relay.runOnce();
    await relay.runOnce();

    expect(emailPort.sent).toHaveLength(0);
    expect((await outboxState())?.attempt_count).toBe(1);
  });

  it('olu kayit ARKASINDAKI gecerli e-postayi ENGELLEMEZ', async () => {
    await register({ email: 'bozuk@example.com', password: PASSWORD });
    emailPort.failFor = 'bozuk@example.com';
    emailPort.permanentFailure = true;
    await relay.runOnce();

    // Yeni bir kayit gelir; olu kayit kuyrukta degildir.
    emailPort.failFor = null;
    await register({ email: 'saglam@example.com', password: PASSWORD });
    await relay.runOnce();

    // Mekanizmanin var olma sebebi tam olarak budur.
    expect(emailPort.sent.map((message) => message.to)).toEqual(['saglam@example.com']);
  });

  it('SINIRA ulasinca olu mektuba duser', async () => {
    await register({ email: EMAIL, password: PASSWORD });
    emailPort.failFor = EMAIL;

    // 5 deneme: her turdan sonra backoff'u geriye kaydir.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await relay.runOnce();
      await ageBackoff(600);
    }

    const state = await outboxState();
    expect(state?.attempt_count).toBe(5);
    expect(state?.dead_lettered_at).not.toBeNull();
  });
});
