import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { type Clock } from '../../shared/clock.port';
import { LinkedInOAuthAdapter } from './linkedin-oauth.adapter';

/**
 * ============================================================================
 * ⚠️ IKI KURALI KILITLER — VE IKISI BIRBIRININ TERSI GORUNUR
 * ============================================================================
 * 1. `email_verified` OPSIYONELDIR ve ⚠️ **YOKLUGU ONAY DEGILDIR** -> `false`.
 *    (LinkedIn'in kendi cumlesi: _"The 'email' and 'email_verified' fields are
 *    optional and may not be included in all responses."_)
 * 2. `nonce` OPSIYONELDIR ve ⚠️ **YOKLUGU AKISI KIRMAZ** -> gecer.
 *
 * ⚠️ ILK BAKISTA CELISKI GORUNUR; ayrim KANITIN NEYE DAIR OLDUGUDUR:
 *
 *   `email_verified` yoklugu -> KULLANICI HAKKINDA bir iddianin eksikligi.
 *                               Kabul etmek kimligi ZAYIFLATIR (nOAuth sinifi).
 *   `nonce`          yoklugu -> ZATEN BAGLI bir kanalin ikinci baginin
 *                               eksikligi. ID token on kanaldan HIC gelmez;
 *                               `client_secret` ile BIZIM arka kanal
 *                               istegimize cevaben doner. Enjekte edilecek
 *                               yuzey YOKTUR.
 *
 * ⚠️ Bu iki testin YAN YANA durmasi bilinclidir: biri gevserse digeri
 * "tutarlilik" adina gevsetilmesin.
 * ============================================================================
 */

const CLIENT_ID = 'bizim-linkedin-client-id';
const BASKA_SITE_CLIENT_ID = 'baska-sitenin-client-id';
const NONCE = 'sunucunun-urettigi-nonce-degeri';
const SUBJECT = 'li-sub-782bbtaQ';
const T0 = new Date('2026-09-03T12:00:00.000Z');

class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return new Date(this.value.getTime());
  }
}

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let jwks: unknown;

beforeAll(async () => {
  const main = await generateKeyPair('RS256', { extractable: true });
  const foreign = await generateKeyPair('RS256', { extractable: true });

  signingKey = main.privateKey;
  foreignKey = foreign.privateKey;
  jwks = { keys: [{ ...(await exportJWK(main.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

interface TokenOverrides {
  readonly issuer?: string;
  readonly audience?: string;
  readonly nonce?: string | undefined;
  readonly expiresAt?: Date;
  readonly key?: CryptoKey;
  readonly emailVerified?: unknown;
  readonly email?: string | undefined;
}

/**
 * Varsayilan olarak LinkedIn'in GERCEKTE gonderdigi sekli uretir:
 * ⚠️ `nonce` YOK ve `email_verified` YOK — cunku ikisi de opsiyoneldir.
 */
async function idToken(overrides: TokenOverrides = {}): Promise<string> {
  const claims: Record<string, unknown> = { name: 'Ornek Kullanici', picture: 'https://x/y.png' };

  if (overrides.nonce !== undefined) {
    claims.nonce = overrides.nonce;
  }
  if (!('email' in overrides) || overrides.email !== undefined) {
    claims.email = overrides.email ?? 'kullanici@ornek.com';
  }
  if ('emailVerified' in overrides) {
    claims.email_verified = overrides.emailVerified;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(overrides.issuer ?? 'https://www.linkedin.com')
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject(SUBJECT)
    .setIssuedAt(Math.floor(T0.getTime() / 1000) - 60)
    .setExpirationTime(
      Math.floor((overrides.expiresAt ?? new Date(T0.getTime() + 600_000)).getTime() / 1000),
    )
    .sign(overrides.key ?? signingKey);
}

/** ⚠️ Yalnizca iki uc taklit edilir; baska bir cagri testi PATLATIR. */
function stubNetwork(body: unknown): void {
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(input);

    if (url.includes('linkedin.com/oauth/openid/jwks')) {
      return Promise.resolve(
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.includes('linkedin.com/oauth/v2/accessToken')) {
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    throw new Error(`beklenmeyen ag cagrisi: ${url}`);
  });
}

function adapter(): LinkedInOAuthAdapter {
  return new LinkedInOAuthAdapter({
    clientId: CLIENT_ID,
    clientSecret: 'li-client-secret',
    clock: new FixedClock(T0),
  });
}

async function exchange(token: string) {
  stubNetwork({ id_token: token, access_token: 'saklanmaz', refresh_token: 'saklanmaz' });
  return adapter().exchange({
    code: 'gecerli-kod',
    codeVerifier: 'pkce-dogrulayici',
    nonce: NONCE,
    redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/linkedin/callback',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkedInOAuthAdapter — ⚠️ HUKUM: `email_verified` yoklugu ONAY DEGILDIR', () => {
  it('⚠️ claim HIC YOKSA (LinkedIn`in TIPIK yaniti) hukum `false`', async () => {
    const identity = await exchange(await idToken());

    expect(identity.email).toBe('kullanici@ornek.com');
    // ⚠️ E-posta DOLU ama hukum `false` — akis D3'e duser ve kullanici KENDI
    // 6 haneli kodumuzla dogrulanir.
    expect(identity.emailVerified).toBe(false);
  });

  it('`email_verified: true` -> `true`', async () => {
    await expect(exchange(await idToken({ emailVerified: true }))).resolves.toMatchObject({
      provider: 'linkedin',
      subject: SUBJECT,
      emailVerified: true,
    });
  });

  it('`email_verified: false` -> `false`', async () => {
    await expect(exchange(await idToken({ emailVerified: false }))).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it('⚠️ `email_verified: "true"` (DIZE) -> `false` — truthy kontrol olsaydi gecerdi', async () => {
    await expect(exchange(await idToken({ emailVerified: 'true' }))).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it('`email` claim`i yoksa `email` `null` olur (LinkedIn`de opsiyonel)', async () => {
    await expect(
      exchange(await idToken({ email: undefined, emailVerified: true })),
    ).resolves.toMatchObject({ email: null });
  });
});

/**
 * ⚠️ KARAR A — `nonce` GONDERILIR, VARSA DOGRULANIR, YOKSA AKIS SURER.
 * Sinif yorumundaki gerekce; burada uc halin ucu de kilitlenir.
 */
describe('LinkedInOAuthAdapter — ⚠️ `nonce`: varsa dogrula, yoksa gec (Karar A)', () => {
  it('⚠️ `nonce` claim`i HIC YOKSA akis SURER — LinkedIn onu dokumante etmiyor', async () => {
    await expect(exchange(await idToken())).resolves.toMatchObject({ subject: SUBJECT });
  });

  it('`nonce` VARSA ve ESLESIYORSA kabul edilir', async () => {
    await expect(exchange(await idToken({ nonce: NONCE }))).resolves.toMatchObject({
      subject: SUBJECT,
    });
  });

  /**
   * ⚠️ EN ONEMLI SATIR: gevseklik yalnizca YOKLUGA tanimlidir. LinkedIn bir
   * gun `nonce`u yansitmaya baslar da deger ESLESMEZSE bu, kanitlanmis bir
   * replay'dir ve REDDEDILIR. "Varsa dogrula" = "hic dogrulama" DEGILDIR.
   */
  it('⚠️ `nonce` VAR ama ESLESMIYORSA REDDEDILIR (kanitlanmis replay)', async () => {
    await expect(exchange(await idToken({ nonce: 'baska-bir-nonce' }))).rejects.toThrow(
      OAuthProviderFailedError,
    );
  });
});

describe('LinkedInOAuthAdapter — imza · `iss` · `aud` · `exp`', () => {
  it('⚠️ BASKA BIR ANAHTARLA imzalanmis token REDDEDILIR', async () => {
    await expect(exchange(await idToken({ key: foreignKey }))).rejects.toThrow(
      OAuthProviderFailedError,
    );
  });

  it('⚠️ `aud` BASKA BIR SITENIN ise REDDEDILIR', async () => {
    await expect(exchange(await idToken({ audience: BASKA_SITE_CLIENT_ID }))).rejects.toThrow(
      OAuthProviderFailedError,
    );
  });

  /**
   * ⚠️ LinkedIn'in `iss`i `https://www.linkedin.com`tur — `www` VAR, sondaki
   * egik cizgi YOK. Yakin ama yanlis bir deger REDDEDILMELIDIR.
   */
  it('⚠️ `iss` YAKIN AMA YANLIS ise REDDEDILIR (`www` yok)', async () => {
    await expect(exchange(await idToken({ issuer: 'https://linkedin.com' }))).rejects.toThrow(
      OAuthProviderFailedError,
    );
  });

  it('suresi dolmus token REDDEDILIR', async () => {
    await expect(
      exchange(await idToken({ expiresAt: new Date(T0.getTime() - 1000) })),
    ).rejects.toThrow(OAuthProviderFailedError);
  });

  /**
   * ⚠️ `openid` urunu onaylanmamis bir uygulamada LinkedIn `id_token`
   * DONDURMEZ. Bu bir yapilandirma hatasidir ve 502 ile bildirilir —
   * sessizce `userinfo`ya DUSULMEZ: o yol imzasiz bir kaynaktan kimlik
   * okumak olurdu.
   */
  it('⚠️ yanitta `id_token` YOKSA REDDEDILIR — `userinfo`ya sessizce DUSULMEZ', async () => {
    stubNetwork({ access_token: 'yalnizca-access-token' });

    await expect(
      adapter().exchange({
        code: 'gecerli-kod',
        codeVerifier: 'pkce',
        nonce: NONCE,
        redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/linkedin/callback',
      }),
    ).rejects.toThrow(OAuthProviderFailedError);
  });
});

describe('LinkedInOAuthAdapter — yetkilendirme URL`i', () => {
  it('⚠️ PKCE `S256` GONDERILIR — LinkedIn onu sunucu tarafinda isliyor', () => {
    const result = adapter().buildAuthorization({
      state: 'state-degeri',
      nonce: NONCE,
      redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/linkedin/callback',
    });

    const url = new URL(result.authorizationUrl);

    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBeNull();
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('state')).toBe('state-degeri');
  });

  /**
   * ⚠️ `nonce` DOKUMANTE EDILMEMISKEN DE GONDERILIR: LinkedIn onu bir gun
   * yansitmaya baslarsa baglama BEDAVA kazanilir ve yukaridaki "varsa
   * dogrula" kontrolu kendiliginden devreye girer.
   */
  it('⚠️ `nonce` dokumante edilmemis olsa da GONDERILIR (ileriye donuk)', () => {
    const result = adapter().buildAuthorization({
      state: 's',
      nonce: NONCE,
      redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/linkedin/callback',
    });

    expect(new URL(result.authorizationUrl).searchParams.get('nonce')).toBe(NONCE);
  });
});
