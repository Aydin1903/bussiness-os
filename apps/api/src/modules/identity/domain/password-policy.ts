import { PasswordPolicyError, type PasswordPolicyViolation } from './identity.error';

/**
 * Parola politikasi — SAF kurallar (ADR-0018, AUTH_ARCHITECTURE 6.1).
 *
 * ============================================================================
 * NEDEN BURADA, NEDEN BU KURALLAR
 * ============================================================================
 * NIST SP 800-63B: karmasiklik kurallari (buyuk/kucuk/sembol zorunlulugu)
 * kullaniciyi `P@ssw0rd1` gibi TAHMIN EDILEBILIR kaliplara iter. Bu yuzden ADR-0018
 * yalnizca uzunluk ve "harf + rakam" ister; sembol/buyuk-harf ZORUNLULUGU YOKTUR.
 *
 * Ham parola bu fonksiyona GECICI olarak girer ve DOGRULANIR — saklanmaz,
 * loglanmaz. Hash'leme adapter'in isidir (ARCHITECTURE 4). Ihlal durumunda
 * parolanin kendisi degil, yalnizca ihlal KODLARI tasinir (P1).
 *
 * NFKC ONCE uygulanir: uzunluk KOD NOKTASI ile sayilir (byte degil), cunku
 * hash'lenecek olan da NFKC-normalize edilmis bicimdir. Aksi halde `é` veya emoji
 * iceren bir parola byte sayimiyla haksiz yere reddedilirdi.
 * ============================================================================
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Politikaya gore ihlalleri dondurur; uyumluysa bos dizi.
 *
 * `assertPasswordPolicy` firlatmadan once cagiran taraf bunu dogrudan
 * kullanabilir (ornegin alan bazli yaniti kurmak icin).
 */
export function validatePassword(raw: string): PasswordPolicyViolation[] {
  const normalized = raw.normalize('NFKC');
  // Array.from bir string'i KOD NOKTASI'na boler (UTF-16 birimine degil) — ADR-0018
  // uzunlugu kod noktasiyla sayar (`é`/emoji byte sayimiyla haksiz yere reddedilmesin).
  const length = Array.from(normalized).length;

  const violations: PasswordPolicyViolation[] = [];

  if (length < PASSWORD_MIN_LENGTH) {
    violations.push('too-short');
  }
  // Maksimum uzunluk bir DoS onlemidir (§6.1): Argon2 girdisini bellege almak ve
  // normalize etmek maliyet uretir; giris ucu kimliksizdir.
  if (length > PASSWORD_MAX_LENGTH) {
    violations.push('too-long');
  }
  if (!/\p{L}/u.test(normalized)) {
    violations.push('missing-letter');
  }
  if (!/[0-9]/.test(normalized)) {
    violations.push('missing-digit');
  }

  return violations;
}

/** Politika ihlal edilirse `PasswordPolicyError` firlatir; aksi halde sessizce doner. */
export function assertPasswordPolicy(raw: string): void {
  const violations = validatePassword(raw);
  if (violations.length > 0) {
    throw new PasswordPolicyError(violations);
  }
}
