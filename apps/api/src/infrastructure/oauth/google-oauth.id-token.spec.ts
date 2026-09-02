import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { type Clock } from '../../shared/clock.port';
import { GoogleOAuthAdapter } from './google-oauth.adapter';

/**
 * ============================================================================
 * ⚠️ ADR-0053 EK-1.2 — BES DOGRULAMANIN HER BIRI AYRI TESTLE KILITLENIR
 * ============================================================================
 * Onay kosulu (PO Kalem G) tam olarak buydu: imza · `iss` · `aud` · `exp` ·
 * `nonce` — besi de ZORUNLU ve her biri AYRI bir testle.
 *
 * ⚠️ IKISI "SESSIZ SINIF"TIR ve ayri ayri isaretlenmistir:
 *
 *   `aud`   -> atlanirsa BASKA BIR SITENIN Google token'i bizde gecerli olur.
 *   `nonce` -> atlanirsa calinmis bir token YENIDEN OYNATILIR.
 *
 * Ikisinin de ortak ozelligi sudur: ⚠️ **token gecerli GORUNUR, imza TUTAR,
 * kullanici GIRER — yalnizca YANLIS KISI girer.** Yani kusur ne derlemede ne
 * testte ne de log'da kendini gosterir; yalnizca bir gun yanlis kisi iceride
 * olur. Bu yuzden her biri kendi testini hak eder.
 *
 * ⚠️ Testler GERCEK bir imza dogrulamasi yapar: yerel bir anahtar cifti
 * uretilir ve JWKS uc noktasi `fetch` seviyesinde taklit edilir. Adapter'in
 * `jwtVerify` cagrisi OLDUGU GIBI kosar — dogrulama mantigi sahtelenmez.
 * ============================================================================
 */

const CLIENT_ID = 'bizim-client-id.apps.googleusercontent.com';
const BASKA_SITE_CLIENT_ID = 'baska-sitenin-client-id.apps.googleusercontent.com';
const NONCE = 'sunucunun-urettigi-nonce-degeri';
const SUBJECT = 'google-sub-9988776655';
const T0 = new Date('2026-09-02T12:00:00.000Z');

class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return new Date(this.value.getTime());
  }
}

let signingKey: CryptoKey;
let jwks: unknown;
/** Adapter'in JWKS'i baska bir anahtardan cekmesi icin — imza testi. */
let foreignKey: CryptoKey;

beforeAll(async () => {
  const main = await generateKeyPair('RS256', { extractable: true });
  const foreign = await generateKeyPair('RS256', { extractable: true });

  signingKey = main.privateKey;
  foreignKey = foreign.privateKey;

  jwks = { keys: [{ ...(await exportJWK(main.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

/** Google'in JWKS ucunu taklit eder; baska hicbir ag cagrisina izin vermez. */
function stubJwks(): void {
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(input);
    if (url.includes('googleapis.com/oauth2/v3/certs')) {
      return Promise.resolve(
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    throw new Error(`beklenmeyen ag cagrisi: ${url}`);
  });
}

interface TokenOverrides {
  readonly issuer?: string;
  readonly audience?: string;
  readonly nonce?: string;
  readonly expiresAt?: Date;
  readonly key?: CryptoKey;
  readonly emailVerified?: boolean;
}

/** Varsayilan olarak GECERLI bir Google ID token uretir. */
async function idToken(overrides: TokenOverrides = {}): Promise<string> {
  const issuedAt = Math.floor(T0.getTime() / 1000) - 60;
  const expires = Math.floor(
    (overrides.expiresAt ?? new Date(T0.getTime() + 600_000)).getTime() / 1000,
  );

  return new SignJWT({
    nonce: overrides.nonce ?? NONCE,
    email: 'kullanici@ornek.com',
    email_verified: overrides.emailVerified ?? true,
    name: 'Ornek Kullanici',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(overrides.issuer ?? 'https://accounts.google.com')
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject(SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expires)
    .sign(overrides.key ?? signingKey);
}

function adapter(): GoogleOAuthAdapter {
  stubJwks();
  return new GoogleOAuthAdapter({
    clientId: CLIENT_ID,
    clientSecret: 'kullanilmaz-one-tap-yolunda',
    clock: new FixedClock(T0),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GoogleOAuthAdapter.verifyIdToken — taban: GECERLI token kabul edilir', () => {
  it('bes kontrolun besi de saglandiginda kimlik doner', async () => {
    const token = await idToken();

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).resolves.toMatchObject({
      provider: 'google',
      subject: SUBJECT,
      email: 'kullanici@ornek.com',
      emailVerified: true,
    });
  });

  /**
   * ⚠️ HUKUM CLAIM'IN KENDISIDIR (ADR-0053 §6) ve One Tap yolunda da AYNIDIR:
   * `email_verified: false` gelen bir token REDDEDILMEZ — akis D3'e duser ve
   * kullanici KENDI kodumuzla dogrulanir. Kullanici GIS kutusuna tikladi diye
   * hukum GEVSEMEZ.
   */
  it('`email_verified: false` REDDEDILMEZ, hukum olarak TASINIR (D3 girdisi)', async () => {
    const token = await idToken({ emailVerified: false });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).resolves.toMatchObject({
      emailVerified: false,
    });
  });
});

// ============================================================================
// ⚠️ BES DOGRULAMA — HER BIRI AYRI
// ============================================================================

describe('⚠️ 1/5 — IMZA', () => {
  /**
   * ⚠️ Atlanirsa: HERKES kendi imzaladigi token'la ISTEDIGI KISI olarak girer.
   * Bu, besinin en yikici olani ve tek "gurultulu" olani degil — imzasiz bir
   * dogrulama hicbir yerde kendini belli etmez.
   */
  it('BASKA BIR ANAHTARLA imzalanan token REDDEDILIR', async () => {
    const token = await idToken({ key: foreignKey });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  it('kurcalanmis (govdesi degistirilmis) token REDDEDILIR', async () => {
    const parts = (await idToken()).split('.');
    // ⚠️ `noUncheckedIndexedAccess` altinda dizi erisimi `string | undefined`
    // doner; testte de olsa `??` ile bagliyoruz — bos bir parca sessizce
    // "undefined" metnine donusup testi anlamsizlastirmasin.
    const header = parts[0] ?? '';
    const signature = parts[2] ?? '';
    const sahteGovde = Buffer.from(JSON.stringify({ sub: 'saldirgan' })).toString('base64url');

    await expect(
      adapter().verifyIdToken({ idToken: `${header}.${sahteGovde}.${signature}`, nonce: NONCE }),
    ).rejects.toBeInstanceOf(OAuthProviderFailedError);
  });
});

describe('⚠️ 2/5 — `iss`', () => {
  /** Atlanirsa BASKA BIR IdP'nin token'i kabul edilir. */
  it('yabanci `iss` tasiyan token REDDEDILIR', async () => {
    const token = await idToken({ issuer: 'https://saldirgan-idp.example' });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  /** Google IKI mesru `iss` degeri kullanir; ikisi de kabul EDILMELIDIR. */
  it('`accounts.google.com` (semasiz) hali KABUL EDILIR', async () => {
    const token = await idToken({ issuer: 'accounts.google.com' });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).resolves.toBeDefined();
  });
});

describe('⚠️⚠️ 3/5 — `aud` — SESSIZ SINIF', () => {
  /**
   * ⚠️ BU TESTIN ANLATTIGI SENARYO:
   * Saldirgan, KENDI sitesi icin Google'dan aldigi GECERLI bir ID token'i bize
   * sunar. Token'in imzasi TUTAR (gercekten Google imzalamistir), `iss` DOGRU,
   * `exp` GECERLI. Tek yanlis olan `aud`dur.
   *
   * ⚠️ `aud` kontrol edilmeseydi: saldirgan kendi sitesine giren HERHANGI BIR
   * kullanicinin token'ini alip BIZDE O KISI OLARAK girerdi. Hicbir sey hata
   * vermez, hicbir log kirmizi yanmaz — yalnizca YANLIS KISI iceride olur.
   */
  it('BASKA BIR SITENIN `aud`u ile gelen GECERLI Google token i REDDEDILIR', async () => {
    const token = await idToken({ audience: BASKA_SITE_CLIENT_ID });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  it('`aud` HIC YOKSA da REDDEDILIR', async () => {
    const issuedAt = Math.floor(T0.getTime() / 1000) - 60;
    const token = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setSubject(SUBJECT)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(signingKey);

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });
});

describe('⚠️ 4/5 — `exp`', () => {
  /** Atlanirsa suresi dolmus bir token SONSUZA KADAR kullanilir. */
  it('suresi DOLMUS token REDDEDILIR', async () => {
    const token = await idToken({ expiresAt: new Date(T0.getTime() - 60_000) });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  /**
   * ⚠️ "Simdi" `Clock` PORT'UNDAN okunur, `new Date()`ten DEGIL
   * (DEVELOPMENT_RULES 3.2). Bu test onu dolayli olarak kanitlar: sabit saat
   * T0'da gecerli olan bir token, saat ileri alinmis bir adapter'da REDDEDILIR.
   */
  it('adapter in SAATI ilerideyse ayni token REDDEDILIR — zaman port tan gelir', async () => {
    const token = await idToken({ expiresAt: new Date(T0.getTime() + 300_000) });

    stubJwks();
    const ileriSaatli = new GoogleOAuthAdapter({
      clientId: CLIENT_ID,
      clientSecret: 'kullanilmaz',
      clock: new FixedClock(new Date(T0.getTime() + 600_000)),
    });

    await expect(
      ileriSaatli.verifyIdToken({ idToken: token, nonce: NONCE }),
    ).rejects.toBeInstanceOf(OAuthProviderFailedError);
  });
});

describe('⚠️⚠️ 5/5 — `nonce` — SESSIZ SINIF', () => {
  /**
   * ⚠️ BU TESTIN ANLATTIGI SENARYO:
   * Saldirgan, kurbanin tarayicisindan ya da bir log'dan GECERLI bir ID token
   * ele gecirir. Imza TUTAR, `aud` BIZIM, `iss` DOGRU, `exp` HENUZ GECMEMIS.
   * Tek eksik: o token BASKA bir oturum icin uretilmisti.
   *
   * ⚠️ `nonce` kontrol edilmeseydi saldirgan onu bize sunar ve KURBAN OLARAK
   * girerdi — klasik replay. Yine hicbir sey hata vermez; token her acidan
   * "gecerli"dir.
   *
   * ⚠️ Ve `nonce`un gucu SUNUCUDA URETILMESINDEN gelir (EK-1.1): istemci
   * uretseydi saldirgan kendi `nonce`uyla kendi token'ini olusturur ve
   * dogrulama kendi kendini onaylayan bir dongu olurdu.
   */
  it('BASKA BIR OTURUMUN `nonce`u ile gelen GECERLI token REDDEDILIR', async () => {
    const token = await idToken({ nonce: 'baska-bir-oturumun-nonce-u' });

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  it('`nonce` claim i HIC YOKSA da REDDEDILIR', async () => {
    const issuedAt = Math.floor(T0.getTime() / 1000) - 60;
    const token = await new SignJWT({ email: 'kullanici@ornek.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject(SUBJECT)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(signingKey);

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });

  /**
   * ⚠️ Bos bir beklenen `nonce` ile de eslesme OLMAMALIDIR: aksi halde
   * cerezi olmayan bir istek, `nonce`suz bir token'la gecebilirdi.
   */
  it('beklenen `nonce` BOS ise gecerli token bile REDDEDILIR', async () => {
    const token = await idToken();

    await expect(adapter().verifyIdToken({ idToken: token, nonce: '' })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });
});

describe('⚠️ `sub` — kimligin capasi', () => {
  it('`sub` YOKSA REDDEDILIR — capasi olmayan bir kimlik kabul edilemez', async () => {
    const issuedAt = Math.floor(T0.getTime() / 1000) - 60;
    const token = await new SignJWT({ nonce: NONCE, email: 'kullanici@ornek.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(signingKey);

    await expect(adapter().verifyIdToken({ idToken: token, nonce: NONCE })).rejects.toBeInstanceOf(
      OAuthProviderFailedError,
    );
  });
});
