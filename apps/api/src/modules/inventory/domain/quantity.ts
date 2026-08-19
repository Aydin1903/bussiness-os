import { InvalidQuantityError } from './inventory.error';

/**
 * Miktar temsili ve ARITMETIGI (ADR-0039 §3.2, §4.2).
 *
 * ============================================================================
 * MIKTAR PROJEDE HICBIR YERDE `number` DEGILDIR
 * ============================================================================
 * Kolon `numeric(14,3)`; Drizzle onu `string` dondurur ve biz de oyle tutariz —
 * `finance/domain/money.ts`in birebir ayni karari. Bir kez `number`a cevrilse
 * geri cevirmek yuvarlama hatasini KALICI hale getirirdi ve ciktisi bir STOK
 * RAKAMIDIR; rakamlara itiraz edilmez.
 *
 * ============================================================================
 * ⚠️ AMA BURADA `money.ts`TEN BIR FARK VAR: BU DOSYA ARITMETIK YAPAR
 * ============================================================================
 * `money.ts` acikca "TOPLAMA BURADA YAPILMAZ, SQL'de yapilir" diyor ve bu
 * dogruydu: Finans'in ihtiyaci olan tek islem TOPLAMAKTI ve toplama SQL'in
 * `numeric` aritmetigiyle yapilabilirdi.
 *
 * Stok'ta bir islem daha var ve SQL'de yapilamaz: FIZIKSEL SAYIM FARKI
 * (`delta = sayilan - mevcut`). Sebep, farkin YALNIZCA bir sayi degil bir
 * KARAR uretmesidir — isaretine gore `in` mi `out` mu yazilacagi, ve sifirsa
 * HICBIR SEY yazilmayacagi (ADR-0039 §3.2). Bu bir IS KURALIDIR, bir sorgu
 * degil; dolayisiyla evi `domain`dir.
 *
 * ⚠️ Aritmetik BigInt ile, SABIT OLCEKTE (10^3) yapilir — `number`a hic
 * dokunulmadan. `0.1 + 0.2` sinifindan bir kayma bu yolda MUMKUN DEGILDIR.
 *
 * ============================================================================
 * ⚠️ MIKTARLAR TOPLANIR AMA BIRIMLER ARASI TOPLANMAZ (ADR-0039 §4.1)
 * ============================================================================
 * Bu dosya bir kalemin KENDI miktarini hesaplar. FARKLI kalemlerin miktarlarini
 * toplayan hicbir fonksiyon YOKTUR ve olmamalidir: 3 kg un ile 12 adet vidanin
 * toplami diye bir sey yoktur (ADR-0034'un para birimi kuralinin ayni sekli).
 */

/** `numeric(14,3)`: en fazla 11 tam sayi hanesi + 3 ondalik. */
const MAX_INTEGER_DIGITS = 11;

/** Ondalik hane sayisi. Kolon `scale` degeriyle SENKRON kalmak ZORUNDA. */
const SCALE = 3;

/** Olcek carpani — BigInt aritmetigi bu tam sayi uzayinda yapilir. */
const SCALE_FACTOR = 10n ** BigInt(SCALE);

/** ⚠️ ISARETLI: sayim farki negatif olabilir (`delta = sayilan - mevcut`). */
const QUANTITY_PATTERN = /^(-)?(\d{1,11})(?:\.(\d{1,3}))?$/;

/**
 * Miktari dogrular ve KANONIK bicime cevirir (`"12.500"`).
 *
 * Kanonik bicim onemlidir: `"12.5"` ve `"12.500"` ayni degerdir ama farkli
 * dizelerdir. Veritabani zaten normallestirir; burada da yapilmasi, YAZMADAN
 * ONCE donen yanitin veritabanindan okunanla AYNI gorunmesini saglar.
 *
 * ⚠️ `money.ts`ten FARKLI: sifir REDDEDILMEZ burada — ama bu fonksiyon
 * ISARETLI degerleri de kabul eder, cunku sayim farki icin de kullanilir.
 * "Hareket miktari pozitif olmali" ayri bir kuraldir ve `assertPositive`
 * ile ayri ayri zorlanir (kolon kisiti `movements_quantity_positive` da
 * uygulamayi ATLAYAN yollari baglar).
 *
 * @throws InvalidQuantityError — kalip disi, aralik disi, sonsuz/NaN.
 */
export function normalizeQuantity(input: string | number): string {
  const raw = typeof input === 'number' ? numberToDecimalString(input) : input.trim();

  const match = QUANTITY_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidQuantityError(raw);
  }

  const [, sign = '', whole = '', fraction = ''] = match;

  if (whole.length > MAX_INTEGER_DIGITS) {
    throw new InvalidQuantityError(raw);
  }

  const padded = fraction.padEnd(SCALE, '0');
  const magnitude = `${String(BigInt(whole))}.${padded}`;

  // ⚠️ "-0.000" diye bir sey YOKTUR: negatif sifir, dizeye cevrildiginde iki
  // farkli gosterime sahip TEK bir degerdir ve karsilastirmalari sessizce
  // bozardi.
  if (sign === '-' && toUnits(magnitude) === 0n) {
    return magnitude;
  }

  return `${sign}${magnitude}`;
}

/**
 * Miktarin POZITIF oldugunu dogrular — hareketler icin (ADR-0039 §3).
 *
 * ⚠️ Sifir de reddedilir: sifir miktarli bir hareket bir kayit degil, olmamis
 * bir akis hakkinda YALANDIR. Veritabani kisiti (`movements_quantity_positive`)
 * ayni seyi soyler; buradaki kontrol istemciye 500 yerine anlamli bir 422
 * dondurur.
 */
export function assertPositiveQuantity(value: string): void {
  if (toUnits(value) <= 0n) {
    throw new InvalidQuantityError(value);
  }
}

/**
 * `a - b` — kanonik dize doner, ISARET TASIYABILIR.
 *
 * ⚠️ Bu, fiziksel sayimin kalbidir (§3.2): `delta = sayilan - mevcut`.
 * BigInt uzerinde yapilir; iki degerin de kanonik oldugu VARSAYILMAZ, ikisi de
 * once normallestirilir.
 */
export function subtractQuantity(a: string, b: string): string {
  const difference = toUnits(normalizeQuantity(a)) - toUnits(normalizeQuantity(b));
  return fromUnits(difference);
}

/** `a < b` mi — esik karsilastirmalari icin (ADR-0039 §6.1). */
export function isQuantityLessThan(a: string, b: string): boolean {
  return toUnits(normalizeQuantity(a)) < toUnits(normalizeQuantity(b));
}

/** `a <= b` mi. */
export function isQuantityAtMost(a: string, b: string): boolean {
  return toUnits(normalizeQuantity(a)) <= toUnits(normalizeQuantity(b));
}

/** Deger sifir mi — `delta === 0` durumunda HICBIR hareket yazilmaz (§3.2). */
export function isQuantityZero(value: string): boolean {
  return toUnits(normalizeQuantity(value)) === 0n;
}

/** Deger negatif mi — negatif stok bir ALARM sinyalidir (§6.1). */
export function isQuantityNegative(value: string): boolean {
  return toUnits(normalizeQuantity(value)) < 0n;
}

/** Isareti atar; `direction` ile birlikte kullanilir (§3.2). */
export function absoluteQuantity(value: string): string {
  const units = toUnits(normalizeQuantity(value));
  return fromUnits(units < 0n ? -units : units);
}

/**
 * Kanonik dize -> olcekli tam sayi.
 *
 * ⚠️ `Number` KULLANILMAZ: `parseFloat("0.1")` zaten kayipli bir degerdir.
 * Dize ikiye bolunur ve iki parca BigInt olarak birlestirilir.
 */
function toUnits(value: string): bigint {
  const canonical = QUANTITY_PATTERN.test(value.trim()) ? value.trim() : normalizeQuantity(value);
  const negative = canonical.startsWith('-');
  const unsigned = negative ? canonical.slice(1) : canonical;

  const [whole = '0', fraction = ''] = unsigned.split('.');
  const units = BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(SCALE, '0').slice(0, SCALE));

  return negative ? -units : units;
}

/** Olcekli tam sayi -> kanonik dize. */
function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;

  const whole = magnitude / SCALE_FACTOR;
  const fraction = (magnitude % SCALE_FACTOR).toString().padStart(SCALE, '0');

  return `${negative ? '-' : ''}${String(whole)}.${fraction}`;
}

/**
 * `number` -> ondalik dize.
 *
 * `toFixed(3)` KULLANILMAZ: o, uc haneden fazla ondalik iceren bir girdiyi
 * SESSIZCE yuvarlardi ve kullanicinin gormedigi bir duzeltme yapmis olurduk.
 * `money.ts`in birebir ayni karari.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InvalidQuantityError(String(value));
  }

  // Ustel gosterim (`1e-7`, `1e21`) kalibi zaten gecemez; yine de acikca
  // reddedilmesi hata mesajini anlasilir kilar.
  const text = String(value);
  if (text.includes('e') || text.includes('E')) {
    throw new InvalidQuantityError(text);
  }

  return text;
}
