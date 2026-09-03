import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { type Clock } from '../../shared/clock.port';
import {
  type BuildAuthorizationInput,
  type ExchangeInput,
  type OAuthAuthorization,
  type OAuthIdentity,
  type OAuthProviderPort,
} from '../../shared/oauth-provider.port';
import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { generateCodeVerifier, toCodeChallengeS256 } from './pkce';

const AUTHORIZATION_ENDPOINT = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/v2/accessToken';
const JWKS_URI = 'https://www.linkedin.com/oauth/openid/jwks';

/**
 * ⚠️ TEK deger — Google'in aksine LinkedIn tek bir `iss` yayinlar ve bunu
 * kendi discovery belgesinde yazar (`https://www.linkedin.com`; ⚠️ sondaki
 * egik cizgi YOK, `www` VAR).
 */
const ISSUER = 'https://www.linkedin.com';

/** ⚠️ BOSLUKLA ayrilir (Facebook'un virgulunden farkli). */
const SCOPES = 'openid profile email';

const REQUEST_TIMEOUT_MS = 10_000;

export interface LinkedInOAuthAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly clock: Clock;
}

/**
 * `OAuthProviderPort`'un LinkedIn (Sign In with LinkedIn using OpenID Connect)
 * implementasyonu — ADR-0053'un UCUNCU saglayicisi.
 *
 * ============================================================================
 * ⚠️ BU ADAPTER'IN HUKMU: `email_verified === true`, YOKLUGU ONAY DEGILDIR
 * ============================================================================
 * ADR-0053 §6: claim `true` ise `true`; ⚠️ **yoksa `false`**.
 *
 * Ve bu bir temkin degil, LinkedIn'in KENDI YAZDIGI seydir — dokumantasyonun
 * birebir cumlesi: _"The 'email' and 'email_verified' fields are optional and
 * may not be included in all responses. Ensure your application can handle
 * cases where these fields are absent."_
 *
 * ⚠️ Yani buradaki `false`, Microsoft'un `xms_edov`u ile AYNI SINIFTA bir
 * karardir: eksik bir claim, kullanici hakkinda bir ONAY DEGILDIR. `!== false`
 * yazmak (yani "yoksa dogru say") tam olarak nOAuth'un mantik hatasidir.
 *
 * ============================================================================
 * ⚠️ `nonce`: GONDERILIR, VARSA DOGRULANIR, YOKLUGUNDA AKIS SURER (Karar A)
 * ============================================================================
 * ⚠️ ONCE OLCUM: LinkedIn'in ID Token payload tablosu YALNIZCA
 * `iss · sub · aud · iat · exp` sayar ve authorization endpoint'inin
 * parametre tablosunda **`nonce` HIC GECMEZ** (learn.microsoft.com, LinkedIn
 * OIDC + 3-legged OAuth dokumanlari, 2026-09-03 olcumu).
 *
 * `nonce`u ZORUNLU kilmak, dokumante edilmemis bir alani sart kosmak olurdu:
 * ⚠️ LinkedIn onu geri vermezse HER LinkedIn girisi kirilirdi.
 *
 * ⚠️ VE BU BIR GUVENLIK GEVSEMESI DEGILDIR — gerekce KANALDADIR:
 * `nonce`, ID TOKEN ENJEKSIYONUNA karsidir; yani token'in ON KANALDAN
 * (tarayicidan) gelebildigi akislarda anlamlidir. Burada ID token on kanaldan
 * HIC GELMEZ: `client_secret` ile BIZIM yaptigimiz arka kanal istegine
 * cevaben, TLS uzerinden, BIZIM `code`umuza karsilik doner. Enjekte edilecek
 * bir yuzey yoktur.
 *
 * ⚠️ `xms_edov` ile CELISMEZ ve ayrim tam olarak sudur:
 *   `xms_edov` yoklugu -> KULLANICI HAKKINDA bir iddianin eksikligi.
 *   `nonce`   yoklugu -> ZATEN BAGLI bir kanalin ikinci bir baginin eksikligi.
 * Birincisi kimligi zayiflatir, ikincisi zayiflatmaz.
 *
 * Yine de `nonce` GONDERILIR: LinkedIn onu bir gun yansitmaya baslarsa
 * baglama BEDAVA kazanilir ve asagidaki kontrol kendiliginden devreye girer.
 *
 * ============================================================================
 * ⚠️ PKCE GONDERILIR — Facebook'tan farkli olarak
 * ============================================================================
 * LinkedIn PKCE'yi native akis dokumaninda tanimlar ve token ucunun HATA
 * TABLOSU acikca _"code verifier does not match authorization code"_ der —
 * yani sunucu tarafinda ISLENIYOR. Facebook'ta boyle bir kanit YOKTUR ve
 * orada challenge GONDERILMEZ (bkz. `facebook-oauth.adapter.ts`).
 * ============================================================================
 */
export class LinkedInOAuthAdapter implements OAuthProviderPort {
  readonly key = 'linkedin' as const;

  /** Alan duzeyinde: JWKS onbellegi nesnenin uzerindedir (Google ile ayni gerekce). */
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: LinkedInOAuthAdapterOptions) {
    this.#jwks = createRemoteJWKSet(new URL(JWKS_URI));
  }

  buildAuthorization(input: BuildAuthorizationInput): OAuthAuthorization {
    const codeVerifier = generateCodeVerifier();

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', input.state);
    // ⚠️ Dokumante EDILMEMIS ama ZARARSIZ ve ileriye donuk (sinif yorumu).
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', toCodeChallengeS256(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');

    return { authorizationUrl: url.toString(), codeVerifier };
  }

  async exchange(input: ExchangeInput): Promise<OAuthIdentity> {
    const idToken = await this.#exchangeCodeForIdToken(input);

    return this.#toIdentity(await this.#verifyIdToken(idToken, input.nonce));
  }

  #toIdentity(claims: JWTPayload): OAuthIdentity {
    const subject = claims.sub;
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new OAuthProviderFailedError();
    }

    return {
      provider: this.key,
      subject,
      email: readOptionalString(claims.email),
      // ⚠️ HUKUM: claim `true` DEGILSE (yok · `false` · "true" dizesi · null)
      // sonuc `false`. `=== true` karsilastirmasi bu dort halin dordunu de
      // ayni yere goturur.
      emailVerified: Reflect.get(claims, 'email_verified') === true,
      displayName: readOptionalString(claims.name),
      avatarUrl: readOptionalString(claims.picture),
    };
  }

  async #exchangeCodeForIdToken(input: ExchangeInput): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: input.redirectUri,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OAuthProviderFailedError();
    }

    if (!response.ok) {
      throw new OAuthProviderFailedError();
    }

    const payload: unknown = await response.json().catch(() => null);
    const idToken = readField(payload, 'id_token');

    if (typeof idToken !== 'string' || idToken.length === 0) {
      // ⚠️ `openid` scope'u onaylanmamis bir uygulamada LinkedIn `id_token`
      // DONDURMEZ (yalnizca `access_token`). Bu bir yapilandirma hatasidir ve
      // 502 ile bildirilir — sessizce `userinfo`ya DUSULMEZ: o yol imzasiz bir
      // kaynaktan kimlik okumak olurdu.
      throw new OAuthProviderFailedError();
    }

    // ⚠️ `access_token` / `refresh_token` OKUNMAZ ve SAKLANMAZ (§3.4) —
    // LinkedIn ikisini de doner ve ikisi de bilincli olarak GORMEZDEN gelinir.
    return idToken;
  }

  async #verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.#jwks, {
        issuer: ISSUER,
        audience: this.options.clientId,
        currentDate: this.options.clock.now(),
      });
      payload = result.payload;
    } catch {
      throw new OAuthProviderFailedError();
    }

    // ⚠️ "VARSA DOGRULA" — sinif yorumundaki gerekce. `undefined` GECER,
    // ⚠️ ama YANLIS bir deger GECMEZ: LinkedIn `nonce`u bir gun yansitmaya
    // baslar da deger eslesmezse bu, kanitlanmis bir replay'dir ve reddedilir.
    const nonce = Reflect.get(payload, 'nonce');
    if (nonce !== undefined && nonce !== expectedNonce) {
      throw new OAuthProviderFailedError();
    }

    return payload;
  }
}

function readField(payload: unknown, field: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  return Reflect.get(payload, field);
}

/** Bos dize `null`a duser: "alan yok" ile "alan bos" ayni sonuca varmali. */
function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
