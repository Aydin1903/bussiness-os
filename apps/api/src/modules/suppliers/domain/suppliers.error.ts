/** Tedarikci Yonetimi domain hatalari (ADR-0040). */
export abstract class SuppliersDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Tedarikci adi bos olamaz.
 *
 * ⚠️ Ad TEKIL DEGILDIR (ADR-0040 §1.1) ama BOS da olamaz: iki ayri sube ya da
 * ayni adi tasiyan iki firma mesrudur, adsiz bir tedarikci degildir.
 */
export class BlankSupplierNameError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_NAME_BLANK';
  constructor() {
    super('Tedarikci adi bos olamaz.');
  }
}

/**
 * Tedarikci bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner ve
 * buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
 */
export class SupplierNotFoundError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_NOT_FOUND';
  constructor() {
    super('Tedarikci bulunamadi.');
  }
}

/**
 * Ayni vergi numarasi zaten kayitli (ADR-0040 §1.1).
 *
 * ============================================================================
 * ⚠️ KARSILASTIRMA KUCUK/BUYUK HARFTEN BAGIMSIZDIR
 * ============================================================================
 * `inventory.items.sku`nun `DuplicateSkuError` deseninin IKINCI uygulamasi ve
 * bedeli BU MODULDE DAHA AGIR: ayri sayilsalardi ayni tuzel kisi icin iki satir
 * acilir ve GORUSME GECMISI IKIYE BOLUNURDU. Bolunen sey yalnizca bir liste
 * degil, AI'IN HAFIZASIDIR — yani modulun var olus sebebi.
 *
 * ⚠️ 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
 * elverissizdir.
 */
export class DuplicateTaxNumberError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_TAX_NUMBER_DUPLICATE';
  constructor(taxNumber: string) {
    super(
      `Bu vergi numarasi zaten kayitli: ${taxNumber}. ` +
        'Karsilastirma buyuk/kucuk harf duyarsizdir.',
    );
  }
}

/**
 * Odeme kosullari SERT karakter sinirini asti (ADR-0040 §1.2).
 *
 * ⚠️ Sinir bir GIRDI kuralidir, bir veri butunlugu kurali degil: migration
 * yalnizca "bos olamaz" der. Odeme kosullari bir INSAN CUMLESIDIR ve bir
 * paragraf degildir; sinirsiz birakmak alani bir serbest not alanina cevirirdi
 * — oysa modulun anlatisal yuzeyi GORUSME GUNLUGUDUR.
 */
export class PaymentTermsTooLongError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_PAYMENT_TERMS_TOO_LONG';
  constructor(actual: number, max: number) {
    super(
      `Odeme kosullari cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir.`,
    );
  }
}

/** Kisi adi bos olamaz. */
export class BlankSupplierContactNameError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_CONTACT_NAME_BLANK';
  constructor() {
    super('Kisi adi bos olamaz.');
  }
}

/**
 * Kisi bulunamadi.
 *
 * ⚠️ "Yok", "baska tenant'in" ve "baska bir TEDARIKCININ kisisi" AYNI hatayi
 * verir. Ucuncusu onemli: bir gorusme, bagli oldugu tedarikcinin kisisine
 * baglanmak zorundadir (`#assertContactBelongsToSupplier`). Ayirt edilseydi
 * baska bir tedarikcide o id'nin VAR OLDUGU sizardi.
 */
export class SupplierContactNotFoundError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_CONTACT_NOT_FOUND';
  constructor() {
    super('Tedarikci kisisi bulunamadi.');
  }
}

/** Gorusme metni bos olamaz. */
export class BlankSupplierInteractionBodyError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_INTERACTION_BODY_BLANK';
  constructor() {
    super('Gorusme metni bos olamaz.');
  }
}

/**
 * Gorusme metni SERT karakter sinirini asti (ADR-0040 §2.2).
 *
 * ============================================================================
 * ⚠️ SESSIZ KIRPMA YASAK — VE BU HATANIN VAR OLMA SEBEBI BUDUR
 * ============================================================================
 * Bu modulde chunk tablosu YOKTUR: gorusme TEK BIR vektore gomulur. Sinir
 * zorlanmasaydi metin embedding modelinin girdi sinirina kadar buyur ve adapter
 * onu SESSIZCE KIRPARDI — kullanici notunun yarisinin arandigini HIC
 * OGRENEMEZDI. `ServiceNoteTooLongError` / `StockItemNoteTooLongError`in ayni
 * gerekcesi, UCUNCU kez.
 *
 * ⚠️ Mesaj DOGRU YOLU soyler: yapistirilan uzun bir e-posta zincirinin yeri bu
 * alan degil BELGE moduludur. Yalnizca "cok uzun" demek, kullaniciyi metni
 * keserek yarisini KAYBETMEYE iterdi.
 */
export class SupplierInteractionBodyTooLongError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_INTERACTION_BODY_TOO_LONG';
  constructor(actual: number, max: number) {
    super(
      `Gorusme metni cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. ` +
        'Uzun bir yazisma metnini belge olarak yuklemek daha dogrudur.',
    );
  }
}

/** Gorusme bulunamadi (yalnizca `reindex` ve vektor yazma yollarinda). */
export class SupplierInteractionNotFoundError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_INTERACTION_NOT_FOUND';
  constructor() {
    super('Gorusme kaydi bulunamadi.');
  }
}

/**
 * `occurredOn` gecerli bir takvim gunu degil.
 *
 * ⚠️ Zod yalnizca `YYYY-MM-DD` KALIBINI dogrular; `2026-02-31` o kalibi GECER.
 * Kontrol edilmeseydi deger veritabanina kadar gider, PostgreSQL onu reddeder
 * ve kullanici 422 yerine 500 alirdi (`InvalidOccurredAtError`in ayni
 * gerekcesi).
 */
export class InvalidSupplierOccurredOnError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_INTERACTION_OCCURRED_ON_INVALID';
  constructor(value: string) {
    super(`Gecersiz gorusme tarihi: ${value}. Gercek bir takvim gunu bekleniyor.`);
  }
}

/**
 * Embedding boyutu beklenenden farkli.
 *
 * `vector(1536)` kolonuyla birebir baglidir; saglayici/model degisirse bu hata
 * ONCE burada gorunur — veri yazilmadan.
 */
export class InvalidSupplierEmbeddingDimensionsError extends SuppliersDomainError {
  readonly code = 'SUPPLIER_EMBEDDING_DIMENSIONS_INVALID';
  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}

export class InvalidSuppliersTimestampError extends SuppliersDomainError {
  readonly code = 'SUPPLIERS_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}
