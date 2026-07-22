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
   */
  verify(token: string): Promise<VerifiedToken>;
}
