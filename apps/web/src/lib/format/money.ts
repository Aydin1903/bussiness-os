/**
 * PARA BİÇİMLENDİRME — diziyi PARÇALAR, sayıya ÇEVİRMEZ.
 *
 * ============================================================================
 * NEDEN `Number` YOK, NEDEN `toLocaleString` YOK
 * ============================================================================
 * Bu projede para hiçbir noktada `number` olmaz (ADR-0034). Sunucu kanonik bir
 * dize gönderir (`"1284500.00"`) ve ekran onu olduğu gibi basar. Bir biçimlendirici
 * için sayıya çevirmek, IEEE-754'ün yuvarlama davranışını para yoluna sokmak
 * demektir: `Number("0.1") + Number("0.2")` gibi hatalar bir çubuğun genişliğinde
 * görünmez ama bir TUTARDA görünür.
 *
 * `toLocaleString('tr-TR')` de kullanılmıyor ve bu bilinçli bir karar:
 *
 *   1. SAYIYA ÇEVİRMEYİ GEREKTİRİR — yukarıdaki gerekçenin aynısı.
 *   2. TARAYICININ LOCALE VERİSİNE BAĞLIDIR. Aynı kod farklı tarayıcıda,
 *      farklı işletim sisteminde ya da eksik ICU verisiyle derlenmiş bir
 *      Node'da FARKLI çıktı verebilir — ve fark sessizdir.
 *
 * ⚠️ İkinci madde teorik değil: bu projede aynı sınıftan bir hata YAŞANDI.
 * `text-transform: uppercase`, belge `lang="tr"` olduğu için "Business OS"u
 * ekranda **"BUSİNESS OS"** diye çizdi (noktalı İ). Locale'e duyarlı her
 * dönüşüm aynı riski taşır. Bu yüzden burada davranış SABİTLENMİŞTİR:
 * ayraçlar koda yazılıdır ve hiçbir ortam onları değiştiremez.
 */

/** Binlik ayracı — TR standardı. Ortamdan OKUNMAZ, burada sabittir. */
const GROUP = '.';

/** Ondalık ayracı — TR standardı. */
const DECIMAL = ',';

/** Tipografik eksi: rakamlarla aynı genişlikte durur, `tabular` hizasını bozmaz. */
const MINUS = '−';

/**
 * Kanonik para dizesini TR biçimine çevirir.
 *
 *   "1284500.00"  → "1.284.500,00"
 *   "-530000.00"  → "−530.000,00"
 *   "840000"      → "840.000"
 *   "0.50"        → "0,50"
 *
 * ⚠️ TANIMADIĞI GİRDİYİ OLDUĞU GİBİ DÖNER, uydurmaz ve fırlatmaz. Sunucudan
 * beklenmedik bir şekil gelirse ekranda ham hâliyle görünür — yanlış
 * biçimlendirilmiş bir tutar göstermektense ham göstermek doğrudur, çünkü
 * ikincisi fark edilir.
 */
export function formatMoney(canonical: string): string {
  const trimmed = canonical.trim();

  // İşaret dizenin başındadır; gövdeden ayrılıp sonda geri eklenir.
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;

  // Yalnızca rakam ve EN FAZLA bir nokta. `1e5`, `1,5`, boş dize vb. tanınmaz.
  if (!/^\d+(\.\d+)?$/.test(body)) {
    return canonical;
  }

  const [whole = '', fraction] = body.split('.');
  const grouped = groupThousands(whole);
  const shown = fraction === undefined ? grouped : `${grouped}${DECIMAL}${fraction}`;

  return negative ? `${MINUS}${shown}` : shown;
}

/**
 * Sıfır kuruşu GİZLEYEN biçim — yoğun listeler için.
 *
 *   "250000.00" → "250.000"
 *   "250000.50" → "250.000,50"
 *
 * ⚠️ Bu, CRM'in fırsat kartlarında ZATEN alınmış bir karardır ve korunuyor:
 * "250.000" ile "250.000,00" aynı bilgiyi taşır, ikincisi listeyi gürültüyle
 * doldurur. Duvarın kahraman rakamı ise TAM biçimi kullanır (`formatMoney`) —
 * orada tek bir sayı var ve kuruş bilgi taşır.
 *
 * ⚠️ `Number(fraction) === 0` kontrolü tutarı SAYIYA ÇEVİRMEZ; yalnızca
 * ondalık PARÇASINA bakar ("00" → 0). Tutarın kendisi hiçbir noktada sayıya
 * dönmüyor.
 */
export function formatMoneyCompact(canonical: string): string {
  const formatted = formatMoney(canonical);
  const [whole = '', fraction] = formatted.split(DECIMAL);

  if (fraction === undefined || !/^\d+$/.test(fraction) || Number(fraction) !== 0) {
    return formatted;
  }
  return whole;
}

/**
 * Tam sayı kısmını üçerli gruplar.
 *
 * ⚠️ SAĞDAN SOLA. Soldan gruplamak `12345`i `123.45` yapardı — klasik hata.
 * `replace` ile ileri bakış (`(?=(\d{3})+$)`) tek satırda çözer ve dizeyi
 * hiçbir noktada sayıya çevirmez.
 */
function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+$)/g, GROUP);
}
