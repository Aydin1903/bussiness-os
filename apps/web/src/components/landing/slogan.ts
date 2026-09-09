/**
 * MARKANIN SLOGANI — tek kaynak (Product Owner, 2026-09-09).
 *
 * ============================================================================
 * ⚠️ NEDEN BİR DOSYA — VE NEDEN İKİ PARÇA HÂLİNDE
 * ============================================================================
 * Slogan iki yerde birden görünür: hero'da büyük (markanın vaadi) ve üst
 * çubukta logonun altında küçük (markanın imzası). ⚠️ İki yere ayrı ayrı
 * yazılsaydı **sessizce ayrışırlardı** — biri güncellenir, öteki eski kalır ve
 * hiçbir test kırmızı yanmaz. Bu projede aynı hata ölçülerek yaşandı: yazılı
 * logonun auth'ta metin, landing'de görsel olan iki uygulaması ADR-0054'te
 * "bugün kabul edilen, ölçülmüş bir borç" olarak kayda geçti. Aynı borcu
 * slogan için açmıyoruz.
 *
 * ⚠️ İKİ YARIM AYRI AYRI DIŞA AÇILIR çünkü iki yüzey **farklı miktarını**
 * kullanır ve bu bir tercih değil, ÖLÇÜLMÜŞ bir kısıttır (aşağıda).
 */

/**
 * ⚠️ Birinci yarım TEK BAŞINA da bir descriptor'dır — üst çubuk yalnızca bunu
 * taşır.
 *
 * ⚠️ SEBEP ÖLÇÜLDÜ, tahmin edilmedi: tam slogan (49 karakter) mono 10px ve
 * `0.14em` harf aralığıyla ~370 px yer kaplar. Üst çubukta logo sütunu bugün
 * ~157 px; gezinme ve iki eylem düğmesi 1280 px'te ~970 px kullanıyor.
 * 370 + 970 = **1340 px > 1280 px** — yani tam slogan üst çubukta TAŞARDI.
 * Birinci yarım (25 karakter) ~185 px'tir ve sütunu yalnızca ~28 px büyütür.
 *
 * ⚠️ Bu, "kısaltmak daha güzel duruyor" değil, **sığmıyor** demektir; biri
 * ileride tam sloganı oraya koymak isterse önce bu hesabı çürütmelidir.
 */
export const SLOGAN_BAS = 'Hiç unutmayan bir asistan';

/** İkinci yarım — hero'nun ikinci satırı. */
export const SLOGAN_SON = 'Siz büyürken o hatırlar';

/**
 * TAM slogan, `/` ayracıyla — markanın imza biçimi.
 *
 * ⚠️ Ayraç bir süs değil: auth panelinin dört sloganı da (`auth-panels.ts`)
 * aynı ` / ` yapısını kullanır ve bir test onu kilitler. Aynı biçim burada da
 * korunur ki marka tek bir sesle konuşsun.
 *
 * ⚠️ Bugün yalnızca `metadata` tarafından tüketilir; hero iki yarımı AYRI
 * satırlar hâlinde çizer (büyük puntoda eğik çizgi bir satır sonu gibi değil,
 * bir noktalama hatası gibi okunur).
 */
export const SLOGAN = `${SLOGAN_BAS} / ${SLOGAN_SON}.`;
