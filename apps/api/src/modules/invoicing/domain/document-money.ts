import {
  InvalidDocumentCurrencyError,
  InvalidLineQuantityError,
  InvalidTaxRateError,
  InvalidUnitPriceError,
} from './invoicing.error';

/**
 * Belge aritmetigi (ADR-0041 §1.3, §1.4, §1.7, §1.8).
 *
 * ============================================================================
 * PARA VE MIKTAR PROJEDE HICBIR YERDE `number` DEGILDIR
 * ============================================================================
 * `finance/domain/money.ts` ve `inventory/domain/quantity.ts` ile ayni karar,
 * UCUNCU kez: kolonlar `numeric`, Drizzle onlari `string` dondurur ve biz de
 * oyle tutariz. Bir kez `number`a cevrilse yuvarlama hatasi KALICI olurdu ve
 * ciktisi bir PARA RAKAMIDIR; rakamlara itiraz edilmez.
 *
 * ============================================================================
 * ⚠️ AMA BURADA `money.ts`TEN IKI FARK VAR
 * ============================================================================
 * (1) `money.ts` acikca _"TOPLAMA BURADA YAPILMAZ, SQL'de yapilir"_ diyor ve
 *     bu Finans icin dogruydu: orada tek islem TOPLAMAKTI ve SQL'in `numeric`
 *     aritmetigi yetiyordu. Burada islem CARPMADIR (`miktar × birim fiyat`,
 *     sonra `× vergi orani`) ve sonucu KULLANICIYA BASILAN bir belgede
 *     gorunur — yani bir IS KURALIDIR, bir sorgu degil. Evi `domain`dir.
 *
 * (2) `money.ts` sifiri ve negatifi REDDEDER; burada birim fiyat NEGATIF
 *     OLABILIR (§1.7 — iskonto satiri).
 *
 * ⚠️ Aritmetik BigInt ile, SABIT OLCEKTE yapilir — `number`a hic dokunulmadan.
 * `0.1 + 0.2` sinifindan bir kayma bu yolda MUMKUN DEGILDIR.
 *
 * ============================================================================
 * ⚠️ SATIR BAZINDA YUVARLANIR, SONRA TOPLANIR — VE BU BIR KARARDIR
 * ============================================================================
 * Iki secenek vardi:
 *
 *   (a) once topla, sonra yuvarla  -> matematiksel olarak "daha dogru"
 *   (b) satir bazinda yuvarla, sonra topla  -> SECILEN
 *
 * (a) SESSIZ BIR TUTARSIZLIK uretirdi: belgenin uzerinde basili satir
 * toplamlari, basili ara toplama ELDE TOPLANDIGINDA ESIT CIKMAZDI. Musteri
 * kagida bakip toplar ve bizim yazdigimiz rakamdan farkli bir sonuc bulur.
 * Fark bir kurusluktur ama guveni bozan sey buyuklugu degil, ACIKLANAMAZ
 * OLMASIDIR.
 *
 * (b) her zaman kendi icinde tutarli bir belge uretir. Bedeli: toplam, sonsuz
 * hassasiyetli hesaptan birkac kurus sapabilir. Kabul edildi.
 *
 * ⚠️ Ayni gerekce VERGI icin de gecerlidir: vergi SATIR BAZINDA hesaplanir ve
 * yuvarlanir, sonra toplanir.
 *
 * ============================================================================
 * ⚠️ PARA BIRIMLERI TOPLANMAZ
 * ============================================================================
 * Bu dosyada iki farkli para birimini toplayan HICBIR fonksiyon YOKTUR ve
 * olmamalidir (ADR-0034'un kurali; ADR-0039'un birim kuralinin ayni sekli).
 * Para birimi BELGE BASINADIR (§1.4), yani bir belgenin tum satirlari zaten
 * ayni para birimindedir ve toplama MESRUDUR.
 */

/** `numeric(14,3)`: en fazla 11 tam sayi hanesi + 3 ondalik. */
const QUANTITY_SCALE = 3;
const QUANTITY_PATTERN = /^(\d{1,11})(?:\.(\d{1,3}))?$/;

/** `numeric(14,2)`: en fazla 12 tam sayi hanesi + 2 ondalik. ⚠️ ISARETLI. */
const MONEY_SCALE = 2;
const MONEY_PATTERN = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/;

/** `numeric(5,2)`: `0.00` .. `100.00`. */
const TAX_RATE_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

const MONEY_UNIT = 10n ** BigInt(MONEY_SCALE);

/**
 * Miktari dogrular ve KANONIK bicime cevirir (`"12.500"`).
 *
 * ⚠️ SIFIR REDDEDILIR: sifir miktarli bir satir belgede yer kaplayan bir
 * gurultudur ve `sales_document_lines_quantity_positive` kisiti da onu
 * reddeder — buradaki kontrol istemciye 500 yerine anlamli bir 422 dondurur.
 *
 * ⚠️ NEGATIF DE REDDEDILIR ve bu, birim fiyattan AYRILDIGI yerdir: bir iskontoyu
 * NEGATIF MIKTARLA ifade etmek ("−1 adet urun") belgeyi okunamaz kilardi;
 * dogru yol negatif BIRIM FIYATTIR (§1.7).
 */
export function normalizeQuantity(input: string | number): string {
  const raw = toDecimalString(input, () => new InvalidLineQuantityError(String(input)));

  const match = QUANTITY_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidLineQuantityError(raw);
  }

  const [, whole = '', fraction = ''] = match;
  const canonical = `${String(BigInt(whole))}.${fraction.padEnd(QUANTITY_SCALE, '0')}`;

  if (toUnits(canonical, QUANTITY_SCALE) <= 0n) {
    throw new InvalidLineQuantityError(raw);
  }

  return canonical;
}

/**
 * Birim fiyati dogrular ve KANONIK bicime cevirir (`"1500.50"`, `"-500.00"`).
 *
 * ⚠️ ISARET SERBESTTIR (§1.7) ve bu ADR-0034 §5'e AYKIRI DEGILDIR: orada
 * isaret bir ANLAM EKSENI tasiyordu (gelir mi gider mi) ve unutulmasi kaydin
 * TURUNU degistiriyordu. Burada isaret yalnizca ARITMETIKTIR — satirin belge
 * toplamina katkisi — ve sonucu BELGENIN UZERINDE YAZILIDIR; gizli bir ozet
 * rakami degildir.
 *
 * ⚠️ SIFIR MESRUDUR: bedelsiz bir kalem ("promosyon urun") gercek bir satirdir.
 */
export function normalizeUnitPrice(input: string | number): string {
  const raw = toDecimalString(input, () => new InvalidUnitPriceError(String(input)));

  const match = MONEY_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidUnitPriceError(raw);
  }

  const [, sign = '', whole = '', fraction = ''] = match;
  const magnitude = `${String(BigInt(whole))}.${fraction.padEnd(MONEY_SCALE, '0')}`;

  // ⚠️ "-0.00" diye bir sey YOKTUR: negatif sifir, dizeye cevrildiginde iki
  // farkli gosterime sahip TEK bir degerdir ve karsilastirmalari sessizce
  // bozardi (`quantity.ts`in ayni karari).
  if (sign === '-' && toUnits(magnitude, MONEY_SCALE) === 0n) {
    return magnitude;
  }

  return `${sign}${magnitude}`;
}

/**
 * Vergi oranini dogrular ve KANONIK bicime cevirir (`"20.00"`).
 *
 * ⚠️ Sistem hicbir vergi KURALI bilmez (§1.8): muafiyet, tevkifat, ulke bazli
 * oran, istisna kodu — hicbiri yoktur. Burada dogrulanan tek sey ARALIK ve
 * BICIMDIR.
 */
export function normalizeTaxRate(input: string | number): string {
  const raw = toDecimalString(input, () => new InvalidTaxRateError(String(input)));

  const match = TAX_RATE_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidTaxRateError(raw);
  }

  const [, whole = '', fraction = ''] = match;
  const canonical = `${String(BigInt(whole))}.${fraction.padEnd(MONEY_SCALE, '0')}`;

  if (toUnits(canonical, MONEY_SCALE) > 100n * MONEY_UNIT) {
    throw new InvalidTaxRateError(raw);
  }

  return canonical;
}

/**
 * Para birimini dogrular ve BUYUK HARFE cevirir.
 *
 * ISO 4217 SEKLI zorlanir, KOD LISTESI dogrulanmaz — `money.ts`in birebir ayni
 * karari ve gerekcesi: liste zamanla degisir ve kodda tutulan bir kod listesi
 * bakim borcu uretir.
 *
 * ⚠️ Bedeli acikca: "XYZ" gecerli sayilir. Kabul edildi — yanlis bir kod
 * kullanicinin kendi belgesinde GORUNUR ve duzeltilebilir; eksik bir kod ise
 * kullaniciyi TUMUYLE ENGELLERDI.
 */
export function normalizeCurrency(input: string): string {
  const upper = input.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new InvalidDocumentCurrencyError(input);
  }

  return upper;
}

/** Tek bir satirin aritmetik girdisi. */
export interface LineAmounts {
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
}

/** Tek bir satirin turetilmis tutarlari — HEPSI kanonik dize. */
export interface LineTotals {
  /** `miktar × birim fiyat`, iki haneye yuvarlanmis. */
  readonly net: string;
  /** `net × oran / 100`, iki haneye yuvarlanmis. */
  readonly tax: string;
  /** `net + vergi`. */
  readonly gross: string;
}

/** Belgenin turetilmis toplamlari (§1.3 — HICBIRI KOLONDA SAKLANMAZ). */
export interface DocumentTotals {
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
}

/**
 * Tek satirin tutarlarini turetir.
 *
 * ⚠️ Yuvarlama SIFIRDAN UZAGA (half away from zero), "bankaci yuvarlamasi"
 * DEGIL. Gerekce: negatif birim fiyatli iskonto satirlari mevcuttur ve
 * bankaci yuvarlamasi pozitif/negatif satirlarda FARKLI yonlere sapardi —
 * ayni mutlak deger, iki farkli sonuc. Belgede bu, aciklanamaz bir kurus farki
 * olarak gorunurdu.
 */
export function computeLineTotals(line: LineAmounts): LineTotals {
  const quantityUnits = toUnits(line.quantity, QUANTITY_SCALE);
  const priceUnits = toUnits(line.unitPrice, MONEY_SCALE);

  // olcek: 3 + 2 = 5 -> 2'ye yuvarla (10^3'e bol).
  const netUnits = roundedDivide(quantityUnits * priceUnits, 10n ** BigInt(QUANTITY_SCALE));

  // olcek: 2 + 2 = 4; ayrica `/100` -> toplam 10^4'e bol.
  const taxUnits = roundedDivide(netUnits * toUnits(line.taxRate, MONEY_SCALE), 10_000n);

  return {
    net: fromUnits(netUnits),
    tax: fromUnits(taxUnits),
    gross: fromUnits(netUnits + taxUnits),
  };
}

/**
 * Belgenin toplamlarini turetir.
 *
 * ⚠️ HICBIRI KOLONDA SAKLANMAZ (§1.3). "Gonderilmis belgenin toplami
 * DONDURULMALI" itirazinin cevabi bir kolon degil §2'dir: gonderilmis belgenin
 * kalemleri DEGISTIRILEMEZ, yani kaynak degismiyorsa turetilen deger de
 * degismez. Donduran sey bir KOPYA degil BIR KISITTIR.
 *
 * ⚠️ Bos bir belge `0.00` doner — hata DEGIL. Taslak kalemsiz olabilir
 * (`EmptyDocumentError` yalnizca GONDERIM aninda firlar).
 */
export function computeDocumentTotals(lines: readonly LineAmounts[]): DocumentTotals {
  let subtotalUnits = 0n;
  let taxUnits = 0n;

  for (const line of lines) {
    const totals = computeLineTotals(line);
    subtotalUnits += toUnits(totals.net, MONEY_SCALE);
    taxUnits += toUnits(totals.tax, MONEY_SCALE);
  }

  return {
    subtotal: fromUnits(subtotalUnits),
    taxTotal: fromUnits(taxUnits),
    total: fromUnits(subtotalUnits + taxUnits),
  };
}

/**
 * Kanonik dizeyi tam sayi birimlerine cevirir.
 *
 * Girdinin KANONIK oldugu VARSAYILMAZ: eksik ondalik hane doldurulur.
 */
function toUnits(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const magnitude = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = magnitude.split('.');
  const units = BigInt(`${whole}${fraction.padEnd(scale, '0').slice(0, scale)}`);

  return negative ? -units : units;
}

/** Tam sayi birimlerini iki ondalikli kanonik dizeye cevirir. */
function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / MONEY_UNIT;
  const fraction = (absolute % MONEY_UNIT).toString().padStart(MONEY_SCALE, '0');

  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/**
 * SIFIRDAN UZAGA yuvarlayan bolme.
 *
 * ⚠️ BigInt bolmesi JS'te SIFIRA DOGRU kirpar (`-7n / 2n === -3n`). Kirpma
 * kullanilsaydi negatif satirlar (iskonto) pozitiflerden FARKLI yone saparadi
 * ve ayni mutlak deger iki farkli sonuc verirdi.
 */
function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;

  return negative ? -rounded : rounded;
}

/**
 * `number` -> ondalik dize.
 *
 * `toFixed` KULLANILMAZ: o, fazla ondalik iceren bir girdiyi SESSIZCE
 * yuvarlardi ve kullanicinin gormedigi bir duzeltme yapmis olurduk
 * (`money.ts`in ayni karari). Bunun yerine sayi oldugu gibi dizeye cevrilir ve
 * kaliba UYMAZSA reddedilir.
 */
function toDecimalString(input: string | number, onInvalid: () => Error): string {
  if (typeof input === 'string') {
    return input.trim();
  }

  if (!Number.isFinite(input)) {
    throw onInvalid();
  }

  const text = String(input);
  // Ustel gosterim (`1e-7`, `1e21`) kalibi zaten gecemez; acikca reddedilmesi
  // hata mesajini anlasilir kilar.
  if (text.includes('e') || text.includes('E')) {
    throw onInvalid();
  }

  return text;
}
