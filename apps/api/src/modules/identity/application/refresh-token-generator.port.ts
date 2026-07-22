/**
 * Opak refresh token ureten port (ADR-0021, AUTH_ARCHITECTURE 11.1).
 *
 * Uretilen deger 256 bit kriptografik rastgeledir — JWT DEGIL. Kendi kendini
 * dogrulamasi gerekmez cunku her kullanimda zaten veritabanina bakilir (iptal
 * kontrolu). ARCHITECTURE 4: kripto uretim domain'de yapilamaz, adapter'dan gelir.
 */
/** DI token'i. */
export const REFRESH_TOKEN_GENERATOR = Symbol('REFRESH_TOKEN_GENERATOR');

export interface RefreshTokenGenerator {
  /** 256 bit opak, URL-guvenli bir token uretir. Istemciye verilir, saklanmaz. */
  generate(): string;
}
