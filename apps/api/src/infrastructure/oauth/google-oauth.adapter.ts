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

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Google ID token'inin `iss` claim'i IKI degerden biri olabilir ve ikisi de
 * mesrudur — Google'in kendi dokumantasyonu bunu boyle yazar. Tek degere
 * kisitlamak, girisi bir gun ONCEDEN HABERSIZ kirardi.
 */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** ⚠️ Yalnizca kimlik. Takvim/kisiler/Drive kapsamlari ISTENMEZ (ADR-0053 §3.4). */
const SCOPES = 'openid email profile';

const REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleOAuthAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly clock: Clock;
}

/**
 * `OAuthProviderPort`'un Google (OpenID Connect) implementasyonu — ADR-0053'un
 * ILK saglayicisi.
 *
 * ============================================================================
 * ⚠️ BU ADAPTER BIR HUKUM VERIR: `emailVerified`
 * ============================================================================
 * ADR-0053 §6'nin tablosu Google icin sunu der: hukum, `email_verified`
 * claim'inin KENDISIDIR. Google adresi ya kendisi verir (Gmail) ya da alan adi
 * Workspace'te dogrulanmistir; sektorde en guvenilir claim budur.
 *
 * ⚠️ Bu, digerleri icin GECERLI DEGILDIR ve kopyalanmamalidir: Microsoft
 * adapter'i `xms_edov` ISTEYECEK (nOAuth), LinkedIn'inki alanin YOKLUGUNU
 * `false` sayacak, Facebook'unki HIC claim gormeyecek. Hukum saglayiciya
 * ozeldir; is mantigi bunlarin HICBIRINI bilmez.
 *
 * ============================================================================
 * ⚠️ `nonce` DOGRULANIR — ATLANMASI PKCE'YI ANLAMSIZ KILAR
 * ============================================================================
 * ID token'in `nonce` claim'i, akisi baslatan istekte uretilen ve IMZALI state
 * cerezinde tasinan degerle karsilastirilir. Dogrulanmazsa baska bir oturumdan
 * calinmis bir ID token yeniden oynatılabilir.
 * ============================================================================
 */
export class GoogleOAuthAdapter implements OAuthProviderPort {
  readonly key = 'google' as const;

  /**
   * ⚠️ JWKS ISTEMCISI ALAN DUZEYINDE TUTULUR, her cagrida yeniden
   * OLUSTURULMAZ: `createRemoteJWKSet` anahtarlari onbellege alir ve
   * onbellek NESNENIN UZERINDEDIR. Her `exchange`te yenisini kurmak, her
   * giriste Google'a fazladan bir JWKS istegi demek olurdu — hem yavas hem
   * gereksiz bir disa bagimlilik.
   */
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: GoogleOAuthAdapterOptions) {
    this.#jwks = createRemoteJWKSet(new URL(JWKS_URI));
  }

  buildAuthorization(input: BuildAuthorizationInput): OAuthAuthorization {
    const codeVerifier = generateCodeVerifier();

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', toCodeChallengeS256(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    // ⚠️ `select_account`: tarayicida birden fazla Google oturumu aciksa
    // kullanici HANGISIYLE girdigini gorur. Atlanirsa Google sessizce ilk
    // oturumu secer ve kullanici yanlis hesapla girdigini FARK ETMEZ.
    url.searchParams.set('prompt', 'select_account');
    // ⚠️ `access_type=offline` ISTENMEZ: refresh token istemiyoruz, cunku
    // saglayici token'lari saklanmiyor (ADR-0053 §3.4).

    return { authorizationUrl: url.toString(), codeVerifier };
  }

  async exchange(input: ExchangeInput): Promise<OAuthIdentity> {
    const idToken = await this.#exchangeCodeForIdToken(input);
    const claims = await this.#verifyIdToken(idToken, input.nonce);

    const subject = claims.sub;
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new OAuthProviderFailedError();
    }

    return {
      provider: this.key,
      subject,
      email: readOptionalString(claims.email),
      // ⚠️ HUKUM: Google icin claim'in kendisi (sinif yorumu).
      emailVerified: claims.email_verified === true,
      displayName: readOptionalString(claims.name),
      avatarUrl: readOptionalString(claims.picture),
    };
  }

  async #exchangeCodeForIdToken(input: ExchangeInput): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      // ⚠️ PKCE dogrulayicisi: Google onu `code_challenge` ile karsilastirir.
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
      // ⚠️ Ag hatasi / zaman asimi. Saglayicinin HAM metni yukari TASINMAZ —
      // ic detay icerebilir (ADR-0053 §12, `OAuthProviderFailedError`).
      throw new OAuthProviderFailedError();
    }

    if (!response.ok) {
      throw new OAuthProviderFailedError();
    }

    const payload: unknown = await response.json().catch(() => null);
    const idToken = readField(payload, 'id_token');

    if (typeof idToken !== 'string' || idToken.length === 0) {
      throw new OAuthProviderFailedError();
    }

    // ⚠️ `access_token` OKUNMAZ ve SAKLANMAZ (ADR-0053 §3.4). Yanitin icinde
    // gelir ve burada bilincli olarak GORMEZDEN gelinir; degiskene bile
    // atanmaz, cunku atanan bir sey bir gun loglanir.
    return idToken;
  }

  async #verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.#jwks, {
        issuer: ISSUERS,
        audience: this.options.clientId,
        // ⚠️ Zaman DISARIDAN gelir (DEVELOPMENT_RULES 3.2): testler deterministik
        // kalsin diye `Clock` port'undan okunur, `new Date()`ten degil.
        currentDate: this.options.clock.now(),
      });
      payload = result.payload;
    } catch {
      throw new OAuthProviderFailedError();
    }

    // ⚠️ `nonce` KARSILASTIRMASI — sinif yorumundaki gerekce.
    if (payload.nonce !== expectedNonce) {
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
