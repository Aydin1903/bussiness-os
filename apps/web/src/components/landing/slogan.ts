/**
 * MARKANIN SLOGANI — tek kaynak (Product Owner, 2026-09-09).
 *
 * ============================================================================
 * ⚠️ NEDEN BİR DOSYA — VE NEDEN İKİ PARÇA HÂLİNDE
 * ============================================================================
 * Slogan bugün İKİ yerde tüketilir: hero'nun `<h1>`i (iki yarım, iki satır) ve
 * sayfa başlığı (`metadata` — yalnızca birinci yarım). ⚠️ İki yere ayrı ayrı
 * yazılsaydı **sessizce ayrışırlardı** — biri güncellenir, öteki eski kalır ve
 * hiçbir test kırmızı yanmaz. ⚠️ Ve bu ayrışmanın en sinsi hâli `metadata`dır:
 * ekranda doğru slogan, tarayıcı sekmesinde ve arama sonucunda eskisi.
 *
 * Bu projede aynı sınıf hata ölçülerek yaşandı: yazılı logonun auth'ta metin,
 * landing'de görsel olan iki uygulaması ADR-0054'te "bugün kabul edilen,
 * ölçülmüş bir borç" olarak kayda geçti. Aynı borcu slogan için açmıyoruz ve
 * bir test kaynağı tarayıp kopya olmadığını kilitliyor.
 *
 * ⚠️ İKİ YARIM AYRI AYRI DIŞA AÇILIR çünkü iki tüketici **farklı miktarını**
 * kullanır.
 */

/**
 * Birinci yarım — hero'nun ilk satırı ve sayfa başlığının (`metadata`) taşıdığı
 * parça.
 *
 * ⚠️ TEK BAŞINA DA BİR DESCRIPTOR'DIR ve bir ara üst çubukta logonun altında
 * kullanıldı. ⚠️ O deneme GERİ ALINDI (Product Owner, 2026-09-09): yazılı logo
 * zaten kendi alt satırını görselin içinde taşıyor ve üçüncü bir satır marka
 * kilitlenmesini kalabalıklaştırıyordu. ⚠️ Bir imza her yerde tekrarlanınca
 * güçlenmiyor, seyreliyor.
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
