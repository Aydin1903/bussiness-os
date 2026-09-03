import { createHmac } from 'node:crypto';

import {
  type BuildAuthorizationInput,
  type ExchangeInput,
  type OAuthAuthorization,
  type OAuthIdentity,
  type OAuthProviderPort,
} from '../../shared/oauth-provider.port';
import { OAuthProviderFailedError } from '../../modules/identity/domain/identity.error';
import { generateCodeVerifier } from './pkce';

/**
 * ⚠️ Graph API SURUMU PINLENIR, "en son" KULLANILMAZ.
 *
 * Surumsuz bir `graph.facebook.com/me` cagrisi Meta'nin o anki varsayilanina
 * duser ve ⚠️ varsayilan DEGISTIGI gun davranis HABERSIZ degisir. Pinlenmis
 * surumun bedeli acikca yazilidir: Meta surumleri ~2 yil yasatir, yani bu
 * sabit periyodik olarak GUNCELLENMELIDIR.
 */
const GRAPH_VERSION = 'v25.0';

const AUTHORIZATION_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const PROFILE_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me`;

/**
 * ⚠️ VIRGULLE ayrilir — LinkedIn/Google'in BOSLUGUNDAN farkli. Meta'nin
 * dokumantasyonu her ikisini de kabul ettigini soyler; virgul, dokumante
 * ornekteki bicimdir.
 *
 * ⚠️ `email` bir IZINDIR ve kullanici onu REDDEDEBILIR — o durumda Graph
 * yaniti `email` alani TASIMAZ ve akis `OAUTH_EMAIL_UNAVAILABLE`a duser
 * (callback `?error=email_required` gosterir).
 */
const SCOPES = 'public_profile,email';

/** ⚠️ `email` ISTENIR ama GARANTI DEGILDIR (yukarida). `picture` yalnizca teshis. */
const PROFILE_FIELDS = 'id,name,email';

const REQUEST_TIMEOUT_MS = 10_000;

export interface FacebookOAuthAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * `OAuthProviderPort`'un Facebook (Meta) implementasyonu — ADR-0053'un
 * DORDUNCU ve ⚠️ **DIGER UCUNDEN YAPISAL OLARAK FARKLI** saglayicisi.
 *
 * ============================================================================
 * ⚠️ ID TOKEN YOLU YOK — VE BU BIZIM TERCIHIMIZ DEGIL, YAPISAL BIR KAPALILIK
 * ============================================================================
 * ⚠️ OLCUM (2026-09-03, `https://www.facebook.com/.well-known/openid-configuration/`):
 *
 *     "response_types_supported": ["id_token", "token id_token"]
 *
 * ⚠️ `code` LISTEDE YOKTUR. Yani Facebook'un OIDC'si YALNIZCA IMPLICIT'tir:
 * ID token ancak URL FRAGMENT'inde donebilir — ve ADR-0053 §5 tam olarak
 * bunu REDDETMISTIR (_"deger tarayici gecmisine, olasi `Referer` basliklarina
 * ve uzanti erisimine girer"_; ADR-0026'nin "token DOM'a ve disk'e degmez"
 * ilkesinin tersi).
 *
 * **Karar:** Facebook, dokumante edilmis Graph akisini kullanir —
 * `code` -> (arka kanal, `client_secret`) `access_token` -> `GET /me`.
 * ⚠️ Bu, diger uc adapter'daki `jwtVerify` katmaninin BURADA OLMAMASININ
 * sebebidir: dogrulanacak bir imza YOKTUR, cunku imzali bir belge YOKTUR.
 * Kimligin kanit zinciri sudur: `state` (CSRF) + birebir `redirect_uri` +
 * `client_secret` ile TLS uzerinden yapilan BIZIM istegimiz.
 *
 * ============================================================================
 * ⚠️ BU ADAPTER'IN HUKMU: `emailVerified` **HER ZAMAN `false`**
 * ============================================================================
 * ADR-0053 §6.1 bunu bir KARAR olarak yazmisti (PO Kalem C) ve karsi gorusu
 * de yazmisti: _"donduyse dogrulanmistir"_ yaygin bir savunmadir ⚠️ ama bir
 * IDDIADIR, bir kanit degil.
 *
 * ⚠️ BUGUN O IDDIA OLCULDU VE HUKUM ARTIK BIR TERCIH DEGIL BIR OLCUMDUR:
 * Meta'nin discovery belgesinin `claims_supported` listesinde `email` VAR,
 * ⚠️ `email_verified` **YOK**. Graph `/me` yaniti da boyle bir alan
 * DONDURMEZ. Yani "dogrulanmis mi" sorusunun cevabi eksik degil —
 * ⚠️ **SORU PROTOKOL SEVIYESINDE HIC SORULAMIYOR.**
 *
 * ⚠️ Somut sonucu ve bedeli: **HER Facebook girisi D3'e duser** — kullanici
 * ILK giriste bizim 6 haneli kodumuzu girer. Ondan sonraki her giris D1'dir
 * ve kod BIR DAHA HIC sorulmaz. Facebook, dort dugmenin EN YAVASIDIR.
 *
 * ⚠️ Bu satir (`emailVerified: false`) bir "yapilacak" DEGILDIR; degistirmek
 * ADR-0053 §6.1'i ve PO Kalem C'yi yeniden acmayi gerektirir.
 *
 * ============================================================================
 * ⚠️ PKCE GONDERILMEZ — VE BU BILINCLI (Karar B)
 * ============================================================================
 * Meta'nin `dialog/oauth` parametre tablosunda `code_challenge` /
 * `code_challenge_method` **HIC GECMEZ** (2026-09-03 olcumu).
 *
 * ⚠️ Yalnizca "dokumante degil" oldugu icin degil, RISKIN SEKLI yuzunden
 * gonderilmiyor: Meta challenge'i KAYDEDIP token isteginde verifier
 * beklerse ve o parametreyi kabul etmezse akis **%100 kirilir** — ve
 * kirilmayi gorecegimiz yer prod'daki bir kullanicinin ekranidir, cunku
 * elimizde bu yolu sinayacak bir credential YOKTUR.
 *
 * ⚠️ Port yine de bir `codeVerifier` URETIR ve cagiran onu state cerezinde
 * TASIR — sozlesme dort saglayici icin AYNI kalir. Burada YALNIZCA
 * kullanilmaz; `exchange` onu Meta'ya GONDERMEZ. Bu, arayuzu saglayici
 * basina catallamamak icin odenen kucuk ve gorunur bir bedeldir.
 *
 * ⚠️ Kaybedilen sey nedir, durustce: PKCE, calinmis bir `code`un baska bir
 * istemci tarafindan degistirilmesini engeller. Burada `code`u degistirmek
 * icin `client_secret` GEREKIR ve o secret yalnizca sunucudadir; kalan risk
 * `redirect_uri`nin birebir eslesmesiyle daraltilir.
 * ============================================================================
 */
export class FacebookOAuthAdapter implements OAuthProviderPort {
  readonly key = 'facebook' as const;

  constructor(private readonly options: FacebookOAuthAdapterOptions) {}

  buildAuthorization(input: BuildAuthorizationInput): OAuthAuthorization {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', input.state);
    // ⚠️ `nonce` DE GONDERILMEZ: ID token yolu yok, yani baglanacak bir token
    // yok. Gonderilseydi okuyan birine burada bir ID token dogrulamasi
    // oldugunu soyleyen YANILTICI bir satir olurdu.

    // ⚠️ Uretilir ama GONDERILMEZ (sinif yorumu): sozlesme dort saglayicida
    // ayni kalsin diye cagiran her zaman bir dogrulayici tasir.
    return { authorizationUrl: url.toString(), codeVerifier: generateCodeVerifier() };
  }

  async exchange(input: ExchangeInput): Promise<OAuthIdentity> {
    // ⚠️ `input.codeVerifier` ve `input.nonce` BILINCLI OLARAK KULLANILMAZ —
    // sinif yorumundaki iki gerekce.
    const accessToken = await this.#exchangeCodeForAccessToken(input);

    return this.#fetchIdentity(accessToken);
  }

  async #exchangeCodeForAccessToken(input: ExchangeInput): Promise<string> {
    // ⚠️ Meta'nin token ucu bir **GET**tir (digerlerinin POST'undan farkli) —
    // dokumante edilen bicim budur.
    const url = new URL(TOKEN_ENDPOINT);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('client_secret', this.options.clientSecret);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('code', input.code);

    const payload = await this.#getJson(url);
    const accessToken = readField(payload, 'access_token');

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new OAuthProviderFailedError();
    }

    return accessToken;
  }

  /**
   * ⚠️ `appsecret_proof` EKLENIR — ucuz ve gercek bir sertlestirme.
   *
   * Access token'in HMAC-SHA256'si, app secret'i anahtar alarak hesaplanir.
   * Calinmis bir access token, app secret'i olmayan biri tarafindan
   * KULLANILAMAZ. Meta bunu uygulamada "Require App Secret" ile ZORUNLU
   * kilabilir; gondermek her iki halde de gecerlidir, yani ⚠️ ayari acmak
   * bizim akisimizi KIRMAZ.
   */
  async #fetchIdentity(accessToken: string): Promise<OAuthIdentity> {
    const url = new URL(PROFILE_ENDPOINT);
    url.searchParams.set('fields', PROFILE_FIELDS);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', this.options.clientSecret).update(accessToken).digest('hex'),
    );

    const payload = await this.#getJson(url);
    const subject = readField(payload, 'id');

    if (typeof subject !== 'string' || subject.length === 0) {
      throw new OAuthProviderFailedError();
    }

    return {
      provider: this.key,
      subject,
      // ⚠️ Kullanici `email` iznini reddederse alan HIC GELMEZ -> `null`.
      email: readOptionalString(readField(payload, 'email')),
      // ⚠️ HER ZAMAN `false` — sinif yorumundaki olcum. Bu bir varsayilan
      // DEGIL, bir HUKUMDUR; Meta'da dogrulanmisligi soyleyen bir alan YOKTUR.
      emailVerified: false,
      displayName: readOptionalString(readField(payload, 'name')),
      // ⚠️ Avatar ISTENMEZ: ad ve avatar zaten SAKLANMIYOR (ADR-0053 "bilinen
      // sinirlar"), yani alani cekmek yalnizca gereksiz veri tasirdi.
      avatarUrl: null,
    };
  }

  /** Iki Graph cagrisinin ORTAK govdesi: zaman asimi, ag hatasi, JSON. */
  async #getJson(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Ag hatasi / zaman asimi. ⚠️ Meta'nin HAM metni yukari TASINMAZ: ic
      // detay ve — token URL'de oldugu icin — SIR icerebilir.
      throw new OAuthProviderFailedError();
    }

    if (!response.ok) {
      throw new OAuthProviderFailedError();
    }

    return response.json().catch(() => null);
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
