/** Teklif / Fatura domain hatalari (ADR-0041). */
export abstract class InvoicingDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Belge bulunamadi.
 *
 * ============================================================================
 * ⚠️ UC DURUM AYNI HATAYI ALIR — VE UCUNCUSU BU MODULE OZGU
 * ============================================================================
 *   1. Kayit yok,
 *   2. Baska tenant'in kaydi (RLS zaten gormez),
 *   3. ⚠️ KAYIT VAR AMA YANLIS TURDE — `/quotes/:id` ile bir FATURA id'si
 *      istendi (ya da tersi).
 *
 * Ucuncusu ayirt edilseydi (`409 kind mismatch` gibi) bir kullanici, GORME
 * YETKISI OLMAYABILECEGI bir belgenin VAR OLDUGUNU ogrenirdi — ustelik
 * `quote:read` ve `invoice:read` AYRI IZINLERDIR (§9), yani sizinti teorik
 * degil GERCEKTIR: `invoice:read` tasimayan biri `/quotes/<fatura-id>` ile
 * fatura varligini yoklayabilirdi.
 *
 * P2 disiplini: "yok" ile "senin degil" ayirt edilmez.
 */
export class SalesDocumentNotFoundError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_NOT_FOUND';
  constructor() {
    super('Belge bulunamadi.');
  }
}

/**
 * Belge artik duzenlenemez (ADR-0041 §2).
 *
 * ============================================================================
 * ⚠️ BU, KORUMANIN BIRINCI KATMANIDIR — UCUNCUSU VERITABANINDA
 * ============================================================================
 * Gonderilmis bir teklifin ve kesilmis bir faturanin BASLIGI VE KALEMLERI
 * degistirilemez. Koruma uc katmanlidir:
 *
 *     domain      -> bu hata (`assertEditable`)
 *     uc          -> `PATCH`/`DELETE` yalnizca `draft`ta; aksi halde 409
 *     VERITABANI  -> `sales_document_lines_immutable_after_send` trigger'i
 *
 * ⚠️ Ucuncusu neden SART: kalemler AYRI BIR TABLODADIR, yani baslik uzerindeki
 * bir kontrol onlari KAPSAMAZ. Tek bir yeni yazma yolu kontrolu atlarsa hata
 * SESSIZ olur.
 *
 * ⚠️ ADR-0039'un DEGISTIRILEMEZ DEFTERIYLE KARISTIRILMASIN: orada koruma HER
 * ZAMAN gecerliydi cunku BUGUNKU MIKTAR o defterden turetiliyordu. Burada
 * yalnizca `draft` SONRASI gecerlidir — taslak serbestce duzenlenir.
 *
 * ⚠️ 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
 * elverissizdir.
 */
export class DocumentNotEditableError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_NOT_EDITABLE';
  constructor(status: string) {
    super(
      `Bu belge artik duzenlenemez (durum: ${status}). ` +
        'Yanlis bir belge duzeltilmez; dogrusu YENI bir belge olarak yazilir.',
    );
  }
}

/**
 * Gecersiz durum gecisi (ADR-0041 §1.2).
 *
 * ⚠️ GERI DONUS YOKTUR: `sent` bir teklif `draft`a, `issued` bir fatura
 * `draft`a DONMEZ. Bu gecisler belgenin DISARI CIKTIGI andir ve geri almak,
 * musteride duran bir kagidi yok saymaktir.
 */
export class InvalidStatusTransitionError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_INVALID_TRANSITION';
  constructor(from: string, to: string) {
    super(`Bu durum gecisi gecerli degil: ${from} -> ${to}.`);
  }
}

/**
 * Kabul edilmemis teklif faturaya donusturulemez (ADR-0041 §3).
 *
 * ⚠️ `sent` YETMEZ: kabul edilmemis bir teklifi faturalamak, OLMAYAN BIR
 * MUTABAKATI varsaymaktir.
 */
export class QuoteNotAcceptedError extends InvoicingDomainError {
  readonly code = 'QUOTE_NOT_ACCEPTED';
  constructor(status: string) {
    super(`Yalnizca kabul edilmis bir teklif faturaya donusturulebilir (durum: ${status}).`);
  }
}

/**
 * Belgenin kalemi yok.
 *
 * ⚠️ TASLAK KALEMSIZ OLABILIR — bu hata yalnizca GONDERIM/KESIM aninda
 * firlatilir. Bos bir belgeyi musteriye gondermek, sistemin kullaniciya
 * yaptirmamasi gereken tek "sessiz sacmalik"tir: PDF uretilir, gonderilir ve
 * karsi taraf bos bir kagit alir.
 */
export class EmptyDocumentError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_EMPTY';
  constructor() {
    super('Kalemi olmayan bir belge gonderilemez / kesilemez.');
  }
}

/**
 * Satir sayisi ust siniri asti.
 *
 * ⚠️ Sinir bir GIRDI kuralidir: uretilen PDF sayfa sayisiyla dogru orantili
 * buyur ve tek istekte sinirsiz satir kabul etmek, bir istegin sunucu
 * bellegini ve yanit suresini SINIRSIZ buyutmesine izin vermek olurdu.
 * ADR-0037'nin `MAX_CHUNKS` siniriyla ayni sinif.
 *
 * ⚠️ SESSIZ KIRPMA YASAK: fazlasi atilmaz, istek REDDEDILIR.
 */
export class TooManyLinesError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_TOO_MANY_LINES';
  constructor(actual: number, max: number) {
    super(`Belge cok fazla satir tasiyor: ${String(actual)}. En fazla ${String(max)} olabilir.`);
  }
}

/** Musteri adi bos olamaz (ADR-0041 §1.5). */
export class BlankCustomerNameError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_CUSTOMER_NAME_BLANK';
  constructor() {
    super('Musteri adi bos olamaz.');
  }
}

/** Satir aciklamasi bos olamaz. */
export class BlankLineDescriptionError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_LINE_DESCRIPTION_BLANK';
  constructor() {
    super('Satir aciklamasi bos olamaz.');
  }
}

/**
 * Miktar gecersiz.
 *
 * ⚠️ SIFIR DA REDDEDILIR: sifir miktarli bir satir bir kayit degil, belgede
 * yer kaplayan bir GURULTUDUR — ve `sales_document_lines_quantity_positive`
 * kisiti da onu reddeder. Buradaki kontrol istemciye 500 yerine anlamli bir
 * 422 dondurur.
 */
export class InvalidLineQuantityError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_LINE_QUANTITY_INVALID';
  constructor(value: string) {
    super(`Gecersiz miktar: ${value}. Pozitif ve en fazla 3 ondalik basamakli olmali.`);
  }
}

/**
 * Birim fiyat gecersiz.
 *
 * ⚠️ NEGATIF DEGER GECERLIDIR (ADR-0041 §1.7) — bir iskonto satiri
 * ("Sadakat indirimi × 1 × -500") mesru bir belge satiridir. Reddedilen sey
 * BICIMDIR: iki haneden fazla ondalik, aralik disi deger, `NaN`.
 */
export class InvalidUnitPriceError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_UNIT_PRICE_INVALID';
  constructor(value: string) {
    super(`Gecersiz birim fiyat: ${value}. En fazla 2 ondalik basamakli olmali.`);
  }
}

/**
 * Vergi orani gecersiz.
 *
 * ⚠️ Oran BIR SAYIDIR, BIR KURAL DEGIL (§1.8): sistem muafiyet, tevkifat ya da
 * ulke bazli oran BILMEZ. Yalnizca `0..100` araligi ve iki ondalik zorlanir.
 */
export class InvalidTaxRateError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_TAX_RATE_INVALID';
  constructor(value: string) {
    super(`Gecersiz vergi orani: ${value}. 0 ile 100 arasinda olmali.`);
  }
}

/**
 * Para birimi gecersiz.
 *
 * ISO 4217 SEKLI zorlanir, KOD LISTESI dogrulanmaz — ADR-0034'un ayni karari.
 * ⚠️ Bedeli acikca: "XYZ" gecerli sayilir.
 */
export class InvalidDocumentCurrencyError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_CURRENCY_INVALID';
  constructor(value: string) {
    super(`Gecersiz para birimi: ${value}. Uc harfli ISO 4217 kodu bekleniyor (ornegin TRY).`);
  }
}

/**
 * Tarih gercek bir takvim gunu degil.
 *
 * ⚠️ Zod yalnizca `YYYY-MM-DD` KALIBINI dogrular; `2026-02-31` o kalibi GECER.
 * Kontrol edilmeseydi deger veritabanina kadar gider, PostgreSQL onu reddeder
 * ve kullanici 422 yerine 500 alirdi.
 */
export class InvalidDocumentDateError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_DATE_INVALID';
  constructor(value: string) {
    super(`Gecersiz tarih: ${value}. Gercek bir takvim gunu bekleniyor.`);
  }
}

/**
 * Gecerlilik / vade tarihi belge tarihinden ONCE.
 *
 * ⚠️ Engellenmesinin sebebi bicimsel degil ANLAMSAL: gecerlilik tarihi gecmis
 * bir teklif, yapisal katkicinin (§4.1) "suresi dolmus" bandina DOGDUGU AN
 * duserdi — yani sistem, kullanicinin daha yazarken kaybettigi bir belge
 * uretirdi.
 */
export class DateBeforeIssueDateError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_DATE_BEFORE_ISSUE';
  constructor(field: string) {
    super(`${field} belge tarihinden once olamaz.`);
  }
}

/** Notlar ust sinirini asti — SESSIZ KIRPMA YASAK. */
export class DocumentNotesTooLongError extends InvoicingDomainError {
  readonly code = 'SALES_DOCUMENT_NOTES_TOO_LONG';
  constructor(actual: number, max: number) {
    super(`Belge notu cok uzun: ${String(actual)} karakter. En fazla ${String(max)} olabilir.`);
  }
}

export class InvoicingTimestampError extends InvoicingDomainError {
  readonly code = 'INVOICING_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}
