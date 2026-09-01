/**
 * Sosyal giris saglayicisi — saglayici-bagimsiz port (ADR-0053 §3).
 *
 * ============================================================================
 * ⚠️ NEDEN BIR PORT — MUTLAK KURAL 7'NIN KIMLIK TARAFI
 * ============================================================================
 * CLAUDE.md'nin 7. kurali _"is mantigi hicbir LLM saglayicisina bagimli
 * olamaz"_ der. Ayni kural burada gecerlidir ve gerekcesi DAHA GUCLUDUR: bir
 * LLM saglayicisi degistiginde cevabin KALITESI degisir, bir kimlik saglayicisi
 * degistiginde KIM OLDUGUNUZ degisir.
 *
 * Test (ADR-0007'nin kimlik karsiligi): yeni bir saglayici eklemek YALNIZCA
 * yeni bir adapter yazmayi gerektirmeli. `LinkOrCreateFederatedUserUseCase`de
 * tek satir degismemeli.
 *
 * ============================================================================
 * NEDEN `shared/` — TEK MODUL TUKETMESINE RAGMEN
 * ============================================================================
 * `StoragePort`un yazili gerekcesiyle AYNI: yerlesim TUKETICI SAYISIYLA degil,
 * PORTUN NE OLDUGU ile belirlenir — saglayicisi degistirilebilir bir DIS
 * YETENEK `shared/` + `infrastructure/` ikilisine aittir. `EmailPort` de tek
 * tuketicilidir (Identity) ve `shared/`dedir.
 *
 * ============================================================================
 * ⚠️ SAGLAYICI TOKEN'LARI BU ARAYUZDEN HIC CIKMAZ (§3.4)
 * ============================================================================
 * `exchange` bir `OAuthIdentity` doner — access/refresh token DEGIL. Adapter
 * saglayicinin token'ini islem icinde kullanir ve ATAR: ne veritabanina, ne
 * log'a, ne cereze yazilir.
 *
 * Kazanc: calinacak bir saglayici token'i YOKTUR; `offline_access` /
 * `refresh_token` scope'lari hic istenmez.
 *
 * ⚠️ Bedel acikca yazilir: kullanici adina saglayici API'lerine (takvim,
 * kisiler, LinkedIn profili) HICBIR ZAMAN cagri yapamayiz. Bunu isteyen bir
 * ozellik cikarsa AYRI BIR ADR gerekir — token saklamak, ADR-0053'un tehdit
 * modelini bastan yazar.
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const OAUTH_PROVIDER_REGISTRY = Symbol('OAUTH_PROVIDER_REGISTRY');

/**
 * Desteklenen saglayicilar.
 *
 * ⚠️ `apple` LISTEDE YOKTUR ve bu bilinclidir (ADR-0053 §15): Developer Program
 * uyeligi tamamlanmadi. Eklendigi gun degisecek dort sey yazilidir ve
 * **hicbiri is mantigi degildir**: bu birlik, bir adapter dosyasi, `0040`in
 * CHECK kisiti, ve yapilandirma.
 */
export const OAUTH_PROVIDER_KEYS = ['google', 'microsoft', 'linkedin', 'facebook'] as const;

export type OAuthProviderKey = (typeof OAUTH_PROVIDER_KEYS)[number];

export function isOAuthProviderKey(value: unknown): value is OAuthProviderKey {
  // ⚠️ `includes` DEGIL `some`: `readonly ['google', ...]` uzerinde `includes`
  // yalnizca `OAuthProviderKey` kabul eder, `unknown` etmez — ve onu asmanin
  // yolu bir tip onayidir (`as readonly string[]`), ki proje tip onaylarini
  // YASAKLAR (`consistent-type-assertions`). `some` ayni isi TIP GUVENLI yapar.
  return typeof value === 'string' && OAUTH_PROVIDER_KEYS.some((key) => key === value);
}

/** Saglayiciya gonderilecek yetkilendirme istegi (PKCE dahil). */
export interface OAuthAuthorization {
  /** Kullanicinin yonlendirilecegi tam URL. */
  readonly authorizationUrl: string;
  /**
   * PKCE (RFC 7636) S256 dogrulayicisi.
   *
   * ⚠️ Cagiran bunu IMZALI, `HttpOnly` state cerezinde tasir — istemciye
   * govdede DONMEZ. PKCE'nin tum degeri, dogrulayicinin yalnizca istegi
   * baslatan tarayicida bulunmasindadir.
   */
  readonly codeVerifier: string;
}

/**
 * Saglayicidan donen kimlik.
 *
 * ============================================================================
 * ⚠️ `emailVerified` BIR CLAIM DEGIL, ADAPTER'IN VERDIGI BIR HUKUMDUR
 * ============================================================================
 * Her adapter kendi saglayicisinin kanitini KENDI kuralina gore degerlendirir
 * (ADR-0053 §6) ve is mantigi o kurallari HIC BILMEZ:
 *
 *   Google    -> `email_verified` claim'inin kendisi
 *   Microsoft -> ⚠️ YALNIZCA `xms_edov === true`. `email` claim'i TEK BASINA
 *                ASLA yeterli degildir (nOAuth).
 *   LinkedIn  -> `email_verified` claim'i; ⚠️ alan OPSIYONELDIR, yoklugu
 *                onay DEGILDIR -> `false`
 *   Facebook  -> ⚠️ hicbir claim yok -> `false` (ADR-0053 §6.1, PO Kalem C)
 *
 * Bu ayrimin somut sonucu: `false` bir RET DEGILDIR — akis D3'e duser ve
 * kullanici KENDI 6 haneli kodumuzla dogrulanir (§1.3).
 * ============================================================================
 */
export interface OAuthIdentity {
  readonly provider: OAuthProviderKey;

  /**
   * ⚠️ Saglayicinin DEGISMEZ `sub` degeri — kimligin TEK capasi.
   *
   * Bu alan e-postayla DEGISTIRILEMEZ. Bir kullanici saglayicidaki adresini
   * degistirse bile bu deger sabit kalir; baglantinin ayakta kalmasini saglayan
   * sey budur (ADR-0053 §1.3, D1).
   */
  readonly subject: string;

  /** Saglayici e-posta vermemis olabilir (LinkedIn'de `email` opsiyoneldir). */
  readonly email: string | null;

  /** ⚠️ Hukum, claim degil — yukaridaki bloga bakiniz. */
  readonly emailVerified: boolean;

  /**
   * ⚠️ SAKLANMAZ. Yalnizca teshis/log icin tasinir.
   *
   * `platform.users`in ADI YOKTUR ve bu bilincli bir daralmadir
   * (`identity.public.ts` yalnizca `emailVerified` acar). Adi saklamak, kimlik
   * tablosunu bir PROFIL tablosuna cevirmenin ilk adimi olurdu — ADR-0043'un
   * _"calisan ≠ uyelik"_ karari adin IK'nin isi oldugunu zaten soylemisti.
   */
  readonly displayName: string | null;

  /** ⚠️ SAKLANMAZ — `displayName` ile ayni gerekce. */
  readonly avatarUrl: string | null;
}

export interface BuildAuthorizationInput {
  /** CSRF baglayicisi. Cagiran uretir ve state cerezinde tasir. */
  readonly state: string;
  /** ID token replay korumasi. Adapter onu ID token'da DOGRULAMAK ZORUNDADIR. */
  readonly nonce: string;
  /** Saglayiciya kayitli callback adresi; birebir eslesmelidir. */
  readonly redirectUri: string;
}

export interface ExchangeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly redirectUri: string;
}

export interface OAuthProviderPort {
  readonly key: OAuthProviderKey;

  /** Yetkilendirme URL'ini ve PKCE dogrulayicisini uretir. Ag cagrisi YAPMAZ. */
  buildAuthorization(input: BuildAuthorizationInput): OAuthAuthorization;

  /**
   * Kodu kimlige cevirir: token exchange + ID token dogrulamasi
   * (imza · `iss` · `aud` · `exp` · **`nonce`**) + gerekiyorsa userinfo cagrisi.
   *
   * ⚠️ `nonce` dogrulamasini ATLAYAN bir adapter PKCE'yi ANLAMSIZ kilar; bu,
   * arayuzun degil adapter'in sorumluluğudur ve her adapter'in testi onu
   * kilitler.
   *
   * Basarisizlikta `OAuthProviderFailedError` firlatir — `null` DONMEZ: bu
   * "bulunamadi" degil, SAGLAYICI TARAFINDA BIR ARIZADIR ve 502 ile bildirilir
   * (ADR-0053 §12). Kullanicinin istegi DOGRUYDU.
   */
  exchange(input: ExchangeInput): Promise<OAuthIdentity>;
}

/**
 * Yapilandirilmis saglayicilarin kaydi.
 *
 * ⚠️ YAPILANDIRILMAMIS SAGLAYICI = OLMAYAN SAGLAYICI (ADR-0053 §3.3).
 * `CLIENT_ID`/`CLIENT_SECRET`i olmayan bir saglayici burada YOKTUR; ucu 404
 * doner ve arayuz dugmesini HIC cizmez.
 *
 * Bu, ADR-0052 §6.3'un ikinci kisitina verilen dogrudan cevaptir: _"uc
 * saglayici ayni anda hazir olmayabilir; tasarim ikisi acik biri kapaliyken de
 * ayakta durmalidir."_ Dugme sayisi 1–4 arasinda herhangi bir sey olabilir.
 */
export interface OAuthProviderRegistry {
  /** Yapilandirilmamis ya da bilinmeyen anahtar icin `null`. */
  find(key: string): OAuthProviderPort | null;

  /**
   * Arayuzun hangi dugmeleri cizecegini belirler.
   *
   * ⚠️ Arayuz saglayici listesini SABIT KODLAMAZ; aksi halde yapilandirilmamis
   * bir saglayicinin dugmesi ekranda durur ve tiklaninca 404 verir — ADR-0052
   * §6.1'in reddettigi seyin ta kendisi.
   */
  configuredKeys(): readonly OAuthProviderKey[];
}
