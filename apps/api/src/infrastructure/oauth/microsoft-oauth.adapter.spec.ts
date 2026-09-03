import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { type Clock } from '../../shared/clock.port';
import { MicrosoftOAuthAdapter } from './microsoft-oauth.adapter';

/**
 * ============================================================================
 * ⚠️ BU DOSYANIN TEK BIR ISI VAR: nOAuth'un KAPALI KALDIGINI KANITLAMAK
 * ============================================================================
 * ADR-0053 §6'nin Microsoft satiri sudur: hukum YALNIZCA `xms_edov === true`.
 * ⚠️ Bu kuralin bozulmasi SESSIZDIR — token gecerli gorunur, imza tutar,
 * kullanici GIRER; yalnizca **YANLIS KISI** girer. Ne derleme, ne lint, ne de
 * baska bir test bunu yakalar. Bu yuzden hukum kendi testlerini hak eder.
 *
 * ⚠️ Ikinci is: `iss` DOGRULAMASI (Karar C). `common` uclarinda `iss` tenant
 * basina degisir, yani `jose`'a sabit bir `issuer` VERILEMEZ ve dogrulama
 * ELLE yapilir. Elle yapilan bir kontrol, unutuldugunda hicbir iz birakmaz —
 * uc kosulun ucu de ayri ayri sinanir.
 *
 * ⚠️ Testler GERCEK imza dogrulamasi yapar: yerel anahtar cifti uretilir ve
 * hem JWKS hem token ucu `fetch` seviyesinde taklit edilir. `jwtVerify`
 * OLDUGU GIBI kosar — dogrulama mantigi sahtelenmez.
 * ============================================================================
 */

const CLIENT_ID = 'bizim-microsoft-client-id';
const BASKA_SITE_CLIENT_ID = 'baska-sitenin-client-id';
const NONCE = 'sunucunun-urettigi-nonce-degeri';
const SUBJECT = 'ms-sub-abc123';
const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const BASKA_TENANT_ID = '99999999-8888-7777-6666-555555555555';
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
  readonly tenantId?: unknown;
  readonly emailDomainOwnerVerified?: unknown;
  readonly email?: string | undefined;
}

/** Varsayilan olarak GECERLI bir Microsoft ID token uretir. */
async function idToken(overrides: TokenOverrides = {}): Promise<string> {
  const tenantId = 'tenantId' in overrides ? overrides.tenantId : TENANT_ID;

  const claims: Record<string, unknown> = {
    tid: tenantId,
    name: 'Ornek Kullanici',
  };

  if (!('nonce' in overrides) || overrides.nonce !== undefined) {
    claims.nonce = overrides.nonce ?? NONCE;
  }
  if (!('email' in overrides) || overrides.email !== undefined) {
    claims.email = overrides.email ?? 'kullanici@ornek.com';
  }
  if ('emailDomainOwnerVerified' in overrides) {
    claims.xms_edov = overrides.emailDomainOwnerVerified;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(
      overrides.issuer ??
        `https://login.microsoftonline.com/${typeof tenantId === 'string' ? tenantId : 'x'}/v2.0`,
    )
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject(SUBJECT)
    .setIssuedAt(Math.floor(T0.getTime() / 1000) - 60)
    .setExpirationTime(
      Math.floor((overrides.expiresAt ?? new Date(T0.getTime() + 600_000)).getTime() / 1000),
    )
    .sign(overrides.key ?? signingKey);
}

/**
 * JWKS ucunu ve token ucunu taklit eder; ⚠️ baska hicbir ag cagrisina IZIN
 * VERMEZ — bir adapter sessizce baska bir uca gitmeye baslarsa test PATLAR.
 */
function stubNetwork(token: string): void {
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(typeof input === 'object' && input !== null ? input : input);

    if (url.includes('/discovery/v2.0/keys')) {
      return Promise.resolve(
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.includes('/oauth2/v2.0/token')) {
      return Promise.resolve(
        new Response(JSON.stringify({ id_token: token, access_token: 'saklanmaz' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    throw new Error(`beklenmeyen ag cagrisi: ${url}`);
  });
}

function adapter(tenant = 'common'): MicrosoftOAuthAdapter {
  return new MicrosoftOAuthAdapter({
    clientId: CLIENT_ID,
    clientSecret: 'ms-client-secret',
    tenant,
    clock: new FixedClock(T0),
  });
}

/** Tam `exchange` yolu: token ucu -> imza -> `iss` -> `nonce` -> kimlik. */
async function exchange(token: string, tenant = 'common') {
  stubNetwork(token);
  return adapter(tenant).exchange({
    code: 'gecerli-kod',
    codeVerifier: 'pkce-dogrulayici',
    nonce: NONCE,
    redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/microsoft/callback',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MicrosoftOAuthAdapter — taban: gecerli token kabul edilir', () => {
  it('`xms_edov: true` ile kimlik doner ve hukum `true`dur', async () => {
    await expect(
      exchange(await idToken({ emailDomainOwnerVerified: true })),
    ).resolves.toMatchObject({
      provider: 'microsoft',
      subject: SUBJECT,
      email: 'kullanici@ornek.com',
      emailVerified: true,
    });
  });
});

/**
 * ⚠️ nOAuth'UN TAM KARSILIGI. Bu blogun her satiri, saldirganin KENDI Entra
 * tenant'inda `mail` alanina kurbanin adresini yazdigi senaryoyu temsil eder:
 * `email` claim'i DOLUDUR ve INANDIRICIDIR — tek eksigi `xms_edov`dur.
 */
describe('MicrosoftOAuthAdapter — ⚠️ HUKUM: yalnizca `xms_edov === true`', () => {
  it('⚠️ `xms_edov` HIC YOKSA hukum `false` (nOAuth: `email` tek basina yeterli DEGIL)', async () => {
    const identity = await exchange(await idToken());

    // ⚠️ E-posta OKUNUR — ama hukum onu bir KANIT yapmaz. Akis D3'e duser.
    expect(identity.email).toBe('kullanici@ornek.com');
    expect(identity.emailVerified).toBe(false);
  });

  it('⚠️ `xms_edov: false` -> `false`', async () => {
    await expect(
      exchange(await idToken({ emailDomainOwnerVerified: false })),
    ).resolves.toMatchObject({ emailVerified: false });
  });

  /**
   * ⚠️ `"true"` DIZESI EN SINSI HALDIR: bir yapilandirma ya da eslestirme
   * katmani boolean'i dizeye cevirebilir ve `!== false` / truthy bir kontrol
   * onu KABUL EDERDI. `=== true` etmez.
   */
  it('⚠️ `xms_edov: "true"` (DIZE) -> `false` — truthy kontrol olsaydi gecerdi', async () => {
    await expect(
      exchange(await idToken({ emailDomainOwnerVerified: 'true' })),
    ).resolves.toMatchObject({ emailVerified: false });
  });

  it('⚠️ `xms_edov: 1` -> `false`', async () => {
    await expect(exchange(await idToken({ emailDomainOwnerVerified: 1 }))).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it('e-posta claim`i hic yoksa `email` `null` olur (akis `email_required`a duser)', async () => {
    await expect(
      exchange(await idToken({ email: undefined, emailDomainOwnerVerified: true })),
    ).resolves.toMatchObject({ email: null });
  });
});

/**
 * ⚠️ KARAR C — `iss` ELLE DOGRULANIR. Uc kosulun ucu de ayri bir seyi
 * engeller ve ucu de ayri ayri sinanir.
 */
describe('MicrosoftOAuthAdapter — ⚠️ `iss` dogrulamasi (dinamik issuer)', () => {
  it('⚠️ `iss` BASKA bir tenant`in id`sinden kurulmussa REDDEDILIR', async () => {
    const token = await idToken({
      emailDomainOwnerVerified: true,
      issuer: `https://login.microsoftonline.com/${BASKA_TENANT_ID}/v2.0`,
    });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ `tid` UUID DEGILSE REDDEDILIR — keyfi bir dizeyle `iss` uydurulamaz', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true, tenantId: 'evil-tenant' });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ `tid` HIC YOKSA REDDEDILIR', async () => {
    const token = await idToken({
      emailDomainOwnerVerified: true,
      tenantId: undefined,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ TAMAMEN BASKA bir issuer REDDEDILIR', async () => {
    const token = await idToken({
      emailDomainOwnerVerified: true,
      issuer: 'https://evil.example/v2.0',
    });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  /**
   * ⚠️ SABIT TENANT'A KILITLENMIS KURULUM: tek bir sirkete acilmis bir
   * yapilandirmaya YABANCI bir dizin giremez. `common`da bu kontrol
   * calismaz — ikisi de sinanir.
   */
  it('⚠️ sabit tenant yapilandirildiysa YABANCI dizin REDDEDILIR', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true, tenantId: BASKA_TENANT_ID });

    await expect(exchange(token, TENANT_ID)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('sabit tenant yapilandirildiysa AYNI dizin kabul edilir', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true });

    await expect(exchange(token, TENANT_ID)).resolves.toMatchObject({ subject: SUBJECT });
  });

  it('`common` disinda `organizations` da cok-tenant sayilir', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true });

    await expect(exchange(token, 'organizations')).resolves.toMatchObject({ subject: SUBJECT });
  });
});

/**
 * ⚠️ ADR-0053 EK-1.2'nin bes kontrolu Google icin yazilmisti; Microsoft da
 * ayni katiliktadir — `nonce` burada OPSIYONEL DEGILDIR (LinkedIn'den fark).
 */
describe('MicrosoftOAuthAdapter — imza · `aud` · `exp` · `nonce`', () => {
  it('⚠️ BASKA BIR ANAHTARLA imzalanmis token REDDEDILIR', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true, key: foreignKey });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ `aud` BASKA BIR SITENIN ise REDDEDILIR', async () => {
    const token = await idToken({
      emailDomainOwnerVerified: true,
      audience: BASKA_SITE_CLIENT_ID,
    });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('suresi dolmus token REDDEDILIR', async () => {
    const token = await idToken({
      emailDomainOwnerVerified: true,
      expiresAt: new Date(T0.getTime() - 1000),
    });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ `nonce` ESLESMIYORSA REDDEDILIR (replay)', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true, nonce: 'baska-bir-nonce' });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });

  it('⚠️ `nonce` HIC YOKSA da REDDEDILIR — Microsoft onu dokumante eder', async () => {
    const token = await idToken({ emailDomainOwnerVerified: true, nonce: undefined });

    await expect(exchange(token)).rejects.toThrow(OAuthProviderFailedError);
  });
});

describe('MicrosoftOAuthAdapter — yetkilendirme URL`i', () => {
  it('PKCE `S256`, `nonce`, `state` ve `select_account` tasir', () => {
    const result = adapter().buildAuthorization({
      state: 'state-degeri',
      nonce: NONCE,
      redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/microsoft/callback',
    });

    const url = new URL(result.authorizationUrl);

    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBeNull();
    expect(url.searchParams.get('nonce')).toBe(NONCE);
    expect(url.searchParams.get('state')).toBe('state-degeri');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  /**
   * ⚠️ `offline_access` ISTENMEZ (ADR-0053 §3.4): saglayici token'lari
   * saklanmadigi icin refresh token'a ihtiyac YOKTUR. Istenseydi, hicbir
   * yerde kullanilmayan ama CALINABILIR bir yetki toplanmis olurdu.
   */
  it('⚠️ `offline_access` ISTENMEZ — saklanmayan bir token icin yetki toplanmaz', () => {
    const result = adapter().buildAuthorization({
      state: 's',
      nonce: NONCE,
      redirectUri: 'https://api.kobiwise.com/api/v1/auth/oauth/microsoft/callback',
    });

    expect(new URL(result.authorizationUrl).searchParams.get('scope')).toBe('openid email profile');
  });
});
