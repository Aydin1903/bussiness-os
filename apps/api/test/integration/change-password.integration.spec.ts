import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { LAYER1_MAX_FAILURES } from '../../src/modules/identity/domain/brute-force-policy';
import { IdentityOutboxRelay } from '../../src/modules/identity/infrastructure/identity-outbox-relay';
import { EMAIL_PORT, type EmailMessage, type EmailPort } from '../../src/shared/email.port';
import { setIdentityTestEnv } from './support/identity-env';
import {
  startTestDatabase,
  truncateIdentityTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Parola DEGISTIRME — uctan uca (AUTH §7.6).
 *
 * Birim testleri fake repository ile calisir; burada gercek SQL, gercek aile
 * satirlari ve gercek DI grafigi devrededir. Uc kritik iddia:
 *
 *   1. Credential GERCEKTEN degisir (eski parola artik giris acmaz),
 *   2. DIGER oturumlar gercekten duser, ISTEGI YAPAN oturum gercekten YASAR —
 *      ikisi ayri ayri kanitlanir, "iptal sayisi" gibi dolayli bir olcuyle degil,
 *   3. Basarisiz denemeler GIRIS ile AYNI kaba kuvvet defterine yazilir: 5 yanlis
 *      degistirme denemesi ayni IP'den GIRISI de kilitler (bilincli paylasim).
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

/** `Set-Cookie`'den refresh token ciftini (`refresh_token=xxx`) cikarir. */
function extractRefreshCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const raw = (setCookie ?? []).find((entry) => entry.startsWith('refresh_token='));
  if (raw === undefined) {
    throw new Error('Yanitta refresh_token cookie si bulunamadi.');
  }
  return raw.split(';')[0] ?? '';
}

const EMAIL = 'user@example.com';
const PASSWORD = 'eskiparola1';
const NEW_PASSWORD = 'yeniparola9';
const WRONG_PASSWORD = 'yanlisparola1';

interface Session {
  readonly identityToken: string;
  readonly cookie: string;
}

describe('parola degistirme (uctan uca)', () => {
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
    // Refresh token cookie'den okunur (ADR-0026); parser olmadan `req.cookies`
    // dolmaz ve refresh her zaman 401 verirdi. main.ts ile AYNI kurulum.
    app.use(cookieParser());
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

  function postAuth(path: string) {
    return request(httpServer(app)).post(`/api/v1/auth/${path}`);
  }

  function postChangePassword() {
    return request(httpServer(app)).post('/api/v1/me/change-password');
  }

  /** Kayit + dogrulama -> giris yapilabilir aktif hesap. */
  async function signUp(): Promise<void> {
    await postAuth('register').send({ email: EMAIL, password: PASSWORD });
    await database.ownerPool.query(
      "UPDATE platform.users SET email_verified = true, status = 'active' WHERE email = $1",
      [EMAIL],
    );
  }

  /** Yeni bir oturum acar (her cagri AYRI bir token ailesi uretir). */
  async function signIn(password = PASSWORD): Promise<Session> {
    const response = await postAuth('login').send({ email: EMAIL, password });
    if (response.status !== 200) {
      throw new Error(`Giris beklenmedik bicimde ${String(response.status)} dondu.`);
    }
    return {
      identityToken: String(response.body.identityToken),
      cookie: extractRefreshCookie(response),
    };
  }

  async function passwordChangedAt(): Promise<Date> {
    const rows = await database.ownerPool.query<{ password_changed_at: Date }>(
      `SELECT password_changed_at FROM platform.credentials
         WHERE user_id = (SELECT id FROM platform.users WHERE email = $1)`,
      [EMAIL],
    );
    const value = rows.rows[0]?.password_changed_at;
    if (value === undefined) {
      throw new Error('Credential satiri bulunamadi.');
    }
    return value;
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

  async function failedAttemptCount(): Promise<number> {
    const rows = await database.ownerPool.query(
      'SELECT 1 FROM platform.login_attempts WHERE email_normalized = $1 AND succeeded = false',
      [EMAIL],
    );
    return rows.rowCount ?? 0;
  }

  // --- Mutlu yol: credential GERCEKTEN degisiyor mu ------------------------

  it('dogru mevcut parola ile 200 doner', async () => {
    await signUp();
    const session = await signIn();

    const response = await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(200);
  });

  it('credential GERCEKTEN guncellenir — eski parola CALISMAZ, yeni CALISIR', async () => {
    await signUp();
    const session = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect((await postAuth('login').send({ email: EMAIL, password: PASSWORD })).status).toBe(401);
    expect((await postAuth('login').send({ email: EMAIL, password: NEW_PASSWORD })).status).toBe(
      200,
    );
  });

  it('password_changed_at ilerler (rehash DEGIL gercek degisiklik)', async () => {
    await signUp();
    const before = await passwordChangedAt();
    const session = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect((await passwordChangedAt()).getTime()).toBeGreaterThan(before.getTime());
  });

  it('BILGILENDIRME e-postasi gonderilir (yeni parolayi TASIMAZ)', async () => {
    await signUp();
    const session = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    emailPort.sent.length = 0;
    await relay.runOnce();

    const notification = emailPort.sent.at(-1);
    expect(notification?.to).toBe(EMAIL);
    expect(notification?.subject).toContain('degistirildi');
    expect(notification?.textBody).not.toContain(NEW_PASSWORD);
  });

  // --- "Mevcut oturum HARIC" — iki iddia AYRI AYRI kanitlanir --------------

  it('DIGER oturum reddedilir, MEVCUT oturum YASAR', async () => {
    await signUp();
    const other = await signIn(); // once acilan oturum — dusmeli
    const current = await signIn(); // degisikligi YAPAN oturum — yasamali
    expect(await activeSessionCount()).toBe(2);

    await postChangePassword()
      .set('Authorization', `Bearer ${current.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    // Diger cihaz: refresh token'i artik ise yaramaz.
    expect((await postAuth('refresh').set('Cookie', other.cookie)).status).toBe(401);
    // Bu cihaz: oturum kesintisiz devam eder — parolayi BILEN kisiyi kendi
    // cihazindan atmak icin sebep yok (sifirlamadan bilincli fark).
    expect((await postAuth('refresh').set('Cookie', current.cookie)).status).toBe(200);
  });

  it('yalnizca DIGER aile "password-changed" ile iptal edilir', async () => {
    await signUp();
    await signIn();
    const current = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${current.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    const rows = await database.ownerPool.query<{ revoked_reason: string | null }>(
      'SELECT revoked_reason FROM platform.token_families ORDER BY created_at',
    );
    expect(rows.rows.map((row) => row.revoked_reason)).toEqual(['password-changed', null]);
    expect(await activeSessionCount()).toBe(1);
  });

  it('tek oturumlu kullanici HICBIR oturumunu kaybetmez', async () => {
    await signUp();
    const session = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(await activeSessionCount()).toBe(1);
    expect((await postAuth('refresh').set('Cookie', session.cookie)).status).toBe(200);
  });

  // --- Redler --------------------------------------------------------------

  it('YANLIS mevcut parolaya 400 doner ve parola DEGISMEZ', async () => {
    await signUp();
    const session = await signIn();

    const response = await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    // Eski parola HALA calisir: degisiklik gerceklesmemis.
    expect((await postAuth('login').send({ email: EMAIL, password: PASSWORD })).status).toBe(200);
  });

  it('YANLIS parola denemesi kaba kuvvet defterine KALICI yazilir', async () => {
    await signUp();
    const session = await signIn();

    await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });

    // Ret bir hata ile bildirilse ve kayit AYNI transaction'da olsaydi, bu satir
    // geri alinirdi ve sayac hic artmazdi (login ile ayni ders).
    expect(await failedAttemptCount()).toBe(1);
  });

  it('KIMLIKSIZ istege 401 doner (400 DEGIL — iki durum ayirt edilir)', async () => {
    await signUp();

    const response = await postChangePassword().send({
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
  });

  it('ZAYIF yeni parolaya 422 doner ve deneme HARCAMAZ', async () => {
    await signUp();
    const session = await signIn();

    const response = await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'kisa' });

    expect(response.status).toBe(422);
    // Politika, mevcut parola dogrulanmadan ONCE elenir: defter bos kalir.
    expect(await failedAttemptCount()).toBe(0);
  });

  it('tanimsiz alan (strict govde) 422 uretir', async () => {
    await signUp();
    const session = await signIn();

    const response = await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
      });

    expect(response.status).toBe(422);
  });

  // --- Kaba kuvvet defteri GIRIS ile PAYLASILIR (ADR-0022, bilincli) -------

  it('5 yanlis degistirme denemesi AYNI IP den GIRISI de kilitler', async () => {
    await signUp();
    const session = await signIn();

    for (let i = 0; i < LAYER1_MAX_FAILURES; i += 1) {
      const attempt = await postChangePassword()
        .set('Authorization', `Bearer ${session.identityToken}`)
        .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });
      expect(attempt.status).toBe(400);
    }

    expect(await failedAttemptCount()).toBe(LAYER1_MAX_FAILURES);

    // DOGRU parolayla giris bile reddedilir: katman 1 (e-posta, IP) kilidi.
    // Iki akis AYNI defteri paylasir — tahmin edilen sir ayni sirdir ve ayri
    // sayaclar saldirgana iki ayri butce verirdi.
    const login = await postAuth('login').send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it('kilit acikken DOGRU mevcut parola da reddedilir (P2: ayni 400)', async () => {
    await signUp();
    const session = await signIn();
    const before = await passwordChangedAt();

    for (let i = 0; i < LAYER1_MAX_FAILURES; i += 1) {
      await postChangePassword()
        .set('Authorization', `Bearer ${session.identityToken}`)
        .send({ currentPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD });
    }

    const response = await postChangePassword()
      .set('Authorization', `Bearer ${session.identityToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    // Yanlis paroladan AYIRT EDILEMEZ — ayni 400, ayni metin.
    expect(response.status).toBe(400);
    // Parola GERCEKTEN degismedi. (Bunu login ile olcmek yaniltici olurdu:
    // kilit zaten her girisi 401 yapar ve test hep gecerdi.)
    expect(await passwordChangedAt()).toEqual(before);
    // Kilitli istek parola DOGRULAMASINA hic ulasmadigi icin deftere de
    // yazilmaz: sayac 5'te kalir.
    expect(await failedAttemptCount()).toBe(LAYER1_MAX_FAILURES);
  });
});
