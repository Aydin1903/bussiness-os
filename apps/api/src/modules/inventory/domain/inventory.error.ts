/** Stok / Envanter domain hatalari (ADR-0039). */
export abstract class InventoryDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Miktar gecersiz (ADR-0039 §4.2).
 *
 * ⚠️ Mesaj KURALI soyler: kac ondalik hane kabul edildigini yazmayan bir hata,
 * kullaniciyi tahmine birakirdi. `InvalidAmountError`in ayni disiplini.
 */
export class InvalidQuantityError extends InventoryDomainError {
  readonly code = 'INVENTORY_QUANTITY_INVALID';
  constructor(value: string) {
    super(`Gecersiz miktar: ${value}. En fazla 11 tam sayi hanesi ve 3 ondalik hane olabilir.`);
  }
}

/**
 * Kalem bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner ve
 * buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
 */
export class StockItemNotFoundError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_NOT_FOUND';
  constructor() {
    super('Stok kalemi bulunamadi.');
  }
}

/**
 * Hareketi olan kalem SILINEMEZ — arsivlenir (ADR-0039 §3.4).
 *
 * ============================================================================
 * ⚠️ BU HATA §3.3'UN YARISIDIR
 * ============================================================================
 * Defter DEGISTIRILEMEZ ilan edildi; silmeye izin verilseydi bir `DELETE`
 * defterin TAMAMINI goturebilirdi. Koruma iki katmanlidir:
 *
 *   1. VERITABANI — `movements.item_id -> items.id ON DELETE RESTRICT`
 *      (SQLSTATE 23503). Uygulamayi ATLAYAN yollari da baglar.
 *   2. UYGULAMA — bu hata, FK ihlalinin ANLASILIR karsiligi.
 *
 * `CategoryInUseError` deseninin IKINCI uygulamasi. ⚠️ Farki: orada kisit bir
 * BASKA TABLONUN kullanimiydi ("bu kategori islemlerde kullaniliyor"); burada
 * kaydin KENDI GECMISI. Mesaj bu yuzden dogru yolu (arsivleme) SOYLER —
 * yalnizca "silinemez" demek, kullaniciyi hareketleri tek tek silmeye calismaya
 * iterdi ve o yol da yoktur.
 *
 * ⚠️ 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
 * elverissizdir.
 */
export class StockItemHasMovementsError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_HAS_MOVEMENTS';
  constructor() {
    super(
      'Hareketi olan bir stok kalemi silinemez; gecmisi korumak icin ARSIVLEYIN. ' +
        'Hareket defteri degistirilemez (ADR-0039 §3.3).',
    );
  }
}

/**
 * Ayni SKU zaten var (ADR-0039 §1.1).
 *
 * ⚠️ Karsilastirma KUCUK/BUYUK HARFTEN BAGIMSIZDIR: `ABC-1` ile `abc-1` AYNI
 * kalemdir. Ayri sayilsalardi stok IKIYE BOLUNURDU ve hata sessiz olurdu —
 * ekran calisir, iki satir yan yana durur.
 */
export class DuplicateSkuError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_SKU_DUPLICATE';
  constructor(sku: string) {
    super(`Bu SKU zaten kullaniliyor: ${sku}. Karsilastirma buyuk/kucuk harf duyarsizdir.`);
  }
}

/**
 * Arsivlenmis kaleme hareket yazilamaz.
 *
 * ⚠️ Neden engelleniyor: arsivleme "bu kalem artik kullanilmiyor" beyanidir ve
 * arsivlenmis kalem YAPISAL KATKICIYA GIRMEZ (§6.1). Hareket yazmaya izin
 * verilseydi stogu degisen ama hicbir uyari uretmeyen GORUNMEZ bir kalem
 * olusurdu — sessiz bir kor nokta.
 *
 * Cozum kullaniciya acikca soylenir: arsivden cikar, sonra yaz.
 */
export class StockItemArchivedError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_ARCHIVED';
  constructor() {
    super('Arsivlenmis bir kaleme hareket yazilamaz; once arsivden cikarin.');
  }
}

/**
 * Kalem notu SERT karakter sinirini asti (ADR-0039 §5).
 *
 * ============================================================================
 * ⚠️ SESSIZ KIRPMA YASAK — VE BU HATANIN VAR OLMA SEBEBI BUDUR
 * ============================================================================
 * Bu modulde chunk tablosu YOKTUR: not TEK BIR vektore gomulur. Sinir
 * zorlanmasaydi metin embedding modelinin girdi sinirina kadar buyur ve adapter
 * onu SESSIZCE KIRPARDI — kullanici notunun yarisinin arandigini HIC
 * OGRENEMEZDI. `ServiceNoteTooLongError`in ayni gerekcesi, ikinci kez.
 */
export class StockItemNoteTooLongError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_NOTE_TOO_LONG';
  constructor(actual: number, max: number) {
    super(
      `Kalem notu cok uzun: ${String(actual)} karakter. En fazla ${String(max)} karakter olabilir.`,
    );
  }
}

/**
 * Embedding boyutu beklenenden farkli.
 *
 * `vector(1536)` kolonuyla birebir baglidir; saglayici/model degisirse bu hata
 * ONCE burada gorunur — veri yazilmadan.
 */
export class InvalidStockItemEmbeddingDimensionsError extends InventoryDomainError {
  readonly code = 'STOCK_ITEM_EMBEDDING_DIMENSIONS_INVALID';
  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}

/** Gecersiz hareket yonu — sozluk kodda ve migration `0029` CHECK'inde. */
export class InvalidMovementDirectionError extends InventoryDomainError {
  readonly code = 'INVENTORY_MOVEMENT_DIRECTION_INVALID';
  constructor(direction: string) {
    super(`Gecersiz hareket yonu: ${direction}. Yalnizca 'in' veya 'out' olabilir.`);
  }
}

/**
 * `occurredAt` gecerli bir an degil.
 *
 * JavaScript'te `new Date('2026-02-31T99:00:00Z')` PATLAMAZ, `Invalid Date`
 * doner ve tipi hala `Date`tir. Kontrol edilmezse veritabanina kadar gider ve
 * kullanici 422 yerine 500 alirdi (`InvalidScheduledAtError`in ayni gerekcesi).
 */
export class InvalidOccurredAtError extends InventoryDomainError {
  readonly code = 'INVENTORY_OCCURRED_AT_INVALID';
  constructor(value: string) {
    super(`Gecersiz hareket zamani: ${value}. ISO 8601 bicimli gercek bir an bekleniyor.`);
  }
}

export class InvalidInventoryTimestampError extends InventoryDomainError {
  readonly code = 'INVENTORY_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}
