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

/**
 * ⚠️ Yalnizca kimlik. `offline_access` ISTENMEZ (ADR-0053 §3.4: saglayici
 * token'lari saklanmaz, dolayisiyla refresh token'a ihtiyac YOKTUR).
 */
const SCOPES = 'openid email profile';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Microsoft `iss` claim'i HER ZAMAN bu kaliptadir ve `{tid}` TOKEN'IN KENDI
 * `tid` claim'inden gelir (asagidaki `#assertIssuer`).
 */
const ISSUER_PREFIX = 'https://login.microsoftonline.com/';
const ISSUER_SUFFIX = '/v2.0';

/** `tid` bir dizin (tenant) kimligidir; bicimi UUID'dir. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * ⚠️ `tenant` degeri bir GUID DEGILSE bunlardan biri olabilir; bu durumda
 * `tid` esitligi ARANMAZ (cok-tenant'li kurulum).
 */
const MULTI_TENANT_ALIASES = ['common', 'organizations', 'consumers'];

export interface MicrosoftOAuthAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  /** `common` · `organizations` · `consumers` ya da bir dizin GUID'i. */
  readonly tenant: string;
  readonly clock: Clock;
}

/**
 * `OAuthProviderPort`'un Microsoft (Entra ID / identity platform v2.0)
 * implementasyonu — ADR-0053'un IKINCI saglayicisi.
 *
 * ============================================================================
 * ⚠️ BU ADAPTER'IN HUKMU: `xms_edov === true` — VE BASKA HICBIR SEY
 * ============================================================================
 * ADR-0053 §6'nin tablosu Microsoft icin sunu der: hukum YALNIZCA
 * `xms_edov` claim'inin `true` olmasidir. `email` claim'i TEK BASINA ASLA
 * yeterli degildir ve claim YOKSA hukum **`false`**tur.
 *
 * ⚠️ Gerekce **nOAuth** (Descope, 2023) ve bir varsayim degil, ADI OLAN bir
 * zafiyettir: saldirgan KENDI Entra tenant'ini acar, bir kullanicinin `mail`
 * alanina KURBANIN adresini yazar (⚠️ Entra bu alanin sahipligini
 * DOGRULAMAZ) ve "Microsoft ile giris"e basar. E-postayi kimlik anahtari
 * sayan uygulamada sonuc TAM HESAP DEVRIDIR.
 *
 * ⚠️ Bizde bedeli "bir hesap" degildir: kurban hesabina giren saldirgan
 * `POST /auth/switch-tenant` ile tenant'a gecer ve on iki modulun tamami —
 * IK maaslari dahil — onun elindedir.
 *
 * ⚠️ `xms_edov` bir OPSIYONEL CLAIM'dir ve app registration'da ACILMADIKCA
 * GELMEZ (Token configuration -> Add optional claim -> Token type: ID).
 * Acilmadiginda hukum `false` olur ve HER Microsoft kullanicisi D3'e duser —
 * yani akis calisir, yalnizca bir adim uzar. ⚠️ Bu SESSIZ BIR BOZULMA
 * DEGILDIR ama fark edilmezse _"Microsoft neden hep kod soruyor"_ diye
 * YANLIS YERDE aranir; kurulum adimlari bu yuzden AUTH_ARCHITECTURE.md'de
 * kalici bir bolumdedir (ADR-0053 §6.2).
 *
 * ============================================================================
 * ⚠️ `iss` SABIT DEGILDIR — ELLE DOGRULANIR (ADR-0053 uygulamasi, Karar C)
 * ============================================================================
 * Google'in `iss`i iki sabit degerden biridir ve `jose`'a dogrudan
 * verilebilir. Microsoft'ta `common` uclari kullanildiginda `iss` HER
 * TENANT ICIN FARKLIDIR:
 *
 *     https://login.microsoftonline.com/{tid}/v2.0
 *
 * Yani `jwtVerify`'a sabit bir `issuer` verilemez. ⚠️ Bosversek ne olurdu:
 * BASKA BIR ISSUER'IN — bizim JWKS'imizle dogrulanabilen — token'i gecerli
 * sayilirdi. Bu yuzden `issuer` secenegi ATLANIR ve yerine `#assertIssuer`
 * uc kosulu birden arar: `tid` UUID'dir · `iss` TAM OLARAK o `tid`den
 * kurulmustur · sabit bir tenant yapilandirildiysa `tid` ona ESITTIR.
 *
 * ⚠️ Uctaki `tid === iss` baglamasi kritik: olmasaydi bir tenant'in token'i
 * baska bir tenant'in `iss`i ile sunulabilirdi.
 *
 * ============================================================================
 * ⚠️ `nonce` DOGRULANIR — Google ile AYNI KATILIKTA
 * ============================================================================
 * Microsoft `nonce`u dokumante eder ve ID token'da geri verir; bu yuzden
 * burada LinkedIn'in "varsa dogrula" gevsemesi GECERLI DEGILDIR. Eksik ya da
 * eslesmeyen bir `nonce` REDDEDILIR.
 * ============================================================================
 */
export class MicrosoftOAuthAdapter implements OAuthProviderPort {
  readonly key = 'microsoft' as const;

  /**
   * ⚠️ ALAN DUZEYINDE TUTULUR (Google adapter'inin ayni gerekcesi):
   * `createRemoteJWKSet` anahtarlari NESNENIN UZERINDE onbellege alir. Her
   * `exchange`te yenisini kurmak, her giriste Microsoft'a fazladan bir JWKS
   * istegi demek olurdu.
   */
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: MicrosoftOAuthAdapterOptions) {
    this.#jwks = createRemoteJWKSet(new URL(`${this.#tenantBase()}/discovery/v2.0/keys`));
  }

  buildAuthorization(input: BuildAuthorizationInput): OAuthAuthorization {
    const codeVerifier = generateCodeVerifier();

    const url = new URL(`${this.#tenantBase()}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', toCodeChallengeS256(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    // ⚠️ `select_account`: tarayicida birden fazla is/okul hesabi aciksa
    // kullanici HANGISIYLE girdigini gorur. Google adapter'iyla ayni gerekce.
    url.searchParams.set('prompt', 'select_account');

    return { authorizationUrl: url.toString(), codeVerifier };
  }

  async exchange(input: ExchangeInput): Promise<OAuthIdentity> {
    const idToken = await this.#exchangeCodeForIdToken(input);

    return this.#toIdentity(await this.#verifyIdToken(idToken, input.nonce));
  }

  /** `common`/`organizations`/`consumers` ya da GUID — hepsi ayni kalibi kullanir. */
  #tenantBase(): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(this.options.tenant)}`;
  }

  #toIdentity(claims: JWTPayload): OAuthIdentity {
    const subject = claims.sub;
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new OAuthProviderFailedError();
    }

    return {
      provider: this.key,
      subject,
      // ⚠️ `email` claim'i OKUNUR ama TEK BASINA hicbir sey KANITLAMAZ; onu
      // bir kanit haline getiren tek sey asagidaki `xms_edov` hukmudur.
      email: readOptionalString(claims.email),
      // ⚠️ HUKUM (sinif yorumu): claim YOKSA `false`. `!== false` gibi bir
      // gevseklik nOAuth'un kapisini yeniden acardi.
      emailVerified: Reflect.get(claims, 'xms_edov') === true,
      displayName: readOptionalString(claims.name),
      // ⚠️ Microsoft ID token'i avatar URL'i TASIMAZ (fotograf Graph'tan
      // ayri bir cagriyla gelir) ve o cagri YAPILMAZ: ad ve avatar zaten
      // SAKLANMIYOR (ADR-0053 "bilinen sinirlar"), yani bir ag turu
      // hicbir sey kazandirmazdi.
      avatarUrl: null,
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
      // ⚠️ `scope` token isteginde de tekrarlanir: Microsoft v2.0 uclarinda
      // istenen izinler her istekte acikca bildirilir.
      scope: SCOPES,
    });

    let response: Response;
    try {
      response = await fetch(`${this.#tenantBase()}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Ag hatasi / zaman asimi. Saglayicinin HAM metni yukari TASINMAZ.
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

    // ⚠️ `access_token` OKUNMAZ ve SAKLANMAZ (ADR-0053 §3.4). Degiskene bile
    // atanmaz, cunku atanan bir sey bir gun loglanir.
    return idToken;
  }

  async #verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.#jwks, {
        // ⚠️ `issuer` BILEREK VERILMEZ — sinif yorumundaki gerekce. Yerine
        // `#assertIssuer` calisir ve ATLANMASI MUMKUN DEGILDIR: dogrulanmis
        // payload buradan gecmeden donmuyor.
        audience: this.options.clientId,
        // Zaman DISARIDAN gelir (DEVELOPMENT_RULES 3.2).
        currentDate: this.options.clock.now(),
      });
      payload = result.payload;
    } catch {
      throw new OAuthProviderFailedError();
    }

    this.#assertIssuer(payload);

    if (payload.nonce !== expectedNonce) {
      throw new OAuthProviderFailedError();
    }

    return payload;
  }

  /**
   * ⚠️ UC KOSUL BIRDEN — ve ucu de ayri bir seyi engeller:
   *
   *   1. `tid` UUID -> keyfi bir dizeyle `iss` uydurulamaz.
   *   2. `iss === prefix + tid + suffix` -> bir tenant'in token'i BASKA bir
   *      tenant'in `iss`i ile sunulamaz.
   *   3. Sabit tenant yapilandirildiysa `tid === tenant` -> tek bir sirkete
   *      kilitlenmis bir kurulumda YABANCI bir dizin giremez.
   */
  #assertIssuer(claims: JWTPayload): void {
    const tenantId = Reflect.get(claims, 'tid');

    if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
      throw new OAuthProviderFailedError();
    }

    if (claims.iss !== `${ISSUER_PREFIX}${tenantId}${ISSUER_SUFFIX}`) {
      throw new OAuthProviderFailedError();
    }

    const configured = this.options.tenant.toLowerCase();
    if (!MULTI_TENANT_ALIASES.includes(configured) && configured !== tenantId.toLowerCase()) {
      throw new OAuthProviderFailedError();
    }
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
