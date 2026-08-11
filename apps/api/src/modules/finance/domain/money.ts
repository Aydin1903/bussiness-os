import { InvalidAmountError, InvalidCurrencyError } from './finance.error';

/**
 * Para temsili (ADR-0034 §2c, §2d).
 *
 * ============================================================================
 * TUTAR PROJEDE HICBIR YERDE `number` DEGILDIR
 * ============================================================================
 * Kolon `numeric(14,2)`; Drizzle onu `string` dondurur ve biz de oyle tutariz.
 * Bir kez `number`a cevrilse, geri cevirmek yuvarlama hatasini KALICI hale
 * getirirdi ve hata SESSIZ olurdu — ciktisi bir para rakamidir ve rakamlara
 * itiraz edilmez.
 *
 * TOPLAMA BURADA YAPILMAZ. Nakit akisi ozeti (Slice 3) toplamayi SQL'de,
 * `numeric` aritmetigiyle yapar. Bu dosyanin isi yalnizca DOGRULAMA ve
 * NORMALLESTIRMEDIR.
 *
 * ============================================================================
 * NEDEN `number` DE KABUL EDILIYOR
 * ============================================================================
 * JSON'da ondalik tip YOKTUR; istemciler tutari cogu zaman sayi olarak
 * gonderir. Sayiyi tumuyle reddetmek her naif istemciyi kirardi.
 *
 * Guvenli olmasinin sebebi ARALIKTIR, sansimiz degil: `numeric(14,2)`in en
 * buyuk degeri 999.999.999.999,99 (~1e12) ve bu, IEEE754'un tam olarak
 * temsil edebildigi tam sayi araliginin (2^53 ~ 9e15) COK ALTINDADIR. Yani bu
 * aralikta `String(n)` degeri kayipsiz geri verir.
 *
 * ⚠️ Bu, istemcinin KENDI hesabindaki kayan nokta hatasini duzeltmez
 * (`0.1 + 0.2` gonderilirse `0.30000000000000004` gelir ve REDDEDILIR — iki
 * haneden fazla ondalik). Bu dogru davranistir: sessizce yuvarlamak,
 * kullanicinin gormedigi bir duzeltme yapmak olurdu.
 */

/** `numeric(14,2)`: en fazla 12 tam sayi hanesi + 2 ondalik. */
const MAX_INTEGER_DIGITS = 12;
const AMOUNT_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/**
 * Tutari dogrular ve KANONIK bicime cevirir (`"1500.50"`).
 *
 * Kanonik bicim onemlidir: `"1500.5"` ve `"1500.50"` ayni degerdir ama farkli
 * dizelerdir. Veritabani zaten normallestirir; burada da yapilmasi, YAZMADAN
 * ONCE donen yanitin veritabanindan okunanla ayni gorunmesini saglar.
 *
 * @throws InvalidAmountError — negatif, sifir, iki haneden fazla ondalik,
 *   sonsuz/NaN, ya da aralik disi.
 */
export function normalizeAmount(input: string | number): string {
  const raw = typeof input === 'number' ? numberToDecimalString(input) : input.trim();

  const match = AMOUNT_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidAmountError(raw);
  }

  const [, whole = '', fraction = ''] = match;

  // Sifir REDDEDILIR: tutari sifir olan bir gelir/gider kaydi bir kayit degil,
  // bir gurultudur — ve `transactions_amount_positive` kisiti da onu reddeder.
  // Burada yakalanmasi istemciye 500 yerine anlamli bir 422 dondurur.
  if (Number(whole) === 0 && Number(fraction.padEnd(2, '0')) === 0) {
    throw new InvalidAmountError(raw);
  }

  if (whole.length > MAX_INTEGER_DIGITS) {
    throw new InvalidAmountError(raw);
  }

  return `${String(BigInt(whole))}.${fraction.padEnd(2, '0')}`;
}

/**
 * Para birimini dogrular ve BUYUK HARFE cevirir.
 *
 * ISO 4217 SEKLI zorlanir, KOD LISTESI dogrulanmaz. Liste zamanla degisir ve
 * veritabaninda/kodda tutulan bir kod listesi bakim borcu uretir; sekil
 * kontrolu "TRY" ile "try" ve "TRYY" ayrimini yapmaya yeter.
 *
 * ⚠️ Bedeli acikca: "XYZ" gecerli sayilir. Kabul edildi — yanlis bir kod
 * kullanicinin kendi listesinde gorunur ve duzeltilebilir; eksik bir kod ise
 * kullaniciyi tumuyle engellerdi.
 */
export function normalizeCurrency(input: string): string {
  const upper = input.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new InvalidCurrencyError(input);
  }

  return upper;
}

/**
 * `number` -> ondalik dize.
 *
 * `toFixed(2)` KULLANILMAZ: o, iki haneden fazla ondalik iceren bir girdiyi
 * SESSIZCE yuvarlardi (`0.005` -> `"0.01"`) ve kullanicinin gormedigi bir
 * duzeltme yapmis olurduk. Bunun yerine sayi oldugu gibi dizeye cevrilir ve
 * kaliba UYMAZSA reddedilir.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InvalidAmountError(String(value));
  }

  // Ustel gosterim (`1e-7`, `1e21`) kalibi zaten gecemez; yine de acikca
  // reddedilmesi hata mesajini anlasilir kilar.
  const text = String(value);
  if (text.includes('e') || text.includes('E')) {
    throw new InvalidAmountError(text);
  }

  return text;
}
