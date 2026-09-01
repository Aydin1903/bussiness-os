/**
 * JWT imzalama ve dogrulama port'u (ADR-0020, AUTH_ARCHITECTURE 10).
 *
 * ============================================================================
 * IKI ASAMALI TOKEN
 * ============================================================================
 * - KIMLIK token'i (identity): giris sonrasi, `tenant` claim'i YOK, 5 dk. Tek
 *   isi "hangi tenant'lara uyeyim" ve tenant secimi.
 * - TENANT-scoped ACCESS token: tenant secildikten sonra, `tenant` claim'i VAR,
 *   15 dk. Tenant verisine erisim.
 *
 * Model, "token tenant SECMEZ" ile "token tenant TASIR"i uzlastirir: secimi
 * yapan token degil, membership dogrulamasidir (MT §7.4); token yalnizca
 * dogrulanmis sonucu tasir.
 *
 * Sinir tipleri ILKELDIR (string) — VO degil. Imzalama bir altyapi islemidir ve
 * domain kimlik tipleri (UserId, TenantId) modul icinde kalir.
 *
 * Token'a rol/izin/e-posta/emailVerified KONMAZ (§10.3): token bir IDDIA tasir,
 * YETKI degil (P3). Bunlar her istekte kaynaktan dogrulanir.
 * ============================================================================
 */
/** DI token'i. */
export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

export type TokenType = 'identity' | 'access';

/**
 * ============================================================================
 * ⚠️ UCUNCU TOKEN TURU: OAuth STATE (ADR-0053 §4.2, PO Kalem B3)
 * ============================================================================
 * OAuth akisinin `state` / `nonce` / PKCE `code_verifier` uclusu imzali bir
 * `HttpOnly` cerezde tasinir ve o imza BU PORT'TAN gelir.
 *
 * ⚠️ BU BIR OTURUM TOKEN'I DEGILDIR ve `TokenType`a EKLENMEZ. Ayrim tipte
 * baslar: `signOAuthState`/`verifyOAuthState` AYRI metotlardir ve `verify()`
 * bir state token'ini GORDUGUNDE REDDEDER. Iki yon de testle kilitlidir
 * (`eddsa-token-signer.oauth-state.spec.ts`).
 *
 * Neden mevcut anahtar kullanildi (ADR-0053 §4.2): alternatifi ayri bir
 * imzalayiciydi ve o, IKINCI BIR ANAHTAR YASAM DONGUSU demekti — rotasyon,
 * dagitim, ikinci sizma yuzeyi. Bedel durustce yazildi: guvenlik kritik bir
 * port'a ucuncu bir token turu giriyor ve korumanin tamami `typ` claim'inin
 * her iki yonde de zorlanmasina dayaniyor.
 * ============================================================================
 */
export const OAUTH_STATE_TOKEN_TYPE = 'oauth-state';

export interface OAuthStateTokenInput {
  /** Hangi saglayici icin baslatildi — callback yolu ile eslesmelidir. */
  readonly provider: string;
  /** CSRF baglayicisi; sorgudaki `state` ile karsilastirilir. */
  readonly state: string;
  /** ID token replay korumasi; adapter onu ID token'da dogrular. */
  readonly nonce: string;
  /** PKCE S256 dogrulayicisi. ⚠️ Istemciye govdede ASLA donmez. */
  readonly codeVerifier: string;
  /** Girisin ardindan gidilecek SITE ICI yol. Acik yonlendirme kontrolu cagiranin. */
  readonly next: string | null;
}

/** Dogrulanmis state token'inin icerigi. */
export type VerifiedOAuthState = OAuthStateTokenInput;

/**
 * D3'un (ADR-0053 §1.3) iki adimi arasinda tasinan BEKLEYEN BAGLAMA.
 *
 * ⚠️ Neden tabloya yazilmaz: yazilsaydi dogrulama tamamlanmadan
 * `UNIQUE (provider, provider_subject)` uzerinde bir YER ISGALI olusur ve
 * temizlenmemis satirlar birikirdi. Imzali cerez kendiliginden oluir ve
 * sunucuda hicbir iz birakmaz.
 */
export interface OAuthPendingLinkTokenInput {
  readonly provider: string;
  /** Saglayicinin `sub` degeri — baglama bu adimda tamamlanir. */
  readonly subject: string;
  /** Kodun gonderildigi adres. */
  readonly email: string;
}

export type VerifiedOAuthPendingLink = OAuthPendingLinkTokenInput;

export interface IdentityTokenInput {
  readonly userId: string;
  /** Token ailesi (oturum) kimligi — `sid` claim'i. */
  readonly sessionId: string;
}

export interface AccessTokenInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly tenantId: string;
}

/** Dogrulanmis bir token'dan cikan iddia. */
export interface VerifiedToken {
  readonly type: TokenType;
  readonly userId: string;
  readonly sessionId: string;
  /** Yalnizca access token'da dolu; identity token'da `null`. */
  readonly tenantId: string | null;
  readonly jti: string;
}

export interface TokenSigner {
  /** Kimlik token'i imzalar (tenant claim'i YOK, 5 dk). */
  signIdentityToken(input: IdentityTokenInput): Promise<string>;

  /** Tenant-scoped access token imzalar (tenant claim'i VAR, 15 dk). */
  signAccessToken(input: AccessTokenInput): Promise<string>;

  /**
   * Imza, sure, `iss`/`aud` ve `kid`'i dogrular; iddiayi cikarir.
   *
   * FAIL CLOSED: herhangi bir dogrulama basarisizsa `InvalidTokenError` firlatir
   * (cagiran taraf 401'e cevirir). Sessiz/gecerli-gibi sonuc DONMEZ.
   *
   * ⚠️ BIR OAuth STATE TOKEN'INI DE REDDEDER (`typ` bilinmeyen tur). Bu, ADR-0053
   * §4.2'nin zorunlu ayriminin YARISIDIR; digeri `verifyOAuthState`tir.
   */
  verify(token: string): Promise<VerifiedToken>;

  /**
   * OAuth state token'i imzalar (10 dk).
   *
   * ⚠️ Bir OTURUM ACMAZ: `sub` claim'i YOKTUR, `sid` YOKTUR. Bu token bir
   * kimlik iddiasi tasimaz, yalnizca akisin baslangicini baglar.
   */
  signOAuthState(input: OAuthStateTokenInput): Promise<string>;

  /**
   * OAuth state token'ini dogrular.
   *
   * ⚠️ Bir KIMLIK ya da ERISIM token'i verilirse `InvalidTokenError` firlatir —
   * ayrimin ikinci yarisi. Boyle olmasaydi, calinmis bir kimlik token'i state
   * cerezine konarak PKCE dogrulayicisinin yerine gecebilirdi.
   */
  verifyOAuthState(token: string): Promise<VerifiedOAuthState>;

  /** D3'un bekleyen baglamasini imzalar (15 dk). Oturum ACMAZ. */
  signOAuthPendingLink(input: OAuthPendingLinkTokenInput): Promise<string>;

  /** ⚠️ Kimlik/erisim/state token'larinin hicbirini kabul ETMEZ. */
  verifyOAuthPendingLink(token: string): Promise<VerifiedOAuthPendingLink>;
}
