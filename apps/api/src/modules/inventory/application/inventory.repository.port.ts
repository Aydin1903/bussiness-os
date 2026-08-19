import { type StockItem, type StockItemState } from '../domain/stock-item.entity';
import { type StockMovement, type StockMovementState } from '../domain/stock-movement.entity';

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Kullaniciya donen kalem satiri — tanim + TURETILMIS miktar (ADR-0039 §2).
 *
 * ============================================================================
 * NEDEN AYRI BIR TIP: `StockItemState` MIKTAR TASIMAZ
 * ============================================================================
 * Miktar `items` tablosunda YOKTUR; `movements`tan toplanir. Entity'ye alan
 * olarak koymak, entity'nin guncel tutmak zorunda oldugu IKINCI bir dogruluk
 * kaynagi acardi — tam olarak §2'nin reddettigi sey.
 *
 * `AppointmentRow`/`TransactionEnrichedRow` ayriminin ayni sinifi, farkli
 * sebeple: orada eksik bilgi BASKA BIR SEMADAYDI, burada BASKA BIR TABLODA ve
 * TURETILIYOR.
 *
 * ⚠️ `quantity` NEGATIF OLABILIR ve bu bir hata degil bir SINYALDIR (§6.1):
 * mevcuttan fazla cikis yazmak ENGELLENMEZ (ADR-0039 §Alternatifler — engellemek
 * isletmeyi yalan soylemeye iter). Negatif miktar yapisal katkida EN YUKSEK
 * alarm seviyesinde raporlanir.
 */
export interface StockItemRow extends StockItemState {
  /** ⚠️ TURETILMIS. Kanonik dize (`"12.500"`); JS `number`ina CEVRILMEZ. */
  readonly quantity: string;
}

/**
 * Vektoru eksik, NOTU OLAN kalem — `reindex`in is listesi (ADR-0039 §6.2).
 *
 * ⚠️ IS LISTESI TURETILMISTIR: `WHERE note IS NOT NULL AND embedding IS NULL`.
 * Ayri bir "onarilacaklar" tablosu ve deneme sayaci YOKTUR — projede altinci kez
 * ayni karar.
 *
 * ⚠️ BU MODULDE ONARIMIN TEK ISI VAR ve bu bir YENILIKTIR: eksik vektoru
 * uretmek. Onceki uc modulde ikinci bir isi daha vardi — BAYAT DENORMALIZE ADI
 * tazelemek. Burada ad AYNI SATIRDA yasadigi icin yeniden adlandirma zaten
 * embedding'i yeniden uretir (§6.2) ve `reindex`e is kalmaz.
 */
export interface UnindexedStockItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly note: string;
}

/** Anlamsal arama sonucu — `inventory-notes` katkicisi icin. */
export interface SimilarStockItemNote {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly note: string;
}

/**
 * Esik altindaki / negatif kalem — yapisal katkicinin ALARM sinyali (§6.1).
 *
 * ⚠️ `minQuantity` BURADA ZORUNLU DEGIL: negatif miktarli bir kalem esigi
 * OLMASA DA alarm uretir (negatif stok FIZIKSEL OLARAK IMKANSIZDIR, yani
 * kaydin kendisi tutarsizdir).
 */
export interface LowStockItem {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly quantity: string;
  readonly minQuantity: string | null;
}

/** Yapisal katkinin donem ozeti (§6.1) — icerik SABIT ve KUCUK. */
export interface InventorySummary {
  /** Arsivlenmemis kalem sayisi. */
  readonly activeItems: number;
  /** Esigi TANIMLI olan kalem sayisi — "izleniyor" olculebilir olmali. */
  readonly trackedItems: number;
  readonly movementsIn: number;
  readonly movementsOut: number;
}

/**
 * `inventory` semasi kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0029`) ve cagiran zaten
 * tenant transaction'i icindedir. Alti onceki repository ile ayni gerekce.
 *
 * ⚠️ BU MODULDE BEDELI DAHA AGIR: miktar bir TOPLAMDIR. Elle bir `WHERE
 * tenant_id` unutulsaydi (ve RLS de olmasaydi) sonuc "eksik liste" degil
 * YANLIS BIR SAYI olurdu — iki tenant'in hareketleri toplanirdi.
 */
export interface InventoryRepository {
  // --- Kalem tanimi -------------------------------------------------------

  /**
   * Ekler ya da gunceller (tek deyimlik UPSERT).
   *
   * ⚠️ `embedding` KOLONUNA DOKUNMAZ. Vektor ayri bir metotla yazilir
   * (`setEmbedding`) cunku uretimi bir AG CAGRISI gerektirir ve o cagri
   * transaction'in DISINDA kalmak zorundadir.
   *
   * @throws DuplicateSkuError — `items_tenant_sku_unique_idx` ihlali
   *   (buyuk/kucuk harf duyarsiz, §1.1).
   */
  saveItem(item: StockItem): Promise<void>;

  findItemById(id: string): Promise<StockItem | null>;

  /**
   * ⚠️ KALEM SATIRINI KILITLER (`SELECT ... FOR UPDATE`) — ADR-0039 §3.2.
   *
   * ============================================================================
   * KALEM SATIRI, KENDI DEFTERININ KILIT CAPASIDIR
   * ============================================================================
   * Bu, projedeki TEK satir kilididir ve gerekcesi tektir: fiziksel sayim,
   * mevcut miktari OKUYUP ona gore bir duzeltme YAZAR. Arada baska bir hareket
   * yazilirsa duzeltme YANLIS MIKTARDA olur ve hata SESSIZDIR — sayim,
   * duzeltmesi gereken farki YENIDEN URETIR.
   *
   * ⚠️ KILIT ANCAK HER YAZMA YOLU ONU ALIRSA ANLAMLIDIR. `movements` uzerine
   * `INSERT` yapmak, `items` satirindaki kilidi TEK BASINA beklemez; bu yuzden
   * HAREKET YAZAN HER YOL once bu metodu cagirir. Bir yol bunu atlarsa kilit
   * DEKORATIF hale gelir ve sayim yarisi geri doner.
   *
   * Bedeli acikca: AYNI KALEME yazilan hareketler serilesir. Bu, §2'nin
   * "hareketler hic carpismaz" kazancini KISMEN geri verir — ama yalnizca ayni
   * kalem icin ve yalnizca `INSERT` suresince.
   */
  lockItemById(id: string): Promise<StockItem | null>;

  /**
   * Vektoru YAZAR ya da TEMIZLER.
   *
   * `null` = notu silinmis bir kalemin vektorunu de sil. Aksi halde silinen bir
   * notun vektoru satirda kalir ve anlamsal arama ARTIK VAR OLMAYAN bir metni
   * bulmaya devam ederdi.
   *
   * @returns yazilan satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  setEmbedding(input: { id: string; embedding: readonly number[] | null }): Promise<number>;

  findUnindexed(limit: number): Promise<UnindexedStockItem[]>;

  /**
   * Sayfali kalem listesi — MIKTAR TURETILEREK (§2).
   *
   * ⚠️ `lowStockOnly` filtresi INDEX KULLANAMAZ ve bu kayitli bir bedeldir
   * (ADR-0039 § Sonuclari): once toplanir, sonra elenir (`HAVING`). Kalem
   * sayisi hareket sayisi gibi buyumedigi icin kabul edilebilir.
   *
   * ⚠️ "Filtre yok" `null`/`false` ile ifade edilir, `undefined` ile DEGIL
   * (`exactOptionalPropertyTypes` altinda ikisi ayri tiptir).
   */
  listItems(input: {
    limit: number;
    offset: number;
    includeArchived: boolean;
    lowStockOnly: boolean;
    search: string | null;
  }): Promise<ListPage<StockItemRow>>;

  /** Tek kalem + turetilmis miktari. */
  findItemRowById(id: string): Promise<StockItemRow | null>;

  /**
   * Kalemi siler.
   *
   * ⚠️ HAREKETI VARSA VERITABANI REDDEDER (`ON DELETE RESTRICT`, SQLSTATE
   * 23503) ve repository bunu `StockItemHasMovementsError`e cevirir — §3.4'un
   * `CategoryInUseError` deseni, ikinci uygulama. Silme yalnizca HIC HAREKETI
   * OLMAYAN bir kalemde basarili olur (yanlis acilmis bir kaydi temizlemek).
   *
   * @returns silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  deleteItemById(id: string): Promise<number>;

  // --- Defter -------------------------------------------------------------

  /**
   * Hareket yazar. ⚠️ DEGISTIRME/SILME METODU YOKTUR (§3.3) — ve bu bir eksik
   * degil, portun tasidigi bir GARANTIDIR: olmayan bir metot yanlislikla
   * cagrilamaz.
   */
  insertMovement(movement: StockMovement): Promise<void>;

  /**
   * ⚠️ MEVCUT MIKTAR — TURETILIR, OKUNMAZ (ADR-0039 §2).
   *
   * `COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END), 0)`
   *
   * Toplama SQL'de yapilir; satirlari cekip JS'te toplamak binlerce hareketi
   * her okumada aga tasirdi — `summarizeByCurrency`nin ayni gerekcesi.
   *
   * ⚠️ Hicbir hareketi olmayan kalem `"0.000"` doner, `null` DEGIL: "hic hareket
   * yok" ile "toplami sifir" AYNI STOK DURUMUDUR ve cagirani iki farkli sekilde
   * ele almaya zorlamak, birini unutmaya davettir.
   */
  deriveQuantity(itemId: string): Promise<string>;

  /** Sayfali hareket defteri; `itemId` verilirse tek kaleme daralir. */
  listMovements(input: {
    limit: number;
    offset: number;
    itemId: string | null;
  }): Promise<ListPage<StockMovementState>>;

  // --- Katkicilar ---------------------------------------------------------

  /**
   * ANLAMSAL arama (`inventory-notes` katkicisi).
   *
   * ⚠️ `embedding IS NOT NULL` SUZULUR: vektoru olmayan satirlar `LIMIT`
   * yuvalarini bosa harcamasin.
   *
   * ⚠️ ARSIVLENMIS kalemler de DAHILDIR — yapisal katkicidan bilincli sapma.
   * Sebep: "gecen yil hangi tedarikciden almistik" sorusunun cevabi arsivlenmis
   * bir kalemde olabilir ve o cevap HALA DOGRUDUR. Arsivleme "artik kullanmiyorum"
   * demektir, "unut" demez.
   */
  findSimilarNotes(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarStockItemNote[]>;

  /**
   * Esik altindaki ve/veya NEGATIF kalemler (`inventory-stock` katkicisi).
   *
   * ⚠️ ARSIVLENMIS kalemler HARIC (§3.4): arsivlenmis bir kalemin stogunun
   * azalmasi HABER DEGILDIR.
   *
   * @param nearRatio esige YAKIN sayilma carpani (ornegin `1.25`); yalnizca
   *   esigi TANIMLI kalemler icin anlamlidir.
   */
  findLowStock(input: { nearRatio: number; limit: number }): Promise<LowStockItem[]>;

  /** Donem ozeti — toplama SQL'de (§6.1). */
  summarize(input: { from: Date; to: Date }): Promise<InventorySummary>;
}
