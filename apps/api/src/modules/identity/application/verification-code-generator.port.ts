/**
 * 6 haneli dogrulama kodu ureten port (AUTH_ARCHITECTURE 7.1, ADR-0019).
 *
 * ARCHITECTURE 4: uretim `Math.random()`/kripto gerektirir ve domain'de
 * yapilamaz (DEVELOPMENT_RULES 3.2). Bu yuzden kod DISARIDAN, bir adapter'dan
 * gelir — tipki id gibi.
 *
 * Donen deger `string`'tir, `number` degil: bastaki sifirlar anlamlidir
 * (`000042` gecerli bir koddur) ve sayiya cevirmek onlari yok ederdi.
 */
/** DI token'i. */
export const VERIFICATION_CODE_GENERATOR = Symbol('VERIFICATION_CODE_GENERATOR');

export interface VerificationCodeGenerator {
  /**
   * Kriptografik olarak guvenli, duzgun dagilimli 6 haneli bir kod uretir
   * (`000000`-`999999`). `Math.random()` KULLANILMAZ — ongorulebilir bir uretec
   * kodu tahmin edilebilir kilar ve tum mekanizmayi anlamsizlastirir.
   */
  generate(): string;
}
