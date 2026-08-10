import type { ZodError } from 'zod';

/** Alan adı → gösterilecek ilk hata mesajı. */
export type FieldErrors = Readonly<Record<string, string>>;

export const NO_FIELD_ERRORS: FieldErrors = {};

/**
 * Zod hatasını alan bazlı mesajlara çevirir.
 *
 * ============================================================================
 * NEDEN İSTEMCİDE DE DOĞRULAMA VAR
 * ============================================================================
 * Sunucu zaten doğruluyor ve doğrulama orada BİTER — buradaki kontrol bir
 * güvenlik katmanı değil, bir gecikme tasarrufudur: boş bir şirket adı için
 * ağa çıkıp 400 beklemek, hatayı alanın altında anında göstermekten hem yavaş
 * hem de daha kötü bir deneyimdir.
 *
 * Şemalar `@business-os/contracts`'ten gelir, yani istemcinin kuralı sunucunun
 * kuralının KOPYASI değil, AYNISIDIR. İkisinin ayrışması ancak paket
 * güncellenmediğinde olur ve o durumda sunucu yine son sözü söyler.
 *
 * Yalnızca İLK hata alınır: aynı alanda üç kuralın üçünü birden göstermek
 * (`boş olamaz`, `çok kısa`, `geçersiz`) kullanıcıya yardım etmez.
 */
export function fieldErrors(error: ZodError): FieldErrors {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const [first] = issue.path;
    if (first === undefined) {
      continue;
    }
    const key = String(first);
    result[key] ??= issue.message;
  }

  return result;
}

/**
 * Boş metni `null`'a çevirir — "temizle" ile "dokunma" ayrımı.
 *
 * Backend opsiyonel alanları `nullish` tanımlar: `undefined` "gönderilmedi",
 * `null` "TEMİZLENSİN" demektir. Formda boşaltılan bir alan ikincisidir; boş
 * dizge göndermek, alanı boş bir metinle DOLDURMAK olurdu.
 */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
