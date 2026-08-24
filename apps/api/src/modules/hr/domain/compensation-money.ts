import {
  InvalidCompensationAmountError,
  InvalidCompensationCurrencyError,
  InvalidHrDateError,
} from './hr.error';

/**
 * Ucret temsili ve takvim gunu (ADR-0043 §1.2, §4.4).
 *
 * ============================================================================
 * TUTAR PROJEDE HICBIR YERDE `number` DEGILDIR — DORDUNCU KEZ
 * ============================================================================
 * `finance/domain/money.ts`, `inventory/domain/quantity.ts` ve
 * `invoicing/domain/document-money.ts` ile ayni karar. Kolon `numeric(14,2)`;
 * Drizzle onu `string` dondurur ve biz de oyle tutariz. Bir kez `number`a
 * cevrilse yuvarlama hatasi KALICI olurdu ve ciktisi BIR MAAS RAKAMIDIR.
 *
 * ============================================================================
 * ⚠️ NEDEN `shared/`A TASINMADI — ADR-0034 §4.1'IN AYNI CEVABI
 * ============================================================================
 * Dorduncu kez neredeyse ayni kod yaziliyor ve "ortak bir para modulu" cazip
 * gorunuyor. ADR-0034 bu genellestirmeyi DEGERLENDIRDI VE REDDETTI: genellesen
 * sey kod degil SOZLESME SEKLIDIR. Somut fark burada da var — bu modulde tutar
 * POZITIF olmak zorundadir (`document-money.ts` negatife izin verir, iskonto
 * satiri icin), yani ortak bir fonksiyon parametreyle bu ayrimi tasimak
 * zorunda kalirdi ve o parametre, kuralin nerede uygulandigini GORUNMEZ
 * yapardi.
 *
 * ============================================================================
 * ⚠️ TOPLAMA YOKTUR VE OLMAYACAKTIR
 * ============================================================================
 * Bu dosyada iki ucreti toplayan HICBIR fonksiyon yoktur. "Toplam maas gideri"
 * diye bir rakam BULUNMAZ (§4.4) ve IKI bagimsiz sebebi var:
 *   1. Para birimleri TOPLANMAZ (ADR-0034'un kurali, ADR-0039'un birim
 *      kuralinin ayni sekli).
 *   2. ⚠️ O rakam bir OZET UZERINDEN MAAS SIZDIRMA yoludur: uc kisilik bir
 *      ekipte toplam, tek tek maaslara neredeyse esittir.
 */

/** `numeric(14,2)`: en fazla 12 tam sayi hanesi + 2 ondalik. ⚠️ ISARETSIZ. */
const AMOUNT_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/**
 * Ucreti dogrular ve KANONIK bicime cevirir (`"75000.00"`).
 *
 * Kanonik bicim, YAZMADAN ONCE donen yanitin veritabanindan okunanla ayni
 * gorunmesini saglar (`"75000.5"` ve `"75000.50"` ayni deger, farkli dize).
 *
 * ⚠️ SIFIR VE NEGATIF REDDEDILIR: ucreti sifir olan bir kayit bir kayit degil,
 * bir gurultudur — ve `compensation_amount_positive` kisiti da onu reddeder.
 */
export function normalizeCompensationAmount(input: string | number): string {
  const raw = typeof input === 'number' ? numberToDecimalString(input) : input.trim();

  const match = AMOUNT_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidCompensationAmountError(raw);
  }

  const [, whole = '', fraction = ''] = match;

  if (Number(whole) === 0 && Number(fraction.padEnd(2, '0')) === 0) {
    throw new InvalidCompensationAmountError(raw);
  }

  return `${String(Number(whole))}.${fraction.padEnd(2, '0')}`;
}

/**
 * ⚠️ Yalnizca SEKIL dogrulanir, KOD LISTESI DEGIL — "XYZ" gecerli sayilir.
 *
 * ADR-0034'un bilinen sinirinin ikinci kez tekrari. Gercek bir ISO 4217 listesi
 * tutmak, listeyi GUNCEL TUTMA borcu yaratirdi.
 */
export function normalizeCompensationCurrency(input: string): string {
  const upper = input.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new InvalidCompensationCurrencyError(input);
  }

  return upper;
}

/**
 * `YYYY-MM-DD` bicimi VE gercek bir takvim gunu.
 *
 * ⚠️ Yalnizca kalip kontrolu YETMEZ: `2026-02-31` kalibi gecer ama var olmayan
 * bir gundur ve PostgreSQL onu `date` kolonuna yazarken reddeder — kullanici
 * 422 yerine 500 alirdi. `finance/domain/calendar-day.ts` ile ayni kural;
 * kopyalanmasinin gerekcesi o dosyanin kendi yorumunda: modul ICI bir domain
 * yardimcisidir, `shared/`a girmez (ARCHITECTURE 6.1 — bir modulun domain'ini
 * baska modul import edemez).
 */
export function assertHrCalendarDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) {
    throw new InvalidHrDateError(value);
  }

  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new InvalidHrDateError(value);
  }

  return `${year}-${month}-${day}`;
}

/** `Date` -> `YYYY-MM-DD` (UTC). `Clock`tan gelen "bugun" icin. */
export function toHrCalendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * `number` -> ondalik dize.
 *
 * JSON'da ondalik tip YOKTUR; istemciler ucreti cogu zaman sayi gonderir.
 * `numeric(14,2)`in ust siniri (~1e12) IEEE754'un tam temsil ettigi araligin
 * (2^53 ~ 9e15) COK ALTINDADIR, yani bu aralikta `String(n)` kayipsizdir.
 *
 * ⚠️ Istemcinin KENDI kayan nokta hatasini DUZELTMEZ: `0.1 + 0.2` gonderilirse
 * `0.30000000000000004` gelir ve REDDEDILIR (ikiden fazla ondalik). Sessizce
 * yuvarlamak, kullanicinin gormedigi bir duzeltme yapmak olurdu.
 */
function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InvalidCompensationAmountError(String(value));
  }

  return String(value);
}
