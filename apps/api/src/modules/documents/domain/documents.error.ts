/** Belge domain hatalari (ADR-0037). */
export abstract class DocumentsDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Kayit bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS, baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner
 * ve buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini,
 * `AppointmentNotFoundError` / `TransactionNotFoundError` ile ayni gerekce).
 */
export class DocumentNotFoundError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_NOT_FOUND';
  constructor() {
    super('Belge bulunamadi.');
  }
}

/**
 * Dosya turu desteklenmiyor (ADR-0037 §6.1).
 *
 * ============================================================================
 * ⚠️ NEDEN ALLOWLIST — "her seyi kabul et, sadece PDF/DOCX'i indeksle" DEGIL
 * ============================================================================
 * Ikinci secenek daha ESNEK gorunur ve SESSIZCE YANLISTIR: bir xlsx yukleyen
 * kullanici, dosyasinin arama disinda kaldigini HICBIR YERDEN ogrenemez —
 * ekranda digerleriyle ayni gorunur, aylar sonra aradiginda bulamaz ve sebebini
 * asla anlamaz.
 *
 * Ayrica her yeni tur YENI BIR AYRISTIRICI BAGIMLILIGI demektir ve ofis
 * formatlarinin ayristiricilari bilinen bir saldiri yuzeyidir.
 *
 * ⚠️ 415, 422 DEGIL: istek govdesi SEKIL olarak dogru, MEDYA TURU
 * desteklenmiyor — HTTP'nin bu durum icin ayri bir kodu var ve onu kullanmak,
 * istemciye "govdeni duzelt" degil "baska bir dosya sec" der.
 */
export class UnsupportedDocumentTypeError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_TYPE_UNSUPPORTED';
  constructor() {
    super('Yalnizca PDF ve DOCX dosyalari kabul edilir.');
  }
}

/**
 * Dosya cok buyuk (ADR-0037 §6.1).
 *
 * ⚠️ Bu bir R2 siniri DEGIL, SUNUCU BELLEGI siniridir: dosya, MIME tespiti ve
 * metin cikarimi icin bellege alinir.
 *
 * ⚠️ Mesaj GERCEK ve IZIN VERILEN boyutu birlikte soyler — yalnizca "cok buyuk"
 * demek, kullaniciyi ne kadar kucultecegini tahmin etmeye birakirdi
 * (`ServiceNoteTooLongError`in ayni disiplini).
 */
export class DocumentTooLargeError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_TOO_LARGE';
  constructor(actualBytes: number, maxBytes: number) {
    super(
      `Dosya cok buyuk: ${formatMegabytes(actualBytes)} MB. ` +
        `En fazla ${formatMegabytes(maxBytes)} MB olabilir.`,
    );
  }
}

/**
 * Belge cok fazla parca uretiyor (ADR-0037 §6.1).
 *
 * ============================================================================
 * ⚠️ ASIL MALIYET FRENI — VE REDDEDILEN DOSYA DEPOYA HIC GIRMEZ
 * ============================================================================
 * Sinirsiz birakmak, tek bir yuklemenin dakikalarca suren ve SINIRSIZ maliyet
 * ureten bir istege donusmesi demekti (her parca bir embedding cagrisidir).
 *
 * Dogrulama, ADR-0037 §5.3'un sirasi geregi YUKLEMEDEN ONCE yapilir: metin
 * cikarimi istegin govdesinde, bellekte gerceklesir. Bu yuzden reddedilen bir
 * dosya R2'ye HIC YAZILMAZ ve ortada temizlenecek bir yetim nesne kalmaz.
 *
 * ⚠️ SESSIZ KIRPMA YASAK: ilk 300 parcayi alip gerisini atmak, kullaniciya
 * sozlesmesinin YARISININ arandigini hic soylemezdi.
 */
export class DocumentTooManyChunksError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_TOO_MANY_CHUNKS';
  constructor(actual: number, max: number) {
    super(
      `Belge cok uzun: ${String(actual)} parca uretiyor, en fazla ${String(max)} olabilir. ` +
        'Belgeyi bolerek yukleyin.',
    );
  }
}

/**
 * Embedding boyutu beklenenden farkli.
 *
 * `vector(1536)` kolonuyla birebir baglidir; saglayici/model degisirse bu hata
 * ONCE burada gorunur — veri yazilmadan. `NoteChunk` / `CommentaryChunk` ile
 * ayni disiplin.
 */
export class InvalidDocumentEmbeddingDimensionsError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_EMBEDDING_DIMENSIONS_INVALID';
  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}

/**
 * Belge, gorulemeyen bir KISIYE baglanamaz (ADR-0037 §4).
 *
 * ============================================================================
 * UC DURUM AYIRT EDILMEZ — bilincli
 * ============================================================================
 * "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" AYNI hatayi
 * verir; `ContactDirectory` ucunu de haritada YOK olarak dondurur. Ayirmak,
 * reddin sebebinden o kisinin VAR OLDUGUNU cikarilabilmesi demekti.
 *
 * ⚠️ 404, 422 DEGIL: govdedeki bir ALAN var olmayan bir KAYNAGA isaret ediyor.
 */
export class DocumentContactNotFoundError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_CONTACT_NOT_FOUND';
  constructor() {
    super('Belgenin baglanacagi kisi bulunamadi.');
  }
}

/**
 * Belge, gorulemeyen bir PROJEYE baglanamaz (ADR-0037 §4).
 *
 * ⚠️ `DocumentContactNotFoundError`DAN AYRI BIR TIP ve bu bilincli: iki
 * referans BAGIMSIZDIR (biri, ikisi ya da hicbiri) ve tek bir hata tipi,
 * kullaniciya HANGI alanin sorunlu oldugunu soylemezdi. Ikisini birden
 * gonderen bir istekte "bulunamadi" mesaji tek basina ise yaramazdi.
 */
export class DocumentProjectNotFoundError extends DocumentsDomainError {
  readonly code = 'DOCUMENT_PROJECT_NOT_FOUND';
  constructor() {
    super('Belgenin baglanacagi proje bulunamadi.');
  }
}

export class InvalidDocumentsTimestampError extends DocumentsDomainError {
  readonly code = 'DOCUMENTS_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}

/** Bayti MB'ye cevirir; mesajda okunabilir tek ondalik. */
function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}
