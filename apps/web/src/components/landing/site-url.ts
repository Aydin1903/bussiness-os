/**
 * Pazarlama yüzeyinin KANONİK adresi — tek yerde.
 *
 * ⚠️ Ortamdan OKUNMAZ: pazarlama sayfasının kanonik adresi tektir ve bir
 * yapılandırma kazasıyla önizleme adresine (`*.vercel.app`) düşmemelidir.
 * Düşseydi hata SESSİZ olurdu: sitemap, JSON-LD ve paylaşım kartları arama
 * motoruna yanlış alan adını bildirir, sayfa ise sorunsuz çalışmaya devam
 * ederdi.
 *
 * ⚠️ Eskiden bu değer `(landing)/layout.tsx`in `metadataBase`inde elle
 * yazılıydı. Blog (JSON-LD), `sitemap.ts` ve `robots.ts` de aynı adrese
 * ihtiyaç duyunca dört kopya yerine tek sabite taşındı: biri değişip öteki
 * unutulursa sitemap bir alan adını, kanonik bağlantı başka birini söylerdi.
 */
export const SITE_URL = 'https://app.kobiwise.com';
