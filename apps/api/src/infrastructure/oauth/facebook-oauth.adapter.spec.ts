import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { FacebookOAuthAdapter } from './facebook-oauth.adapter';

/**
 * ============================================================================
 * ⚠️ BU ADAPTER DIGER UCUNDEN YAPISAL OLARAK FARKLIDIR — TESTI DE OYLE
 * ============================================================================
 * Burada `jwtVerify` YOKTUR, cunku dogrulanacak bir ID token YOKTUR: Meta'nin
 * OIDC discovery'si `response_types_supported: ["id_token","token id_token"]`
 * der — ⚠️ `code` LISTEDE YOKTUR, yani ID token ancak URL FRAGMENT'inde
 * donebilir ve ADR-0053 §5 bunu acikca REDDETMISTIR.
 *
 * ⚠️ Bu testlerin en onemlisi tek bir cumleyi kilitler:
 * **`emailVerified` HER ZAMAN `false`.** Bu bir varsayilan DEGIL bir HUKUMDUR
 * (ADR-0053 §6.1, PO Kalem C) ve Meta'nin `email` alani ne kadar inandirici
 * gelirse gelsin degismez — cunku Meta'da "dogrulanmis mi" sorusunu soracak
 * bir alan PROTOKOL SEVIYESINDE YOKTUR.
 * ============================================================================
 */

const CLIENT_ID = 'bizim-facebook-app-id';
const CLIENT_SECRET = 'fb-client-secret';
const REDIRECT_URI = 'https://api.kobiwise.com/api/v1/auth/oauth/facebook/callback';
const ACCESS_TOKEN = 'EAAG-ornek-access-token';

function adapter(): FacebookOAuthAdapter {
  return new FacebookOAuthAdapter({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
}

interface Recorded {
  readonly urls: string[];
}

/**
 * Iki Graph ucunu taklit eder ve ⚠️ CAGRILAN URL'LERI KAYDEDER — bir sirrin
 * ya da bir parametrenin gercekten gidip gitmedigi ancak boyle olculur.
 */
function stubGraph(profile: unknown, options: { readonly tokenBody?: unknown } = {}): Recorded {
  const urls: string[] = [];

  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(input);
    urls.push(url);

    if (url.includes('/oauth/access_token')) {
      return Promise.resolve(
        new Response(JSON.stringify(options.tokenBody ?? { access_token: ACCESS_TOKEN }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.includes('graph.facebook.com/') && url.includes('/me')) {
      return Promise.resolve(
        new Response(JSON.stringify(profile), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    throw new Error(`beklenmeyen ag cagrisi: ${url}`);
  });

  return { urls };
}

async function exchange() {
  return adapter().exchange({
    code: 'gecerli-kod',
    codeVerifier: 'kullanilmayan-pkce-dogrulayici',
    nonce: 'kullanilmayan-nonce',
    redirectUri: REDIRECT_URI,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FacebookOAuthAdapter — ⚠️ HUKUM: `emailVerified` HER ZAMAN `false`', () => {
  it('gecerli bir profil doner ve hukum `false`dur', async () => {
    stubGraph({ id: 'fb-1234567890', name: 'Ornek Kullanici', email: 'kullanici@ornek.com' });

    await expect(exchange()).resolves.toEqual({
      provider: 'facebook',
      subject: 'fb-1234567890',
      email: 'kullanici@ornek.com',
      // ⚠️ E-POSTA DOLU, HUKUM YINE DE `false` — her Facebook girisi D3'e duser.
      emailVerified: false,
      displayName: 'Ornek Kullanici',
      // ⚠️ Avatar ISTENMEZ: ad ve avatar zaten SAKLANMIYOR.
      avatarUrl: null,
    });
  });

  /**
   * ⚠️ EN KRITIK TEST. Meta bir gun `email_verified` benzeri bir alan
   * dondurmeye baslasa bile hukum DEGISMEZ: onu okumak, ADR-0053 §6.1'i ve
   * PO Kalem C'yi yeniden acmadan yapilamaz. Bu test, birinin "alan geliyor,
   * kullanalim" diye sessizce baglamasini engeller.
   */
  it('⚠️ Graph `email_verified: true` DONSE BILE hukum `false` KALIR', async () => {
    stubGraph({
      id: 'fb-1',
      name: 'X',
      email: 'x@ornek.com',
      email_verified: true,
      verified: true,
    });

    await expect(exchange()).resolves.toMatchObject({ emailVerified: false });
  });

  it('kullanici `email` iznini reddettiyse `email` `null` olur', async () => {
    stubGraph({ id: 'fb-2', name: 'X' });

    await expect(exchange()).resolves.toMatchObject({ email: null, emailVerified: false });
  });

  it('`id` yoksa saglayici arizasi sayilir (502)', async () => {
    stubGraph({ name: 'X', email: 'x@ornek.com' });

    await expect(exchange()).rejects.toThrow(OAuthProviderFailedError);
  });

  it('token yanitinda `access_token` yoksa saglayici arizasi sayilir', async () => {
    stubGraph({ id: 'fb-3' }, { tokenBody: { error: { message: 'bad code' } } });

    await expect(exchange()).rejects.toThrow(OAuthProviderFailedError);
  });
});

describe('FacebookOAuthAdapter — Graph akisi ve sertlestirme', () => {
  it('⚠️ `appsecret_proof` GONDERILIR — calinmis token secret`siz kullanilamaz', async () => {
    const recorded = stubGraph({ id: 'fb-1', name: 'X', email: 'x@ornek.com' });
    await exchange();

    const profileUrl = new URL(recorded.urls.filter((url) => url.includes('/me')).join(''));
    const expected = createHmac('sha256', CLIENT_SECRET).update(ACCESS_TOKEN).digest('hex');

    expect(profileUrl.searchParams.get('appsecret_proof')).toBe(expected);
  });

  it('token degisimi `client_secret` ve birebir `redirect_uri` ile yapilir', async () => {
    const recorded = stubGraph({ id: 'fb-1', name: 'X', email: 'x@ornek.com' });
    await exchange();

    const tokenUrl = new URL(
      recorded.urls.filter((url) => url.includes('/oauth/access_token')).join(''),
    );

    expect(tokenUrl.searchParams.get('client_secret')).toBe(CLIENT_SECRET);
    expect(tokenUrl.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(tokenUrl.searchParams.get('code')).toBe('gecerli-kod');
  });

  /**
   * ⚠️ ADR-0053 §3.4: saglayici token'lari SAKLANMAZ. Burada olculebilir
   * karsiligi sudur — donen kimlik nesnesinde access token'a dair HICBIR
   * alan YOKTUR. `toEqual` (tam esitlik) bunu kilitler: nesne sessizce
   * buyurse test KIRMIZI yanar.
   */
  it('⚠️ donen kimlik saglayici token`i TASIMAZ (tam alan kumesi kilitli)', async () => {
    stubGraph({ id: 'fb-1', name: 'X', email: 'x@ornek.com' });
    const identity = await exchange();

    expect(Object.keys(identity).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'email',
      'emailVerified',
      'provider',
      'subject',
    ]);
  });
});

/**
 * ⚠️ KARAR B — PKCE GONDERILMEZ. Bu bir unutkanlik degil, olculmus bir
 * karardir: Meta'nin `dialog/oauth` parametre tablosunda `code_challenge`
 * HIC GECMEZ ve elimizde bu yolu sinayacak bir credential YOKTUR. Meta
 * challenge'i kaydedip verifier'i kabul etmezse akis %100 kirilir ve
 * kirilmayi gorecegimiz yer prod'daki bir kullanicinin ekranidir.
 */
describe('FacebookOAuthAdapter — ⚠️ yetkilendirme URL`i: PKCE ve `nonce` YOK (Karar B)', () => {
  it('⚠️ `code_challenge` GONDERILMEZ', () => {
    const url = new URL(
      adapter().buildAuthorization({ state: 's', nonce: 'n', redirectUri: REDIRECT_URI })
        .authorizationUrl,
    );

    expect(url.searchParams.get('code_challenge')).toBeNull();
    expect(url.searchParams.get('code_challenge_method')).toBeNull();
  });

  /**
   * ⚠️ `nonce` de GONDERILMEZ ve gerekce farklidir: baglanacak bir ID token
   * yoktur. Gonderilseydi okuyan birine burada bir ID token dogrulamasi
   * oldugunu soyleyen YANILTICI bir satir olurdu.
   */
  it('⚠️ `nonce` GONDERILMEZ — baglanacak bir ID token YOK', () => {
    const url = new URL(
      adapter().buildAuthorization({ state: 's', nonce: 'n', redirectUri: REDIRECT_URI })
        .authorizationUrl,
    );

    expect(url.searchParams.get('nonce')).toBeNull();
  });

  it('`state`, `scope` ve `redirect_uri` gonderilir', () => {
    const url = new URL(
      adapter().buildAuthorization({ state: 'state-degeri', nonce: 'n', redirectUri: REDIRECT_URI })
        .authorizationUrl,
    );

    expect(url.searchParams.get('state')).toBe('state-degeri');
    expect(url.searchParams.get('scope')).toBe('public_profile,email');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  /**
   * ⚠️ Sozlesme dort saglayicida AYNI kalir: `codeVerifier` yine URETILIR ve
   * cagiran onu state cerezinde tasir — yalnizca Meta'ya gonderilmez. Port'u
   * saglayici basina catallamamak icin odenen kucuk ve gorunur bedel.
   */
  it('sozlesme geregi `codeVerifier` yine de URETILIR (kullanilmasa da)', () => {
    const result = adapter().buildAuthorization({
      state: 's',
      nonce: 'n',
      redirectUri: REDIRECT_URI,
    });

    expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});
