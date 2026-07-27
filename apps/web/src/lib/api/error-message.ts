import { ApiError } from './problem';

/**
 * Bir hatayı kullanıcıya gösterilecek TEK cümleye çevirir.
 *
 * - `ApiError` ise backend'in RFC 7807 `detail`/`title`'ı gösterilir (backend
 *   zaten güvenlik-uniform metinler döndürür — hangi red sebebi sızmaz).
 * - Ağ/başka hata ise genel bir mesaj + verilen `fallback`.
 *
 * `status` verilirse ve backend gövdesi yoksa duruma özel bir metin seçilebilir
 * (çağıran `statusOverrides` ile geçer).
 */
export function errorMessage(
  error: unknown,
  fallback = 'Bir şeyler ters gitti. Lütfen tekrar deneyin.',
  statusOverrides: Record<number, string> = {},
): string {
  if (error instanceof ApiError) {
    const override = statusOverrides[error.status];
    if (override !== undefined) {
      return override;
    }
    return error.problem?.detail ?? error.problem?.title ?? fallback;
  }

  // `fetch` ağ hatası (TypeError) veya beklenmeyen bir şey.
  return 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.';
}
