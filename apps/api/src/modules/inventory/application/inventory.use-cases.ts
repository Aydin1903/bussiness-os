import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { INVENTORY_EMBEDDING_ACTION } from '../inventory.rate-limits';
import { StockItemArchivedError, StockItemNotFoundError } from '../domain/inventory.error';
import { subtractQuantity } from '../domain/quantity';
import {
  StockItem,
  assertEmbeddingDimensions,
  withStockItemHeader,
  type StockItemFields,
  type StockItemPatch,
  type StockItemState,
} from '../domain/stock-item.entity';
import {
  StockMovement,
  directionFromDelta,
  type MovementDirection,
  type StockMovementState,
} from '../domain/stock-movement.entity';
import {
  type InventoryRepository,
  type ListPage,
  type StockItemRow,
} from './inventory.repository.port';

/**
 * Stok / Envanter yasam dongusu (ADR-0039 §2, §3).
 *
 * ============================================================================
 * ⚠️ BU MODULDE MIKTAR HICBIR YERDE YAZILMAZ — YALNIZCA OKUNUR
 * ============================================================================
 * ADR-0039 §2'nin dogrudan sonucu ve bu dosyanin en onemli ozelligi: hicbir use
 * case bir "miktar" alanini guncellemez. Miktari degistirmenin TEK yolu bir
 * HAREKET yazmaktir; okumanin tek yolu `deriveQuantity`dir.
 *
 * Bir miktar kolonu olsaydi burada `item.setQuantity(...)` gibi bir satir olurdu
 * ve onu unutan HER yeni yazma yolu sessizce yanlis bir sayi uretirdi.
 *
 * ============================================================================
 * ⚠️ CROSS-MODUL BAGIMLILIK YOK — CRM'DEN BU YANA ILK KEZ
 * ============================================================================
 * Bu dosya hicbir baska is modulunu import ETMEZ (ADR-0039 §9). Projeler,
 * Finans, Randevu ve Belge'nin hepsinde bir `*Directory` bagimliligi vardi;
 * burada YOK. Bagimlilik grafigi ALTI KENARDA kaliyor ve Stok, cikan kenari
 * OLMAYAN bir dugum (CRM ile ayni katman).
 *
 * ⚠️ 7. modul (Tedarikci) bir kaleme isaret etmek istedigi gun
 * `inventory.public.ts`i YAZAN modul BU MODULDUR (ADR-0039 §9.1) — talip degil
 * SAHIP yazar.
 */
export interface InventoryDependencies {
  readonly repository: InventoryRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik EMBEDDING payi — kalem payi DEGIL. Config'ten gelir. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA kalem. */
  readonly reindexBatchSize: number;
}

export class InventoryUseCases {
  constructor(private readonly deps: InventoryDependencies) {}

  // ==========================================================================
  // Kalem tanimi
  // ==========================================================================

  async createItem(input: {
    tenantId: string;
    userId: string;
    fields: StockItemFields;
  }): Promise<StockItemState> {
    // Entity ONCE kurulur: ad/birim/esik/not dogrulamasi bir veritabani sorgusu
    // ACMADAN once patlar.
    const item = StockItem.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    const state = item.toState();

    // --- T0: oran siniri — YALNIZCA NOT VARSA ------------------------------
    // ⚠️ NOTSUZ KALEM HICBIR SEY HARCAMAZ, dolayisiyla SAYILMAZ. Bu satirin
    // kosulsuz olmasi sayaci "kalem sayaci"na cevirirdi ve kullanici hic
    // embedding uretmeden kotasini tuketirdi.
    if (state.note !== null) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    // --- T1: kalem ---------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveItem(item),
    );

    // --- Ag + T2: vektor ---------------------------------------------------
    await this.#reembed(state);

    return state;
  }

  async listItems(input: {
    limit: number;
    offset: number;
    includeArchived: boolean;
    lowStockOnly: boolean;
    search: string | null;
  }): Promise<ListPage<StockItemRow>> {
    // ⚠️ Miktar BURADA TURETILIR (repository icinde, SQL'de). Bu, modulun EN
    // SICAK yoludur ve olcumu kapanis denetiminde ZORUNLU bir maddedir
    // (ADR-0039 §2.3).
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listItems(input),
    );
  }

  async getItem(id: string): Promise<StockItemRow> {
    const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findItemRowById(id),
    );

    if (row === null) {
      throw new StockItemNotFoundError();
    }

    return row;
  }

  /**
   * KISMI guncelleme — arsivleme/arsivden cikarma DA buradan gecer.
   *
   * ============================================================================
   * ⚠️ AD YA DA SKU DEGISTIYSE EMBEDDING YENIDEN URETILIR (ADR-0039 §6.2)
   * ============================================================================
   * Bu, projede ILK KEZ "bayatlama penceresi"nin KAPALI oldugu yerdir. Onceki
   * dort modulde baslikta denormalize edilen ad BASKA BIR SATIRDA yasiyordu ve
   * yeniden adlandirma vektoru bayatlatiyordu; telafi `reindex`e kaliyordu.
   *
   * Burada ad AYNI SATIRIN kolonu, yani yeniden adlandirma ZATEN BU `PATCH`.
   * `identityDiffers` bunu gorur ve embedding ayni islemde yeniden uretilir.
   *
   * ⚠️ DORT AYRI DURUM ve dordu de FARKLI davranir:
   *   not degismedi + kimlik degismedi -> vektore DOKUNULMAZ, pay odenmez
   *   not degisti (dolu)               -> pay odenir, vektor YENIDEN URETILIR
   *   not ayni ama AD/SKU degisti      -> pay odenir, vektor YENIDEN URETILIR
   *   not silindi (`null`)             -> pay ODENMEZ (ag cagrisi yok), vektor SILINIR
   */
  async updateItem(input: {
    id: string;
    tenantId: string;
    userId: string;
    changes: StockItemPatch;
  }): Promise<StockItemState> {
    // ⚠️ Oran siniri, embedding GERCEKTEN uretilecekse odenir — ve bunu bilmek
    // icin mevcut kaydi OKUMAK gerekir. Okuma ucuzdur; embedding degildir.
    const before = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findItemById(input.id),
    );

    if (before === null) {
      throw new StockItemNotFoundError();
    }

    const updated = before.update(input.changes, this.deps.clock.now());
    const next = updated.toState();
    const previous = before.toState();

    const noteChanged = next.note !== previous.note;
    const identityChanged = updated.identityDiffers(before);

    // Vektor yeniden uretilmeli mi? Not doluysa VE (not degistiyse ya da
    // baslikta gorunen kimlik degistiyse).
    const mustReembed = next.note !== null && (noteChanged || identityChanged);
    const mustClearEmbedding = noteChanged && next.note === null;

    if (mustReembed) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.repository.saveItem(updated);

      // Not SILINDIYSE vektor AYNI transaction'da temizlenir — ag cagrisi
      // gerekmedigi icin burada atomiklik BEDAVA. Aksi halde silinen bir notun
      // vektoru satirda kalir ve arama ARTIK VAR OLMAYAN metni bulur.
      if (mustClearEmbedding) {
        await this.deps.repository.setEmbedding({ id: next.id, embedding: null });
      }
    });

    if (mustReembed) {
      await this.#reembed(next);
    }

    return next;
  }

  /**
   * SERT silme — YALNIZCA hicbir hareketi olmayan kalem icin (ADR-0039 §3.4).
   *
   * ⚠️ Hareketi varsa VERITABANI reddeder (`ON DELETE RESTRICT`) ve repository
   * bunu `StockItemHasMovementsError`e cevirir; filtre 409'a tasir. Burada bir
   * on kontrol (`SELECT count(*) FROM movements`) YAZILMADI ve bu bilincli: on
   * kontrol ile silme arasinda bir hareket yazilabilirdi ve kontrol YANILIRDI.
   * Veritabani kisiti yarisamaz.
   */
  async deleteItem(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteItemById(id),
    );

    if (deleted === 0) {
      throw new StockItemNotFoundError();
    }
  }

  /**
   * Vektoru eksik NOTLU kalemleri onarir (ADR-0039 §6.2).
   *
   * Is listesi TURETILMISTIR (`note IS NOT NULL AND embedding IS NULL`); ayri
   * bir "onarilacaklar" tablosu ve deneme sayaci YOKTUR.
   *
   * ⚠️ BU MODULDE ONARIMIN TEK ISI VAR — onceki uc modulde IKI vardi. Ikincisi
   * (bayat denormalize adi tazelemek) burada GEREKMEZ cunku ad ayni satirda
   * yasar ve `updateItem` onu zaten tazeler.
   */
  async reindex(input: { tenantId: string; userId: string }): Promise<{
    repaired: number;
    failed: number;
  }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her kalem AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        await this.#reembed(item);
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  // ==========================================================================
  // Defter
  // ==========================================================================

  /**
   * Hareket yazar (ADR-0039 §3).
   *
   * ============================================================================
   * ⚠️ KALEM SATIRI KILITLENIR — VE BU DEKORATIF DEGILDIR
   * ============================================================================
   * `lockItemById` burada da cagrilir, yalnizca sayimda degil. Sebep §3.2'de
   * yazili: kilit ANCAK HER YAZMA YOLU ONU ALIRSA anlamlidir. Bu yol kilidi
   * atlasaydi, es zamanli bir sayim mevcut miktari okurken buraya bir hareket
   * girebilir ve sayimin hesapladigi delta YANLIS olurdu.
   *
   * Kilidin ikinci isi zaten gerekli olan kontroldur: kalem var mi, arsivlenmis
   * mi. Yani ek bir sorgu maliyeti YOKTUR — var olan `SELECT`e `FOR UPDATE`
   * eklenmistir.
   */
  async recordMovement(input: {
    tenantId: string;
    userId: string;
    itemId: string;
    direction: MovementDirection;
    quantity: string;
    occurredAt: Date;
    note: string | null;
  }): Promise<StockMovementState> {
    const movement = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const item = await this.deps.repository.lockItemById(input.itemId);
      this.#assertWritable(item);

      const created = StockMovement.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        createdByUserId: input.userId,
        fields: {
          itemId: input.itemId,
          direction: input.direction,
          quantity: input.quantity,
          // ⚠️ Elle yazilan bir hareket ASLA duzeltme sayilmaz: `is_correction`
          // yalnizca FIZIKSEL SAYIMDAN dogar (§3.1). Istemcinin bu bayragi
          // gondermesine izin verilseydi "fire" toplami anlamini yitirirdi.
          isCorrection: false,
          occurredAt: input.occurredAt,
          note: input.note,
        },
        now: this.deps.clock.now(),
      });

      await this.deps.repository.insertMovement(created);
      return created;
    });

    return movement.toState();
  }

  /**
   * FIZIKSEL SAYIM — kullanici SAYDIGINI yazar, delta'yi SUNUCU hesaplar
   * (ADR-0039 §3.2).
   *
   * ============================================================================
   * ⚠️ DELTA'YI ISTEMCIYE HESAPLATMAK YASAK
   * ============================================================================
   * Istemci mevcut miktari BIR ONCEKI istekte okumustur; arada baska bir hareket
   * yazildiysa duzeltme YANLIS MIKTARDA olur ve hata SESSIZDIR — sayim,
   * duzeltmesi gereken farki YENIDEN URETIR.
   *
   * Uc adim TEK TRANSACTION'da ve KILIT ALTINDA:
   *   1. kalem satirini kilitle (`FOR UPDATE`),
   *   2. mevcut miktari TURET,
   *   3. `delta = sayilan - mevcut` -> yon + pozitif miktar.
   *
   * ⚠️ `delta === 0` ISE HICBIR SATIR YAZILMAZ. `quantity > 0` kisiti sifirlik
   * bir hareketi zaten reddeder; ayrica "akis olmadi" bilgisini bir akis
   * satirina yazmak YALAN olurdu. Bedeli kayitlidir (ADR-0039 § Bilinen
   * sinirlar): "sayim yapildi ve tuttu" bilgisi hicbir yerde kalmaz.
   */
  async recordCount(input: {
    tenantId: string;
    userId: string;
    itemId: string;
    countedQuantity: string;
    note: string | null;
  }): Promise<{ adjusted: boolean; quantity: string; movement: StockMovementState | null }> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const item = await this.deps.repository.lockItemById(input.itemId);
      this.#assertWritable(item);

      const current = await this.deps.repository.deriveQuantity(input.itemId);
      const delta = subtractQuantity(input.countedQuantity, current);
      const resolved = directionFromDelta(delta);

      if (resolved === null) {
        // Sayim TUTTU. Hicbir sey yazilmaz; cevap bunu ACIKCA soyler ki istemci
        // "islem basarisiz oldu" sanmasin.
        return { adjusted: false, quantity: current, movement: null };
      }

      const movement = StockMovement.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        createdByUserId: input.userId,
        fields: {
          itemId: input.itemId,
          direction: resolved.direction,
          quantity: resolved.quantity,
          // ⚠️ SAYIMDAN DOGAN TEK YOL BUDUR. `is_correction`i `true` yapan baska
          // hicbir yol yoktur ve olmamalidir — aksi halde "fire" toplami
          // kullanicinin isaretledigi keyfi satirlarin toplamina donerdi.
          isCorrection: true,
          // ⚠️ Sayimin ani SUNUCU saatidir, istemciden GELMEZ: sayim "simdi"
          // yapilan bir olcumdur ve gecmise tarihlenmis bir sayim, aradaki
          // hareketlerle birlikte anlamsizdir.
          occurredAt: this.deps.clock.now(),
          note: input.note,
        },
        now: this.deps.clock.now(),
      });

      await this.deps.repository.insertMovement(movement);

      return {
        adjusted: true,
        // Sayim sonrasi miktar TANIM GEREGI sayilan miktardir; yeniden
        // turetmek ayni sonucu verir ve fazladan bir sorgu olurdu.
        quantity: input.countedQuantity,
        movement: movement.toState(),
      };
    });
  }

  async listMovements(input: {
    limit: number;
    offset: number;
    itemId: string | null;
  }): Promise<ListPage<StockMovementState>> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listMovements(input),
    );
  }

  // ==========================================================================
  // Ortak
  // ==========================================================================

  /**
   * Kalem var mi ve YAZILABILIR mi.
   *
   * ⚠️ Arsivlenmis kaleme hareket yazmak ENGELLENIR (§3.4): arsivlenmis kalem
   * yapisal katkiciya girmez, yani stogu degisen ama hicbir uyari uretmeyen
   * GORUNMEZ bir kalem olusurdu — sessiz bir kor nokta.
   */
  #assertWritable(item: StockItem | null): asserts item is StockItem {
    if (item === null) {
      throw new StockItemNotFoundError();
    }
    if (item.isArchived()) {
      throw new StockItemArchivedError();
    }
  }

  /**
   * T0 — pahali is BASLAMADAN once payi oder, gerekirse reddeder.
   *
   * ⚠️ CAGRILDIGI YERLER SECICIDIR: yalnizca GERCEKTEN embedding uretilecek
   * yollarda. Notsuz kalem, not/ad degistirmeyen bir `PATCH` ve notu SILEN bir
   * `PATCH` (ag cagrisi yok) paydan DUSMEZ.
   *
   * ⚠️ HAREKET YAZMAK HIC DUSMEZ ve bu modulun en sik islemi odur — sayac
   * adinin `create_movement` degil `inventory_embedding` olmasinin sebebi budur
   * (`inventory.rate-limits.ts`).
   */
  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: INVENTORY_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  /**
   * Baglam basligini kurar, gomer ve vektoru YAZAR.
   *
   * ============================================================================
   * ⚠️ AG CAGRISI TRANSACTION'IN DISINDA
   * ============================================================================
   * Projede altinci kez ayni kural: pahali cagrilar transaction DISINDA kalir
   * (`enforce-rate-limit.ts`, ADR-0029 §4). Bir OpenAI cagrisi boyunca havuzdan
   * baglanti tutmak, yuk altinda havuzu tuketir.
   *
   * ⚠️ BEDELI ACIKCA: T1 ile T2 arasinda kisa bir pencere vardir; embedding
   * cokerse ortaya NOTU OLAN ama VEKTORU OLMAYAN bir kayit cikar. Hata YUZEYE
   * CIKAR (502, `DisclosableProblem`) ve kalem SILINMEZ; onarim ucu ILK GUNDEN
   * vardir.
   */
  async #reembed(input: {
    id: string;
    name: string;
    sku: string | null;
    note: string | null;
  }): Promise<void> {
    if (input.note === null) {
      return;
    }

    const content = withStockItemHeader({
      name: input.name,
      sku: input.sku,
      note: input.note,
    });

    const embedding = await this.#embed(content);
    // Boyut SINIRDA dogrulanir: yanlis yapilandirilmis bir model VERI
    // YAZILMADAN yakalanir.
    assertEmbeddingDimensions(embedding);

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.setEmbedding({ id: input.id, embedding }),
    );
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}
