/**
 * UUIDv7 bicim dogrulamasi.
 *
 * Domain katmani id URETMEZ, yalnizca DOGRULAR. Uretim `Math.random()` ve
 * `Date.now()` gerektirir; DEVELOPMENT_RULES 3.2 bunlarin domain icinde
 * dogrudan cagrilmasini yasaklar ve port ile enjekte edilmesini sart kosar.
 * Bu yuzden burada `generate()` yoktur — id daima disaridan gelir.
 *
 * Yan fayda: domain testleri sahte saat veya sahte uretici gerektirmez
 * (DEVELOPMENT_RULES 5.3 — domain testleri mock'suz yazilir).
 *
 * NOT: Bu yardimci, Identity modulu geldiginde `shared/` kernel'e tasinmalidir.
 * Bugun orada bir kernel yok; modul icinde tutuluyor.
 */

/**
 * 8-4-4-4-12 onaltilik duzen; 3. grubun ilk hanesi surum (7), 4. grubun ilk
 * hanesi RFC 4122 variant'i (8, 9, a veya b) olmak zorundadir.
 *
 * Surum hanesini kontrol etmemek, UUIDv4'un UUIDv7 yerine gecmesine izin verir:
 * ikisi ayni uzunluktadir ve gozle ayirt edilemez. v7'nin zaman-sirali olmasi
 * index performansinin dayanagidir (DEVELOPMENT_RULES 6), bu yuzden sessizce
 * v4 kabul etmek sonradan fark edilen bir hatadir.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Girdiyi normalize eder ve UUIDv7 ise dondurur, degilse `null` verir.
 *
 * Normalizasyon (trim + kucuk harf) bilincli bir karardir: ayni id'nin buyuk
 * ve kucuk harfli yazimi iki farkli value object uretirse `equals` yanlis
 * sonuc verir ve bu, sessizce yanlis calisan bir esitlik demektir.
 */
export function normalizeUuidV7(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_V7_PATTERN.test(normalized) ? normalized : null;
}
