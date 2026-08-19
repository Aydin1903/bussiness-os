import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { StockItemArchivedError, StockItemNotFoundError } from '../domain/inventory.error';
import { StockItem, type StockItemFields } from '../domain/stock-item.entity';
import { type InventoryRepository, type UnindexedStockItem } from './inventory.repository.port';
import { InventoryUseCases } from './inventory.use-cases';

/**
 * `InventoryUseCases`.
 *
 * CRUD'un kendisi onceki bes modulde kanitlandi; buradaki testler bu modulun
 * KENDINE OZGU iddialarina odaklanir:
 *
 *   1. ⚠️ MIKTAR HICBIR YERDE YAZILMAZ (ADR-0039 §2) — miktari degistirmenin
 *      tek yolu bir HAREKET yazmaktir,
 *   2. ⚠️ HAREKET YAZAN HER YOL KALEM SATIRINI KILITLER (§3.2) — kilit ancak
 *      her yol onu alirsa anlamlidir; biri atlarsa DEKORATIF hale gelir,
 *   3. ⚠️ FIZIKSEL SAYIM delta'yi SUNUCUDA hesaplar ve fark sifirsa HICBIR
 *      SATIR YAZMAZ,
 *   4. ⚠️ AD/SKU degisimi de embedding'i yeniden uretir (§6.2) — "bayatlama
 *      penceresi yok" iddiasinin tasiyicisi,
 *   5. hareket yazmak oran siniri payi ODEMEZ (§5 — sayac embedding sayar).
 */

const NOW = new Date('2026-08-19T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const ITEM = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const RATE_LIMIT = 5;
/** `EMBEDDING_DIMENSIONS` uzunlugunda gecerli bir vektor. */
const VECTOR = Array.from({ length: 1536 }, () => 0.1);

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function fields(overrides: Partial<StockItemFields> = {}): StockItemFields {
  return {
    name: 'Vida M8',
    sku: 'VDA-M8',
    unit: 'adet',
    minQuantity: '20',
    note: null,
    archivedAt: null,
    ...overrides,
  };
}

function existing(overrides: Partial<StockItemFields> = {}): StockItem {
  return StockItem.create({
    id: ITEM,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

function build(
  overrides: {
    found?: StockItem | null;
    locked?: StockItem | null;
    quantity?: string;
    deleted?: number;
    unindexed?: UnindexedStockItem[];
    rateLimitCount?: number;
    embedFails?: boolean;
  } = {},
) {
  const saveItem = vi.fn<InventoryRepository['saveItem']>().mockResolvedValue(undefined);
  const findItemById = vi
    .fn<InventoryRepository['findItemById']>()
    .mockResolvedValue(overrides.found === undefined ? existing() : overrides.found);
  const lockItemById = vi
    .fn<InventoryRepository['lockItemById']>()
    .mockResolvedValue(overrides.locked === undefined ? existing() : overrides.locked);
  const deriveQuantity = vi
    .fn<InventoryRepository['deriveQuantity']>()
    .mockResolvedValue(overrides.quantity ?? '12.000');
  const insertMovement = vi
    .fn<InventoryRepository['insertMovement']>()
    .mockResolvedValue(undefined);
  const setEmbedding = vi.fn<InventoryRepository['setEmbedding']>().mockResolvedValue(1);
  const findUnindexed = vi
    .fn<InventoryRepository['findUnindexed']>()
    .mockResolvedValue(overrides.unindexed ?? []);
  const deleteItemById = vi
    .fn<InventoryRepository['deleteItemById']>()
    .mockResolvedValue(overrides.deleted ?? 1);

  const repository = {
    saveItem,
    findItemById,
    lockItemById,
    deriveQuantity,
    insertMovement,
    setEmbedding,
    findUnindexed,
    deleteItemById,
    findItemRowById: vi.fn(),
    listItems: vi.fn(),
    listMovements: vi.fn(),
    findSimilarNotes: vi.fn(),
    findLowStock: vi.fn(),
    summarize: vi.fn(),
  } as unknown as InventoryRepository;

  // ⚠️ `registerRequest` sayaci ARTIRIR ve ARTMIS degeri doner (ilk istekte 1).
  // Limitin USTUNDE bir deger dondurmek 429 uretir.
  const registerRequest = vi
    .fn<RateLimitRepository['registerRequest']>()
    .mockResolvedValue((overrides.rateLimitCount ?? 0) + 1);
  const rateLimitRepository = { registerRequest } as unknown as RateLimitRepository;

  const embed = vi
    .fn<EmbeddingPort['embed']>()
    .mockImplementation(() =>
      overrides.embedFails === true
        ? Promise.reject(new Error('saglayici coktu'))
        : Promise.resolve(VECTOR),
    );
  const embeddingPort = { embed } as unknown as EmbeddingPort;

  const useCases = new InventoryUseCases({
    repository,
    rateLimitRepository,
    embeddingPort,
    transactionManager,
    idGenerator,
    clock,
    rateLimit: RATE_LIMIT,
    reindexBatchSize: 10,
  });

  return {
    useCases,
    saveItem,
    findItemById,
    lockItemById,
    deriveQuantity,
    insertMovement,
    setEmbedding,
    deleteItemById,
    registerRequest,
    embed,
  };
}

describe('InventoryUseCases (ADR-0039)', () => {
  describe('⚠️ MIKTAR HICBIR YERDE YAZILMAZ (§2)', () => {
    it('kalem olustururken repository ye miktar GECMEZ', async () => {
      const { useCases, saveItem } = build();

      await useCases.createItem({ tenantId: TENANT, userId: USER, fields: fields() });

      const [saved] = saveItem.mock.calls[0] ?? [];
      expect(saved?.toState()).not.toHaveProperty('quantity');
    });

    it('kalem guncellerken de miktara DOKUNMAZ', async () => {
      const { useCases, saveItem } = build();

      await useCases.updateItem({
        id: ITEM,
        tenantId: TENANT,
        userId: USER,
        changes: { name: 'Yeni ad' },
      });

      const [saved] = saveItem.mock.calls[0] ?? [];
      expect(saved?.toState()).not.toHaveProperty('quantity');
    });
  });

  describe('⚠️ HAREKET YAZAN HER YOL KALEM SATIRINI KILITLER (§3.2)', () => {
    it('`recordMovement` once `lockItemById` cagirir', async () => {
      // ⚠️ BU TESTIN GEREKCESI: `movements` uzerine `INSERT` yapmak, `items`
      // satirindaki kilidi TEK BASINA beklemez. Bu yol kilidi atlasaydi, es
      // zamanli bir sayim mevcut miktari okurken buraya bir hareket girebilir
      // ve sayimin hesapladigi delta YANLIS olurdu — kilit DEKORATIF olurdu.
      const { useCases, lockItemById, insertMovement } = build();

      await useCases.recordMovement({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        direction: 'in',
        quantity: '5',
        occurredAt: NOW,
        note: null,
      });

      expect(lockItemById).toHaveBeenCalledWith(ITEM);
      expect(lockItemById.mock.invocationCallOrder[0]).toBeLessThan(
        insertMovement.mock.invocationCallOrder[0] ?? Infinity,
      );
    });

    it('`recordCount` de once KILITLER, sonra TURETIR', async () => {
      const { useCases, lockItemById, deriveQuantity } = build({ quantity: '12.000' });

      await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '15',
        note: null,
      });

      expect(lockItemById.mock.invocationCallOrder[0]).toBeLessThan(
        deriveQuantity.mock.invocationCallOrder[0] ?? Infinity,
      );
    });

    it('kalem YOKSA hareket yazilmaz — 404', async () => {
      const { useCases, insertMovement } = build({ locked: null });

      await expect(
        useCases.recordMovement({
          tenantId: TENANT,
          userId: USER,
          itemId: ITEM,
          direction: 'in',
          quantity: '5',
          occurredAt: NOW,
          note: null,
        }),
      ).rejects.toThrow(StockItemNotFoundError);

      expect(insertMovement).not.toHaveBeenCalled();
    });

    it('⚠️ ARSIVLENMIS kaleme hareket yazilamaz — GORUNMEZ kalem olusurdu', async () => {
      // Arsivlenmis kalem yapisal katkiciya GIRMEZ (§6.1); hareket yazmaya izin
      // verilseydi stogu degisen ama hicbir uyari uretmeyen bir kor nokta
      // olusurdu.
      const { useCases, insertMovement } = build({ locked: existing({ archivedAt: NOW }) });

      await expect(
        useCases.recordMovement({
          tenantId: TENANT,
          userId: USER,
          itemId: ITEM,
          direction: 'out',
          quantity: '5',
          occurredAt: NOW,
          note: null,
        }),
      ).rejects.toThrow(StockItemArchivedError);

      expect(insertMovement).not.toHaveBeenCalled();
    });

    it('⚠️ MEVCUTTAN FAZLA CIKIS ENGELLENMEZ — negatif stok bir SINYALDIR', async () => {
      // ADR-0039 §Alternatifler: engellemek isletmeyi YALAN SOYLEMEYE iter
      // (satis kaydini girip irsaliyeyi bekleyen kullanici). v1 KAYIT TUTAR,
      // KURAL KOYMAZ; negatiflik yapisal katkida 0.95 ile raporlanir.
      const { useCases, insertMovement } = build({ quantity: '2.000' });

      await expect(
        useCases.recordMovement({
          tenantId: TENANT,
          userId: USER,
          itemId: ITEM,
          direction: 'out',
          quantity: '100',
          occurredAt: NOW,
          note: null,
        }),
      ).resolves.toBeDefined();

      expect(insertMovement).toHaveBeenCalledTimes(1);
    });

    it('elle yazilan hareket ASLA duzeltme sayilmaz', async () => {
      // ⚠️ `is_correction` yalnizca FIZIKSEL SAYIMDAN dogar. Istemcinin bu
      // bayragi gondermesine izin verilseydi "fire" toplami, kullanicinin
      // isaretledigi KEYFI satirlarin toplamina donerdi.
      const { useCases, insertMovement } = build();

      await useCases.recordMovement({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        direction: 'in',
        quantity: '5',
        occurredAt: NOW,
        note: null,
      });

      const [movement] = insertMovement.mock.calls[0] ?? [];
      expect(movement?.toState().isCorrection).toBe(false);
    });
  });

  describe('⚠️ FIZIKSEL SAYIM — delta SUNUCUDA hesaplanir (§3.2)', () => {
    it('sayilan > mevcut -> GIRIS duzeltmesi', async () => {
      const { useCases, insertMovement } = build({ quantity: '12.000' });

      const result = await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '15',
        note: null,
      });

      expect(result.adjusted).toBe(true);
      const [movement] = insertMovement.mock.calls[0] ?? [];
      expect(movement?.toState()).toMatchObject({
        direction: 'in',
        quantity: '3.000',
        isCorrection: true,
      });
    });

    it('sayilan < mevcut -> CIKIS duzeltmesi', async () => {
      const { useCases, insertMovement } = build({ quantity: '12.000' });

      await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '9',
        note: null,
      });

      const [movement] = insertMovement.mock.calls[0] ?? [];
      expect(movement?.toState()).toMatchObject({
        direction: 'out',
        quantity: '3.000',
        isCorrection: true,
      });
    });

    it('⚠️ SAYIM TUTTUYSA HICBIR SATIR YAZILMAZ', async () => {
      // Olmamis bir akisi deftere yazmak YALAN olurdu; ayrica `quantity > 0`
      // kisiti sifirlik bir hareketi zaten reddederdi.
      const { useCases, insertMovement } = build({ quantity: '12.000' });

      const result = await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '12.000',
        note: null,
      });

      expect(result).toMatchObject({ adjusted: false, quantity: '12.000', movement: null });
      expect(insertMovement).not.toHaveBeenCalled();
    });

    it('NEGATIF stok sayimla duzeltilebilir', async () => {
      const { useCases, insertMovement } = build({ quantity: '-5.000' });

      await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '3',
        note: 'fiziksel sayim',
      });

      const [movement] = insertMovement.mock.calls[0] ?? [];
      expect(movement?.toState()).toMatchObject({ direction: 'in', quantity: '8.000' });
    });

    it('sayim ani SUNUCU saatidir — istemciden gelmez', async () => {
      const { useCases, insertMovement } = build({ quantity: '10.000' });

      await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '11',
        note: null,
      });

      const [movement] = insertMovement.mock.calls[0] ?? [];
      expect(movement?.toState().occurredAt).toEqual(NOW);
    });
  });

  describe('embedding yollari (§5, §6.2)', () => {
    it('NOTSUZ kalem embedding URETMEZ ve pay ODEMEZ', async () => {
      const { useCases, embed, registerRequest } = build();

      await useCases.createItem({ tenantId: TENANT, userId: USER, fields: fields() });

      expect(embed).not.toHaveBeenCalled();
      expect(registerRequest).not.toHaveBeenCalled();
    });

    it('NOTLU kalem embedding uretir ve BASLIKLA gomer', async () => {
      const { useCases, embed } = build();

      await useCases.createItem({
        tenantId: TENANT,
        userId: USER,
        fields: fields({ note: 'parti no 2026-04' }),
      });

      expect(embed).toHaveBeenCalledWith('[Stok · VDA-M8 · Vida M8] parti no 2026-04');
    });

    it('⚠️ AD DEGISIRSE embedding YENIDEN URETILIR — bayatlama penceresi YOK (§6.2)', async () => {
      // ⚠️ PROJEDE ILK KEZ: onceki dort modulde baslikta denormalize edilen ad
      // BASKA BIR SATIRDA yasiyordu ve yeniden adlandirma vektoru bayatlatiyordu;
      // telafi `reindex`e kaliyordu. Burada ad AYNI SATIRIN kolonu.
      const { useCases, embed } = build({ found: existing({ note: 'parti no 2026-04' }) });

      await useCases.updateItem({
        id: ITEM,
        tenantId: TENANT,
        userId: USER,
        changes: { name: 'Vida M8 paslanmaz' },
      });

      expect(embed).toHaveBeenCalledWith('[Stok · VDA-M8 · Vida M8 paslanmaz] parti no 2026-04');
    });

    it('⚠️ SKU degisirse de yeniden uretilir', async () => {
      const { useCases, embed } = build({ found: existing({ note: 'parti no 2026-04' }) });

      await useCases.updateItem({
        id: ITEM,
        tenantId: TENANT,
        userId: USER,
        changes: { sku: 'VDA-M8-P' },
      });

      expect(embed).toHaveBeenCalledWith('[Stok · VDA-M8-P · Vida M8] parti no 2026-04');
    });

    it('⚠️ BASLIGA GIRMEYEN alan degisirse embedding URETILMEZ', async () => {
      // Birim ve esik baslikta GORUNMEZ; yeniden uretmek bedava bir OpenAI
      // cagrisi ve bir oran siniri payi harcamak olurdu.
      const { useCases, embed, registerRequest } = build({
        found: existing({ note: 'parti no 2026-04' }),
      });

      await useCases.updateItem({
        id: ITEM,
        tenantId: TENANT,
        userId: USER,
        changes: { unit: 'kg', minQuantity: '5' },
      });

      expect(embed).not.toHaveBeenCalled();
      expect(registerRequest).not.toHaveBeenCalled();
    });

    it('NOT SILINIRSE vektor TEMIZLENIR ve pay ODENMEZ', async () => {
      // Ag cagrisi gerekmedigi icin atomiklik BEDAVA. Aksi halde silinen bir
      // notun vektoru satirda kalir ve arama ARTIK VAR OLMAYAN metni bulurdu.
      const { useCases, setEmbedding, embed, registerRequest } = build({
        found: existing({ note: 'parti no 2026-04' }),
      });

      await useCases.updateItem({
        id: ITEM,
        tenantId: TENANT,
        userId: USER,
        changes: { note: null },
      });

      expect(setEmbedding).toHaveBeenCalledWith({ id: ITEM, embedding: null });
      expect(embed).not.toHaveBeenCalled();
      expect(registerRequest).not.toHaveBeenCalled();
    });

    it('⚠️ HAREKET YAZMAK PAY ODEMEZ — sayac EMBEDDING sayar (§5)', async () => {
      // Bu modulun EN SIK islemi hareket yazmaktir ve HICBIR SEY HARCAMAZ.
      // Sayac adinin `create_movement` degil `inventory_embedding` olmasinin
      // sebebi budur.
      const { useCases, registerRequest } = build();

      await useCases.recordMovement({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        direction: 'in',
        quantity: '5',
        occurredAt: NOW,
        note: null,
      });
      await useCases.recordCount({
        tenantId: TENANT,
        userId: USER,
        itemId: ITEM,
        countedQuantity: '20',
        note: null,
      });

      expect(registerRequest).not.toHaveBeenCalled();
    });

    it('oran siniri asilirsa 429 — ve KALEM YAZILMAZ', async () => {
      const { useCases, saveItem } = build({ rateLimitCount: RATE_LIMIT });

      await expect(
        useCases.createItem({
          tenantId: TENANT,
          userId: USER,
          fields: fields({ note: 'parti no 1' }),
        }),
      ).rejects.toThrow(RateLimitExceededError);

      expect(saveItem).not.toHaveBeenCalled();
    });

    it('embedding cokerse 502 — ama KALEM SILINMEZ', async () => {
      // ⚠️ Randevu/Belge ile ayni karar: kaydin kendisi birincil veridir.
      // Kullaniciyi yeniden girmeye zorlamak, bu modulde MUKERRER KALEM yani
      // STOGUN IKIYE BOLUNMESI demekti.
      const { useCases, saveItem } = build({ embedFails: true });

      await expect(
        useCases.createItem({
          tenantId: TENANT,
          userId: USER,
          fields: fields({ note: 'parti no 1' }),
        }),
      ).rejects.toThrow(EmbeddingFailedError);

      expect(saveItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('reindex — is listesi TURETILMIS', () => {
    it('her kalem AYRI ele alinir; biri cokse digerleri onarilir', async () => {
      const unindexed: UnindexedStockItem[] = [
        { id: 'a', name: 'A', sku: null, note: 'n1' },
        { id: 'b', name: 'B', sku: null, note: 'n2' },
      ];
      const { useCases, embed } = build({ unindexed });
      embed.mockRejectedValueOnce(new Error('coktu')).mockResolvedValueOnce(VECTOR);

      await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
        repaired: 1,
        failed: 1,
      });
    });
  });

  describe('silme (§3.4)', () => {
    it('`0` silinen satir 404 — kayit yok VE baska tenant in AYIRT EDILMEZ', async () => {
      const { useCases } = build({ deleted: 0 });
      await expect(useCases.deleteItem(ITEM)).rejects.toThrow(StockItemNotFoundError);
    });

    it('⚠️ ON KONTROL YAPILMAZ — veritabani kisiti YARISAMAZ', async () => {
      // Bir `SELECT count(*) FROM movements` on kontrolu ile silme arasinda bir
      // hareket yazilabilirdi ve kontrol YANILIRDI. `ON DELETE RESTRICT`
      // yarisamaz.
      const { useCases, deleteItemById } = build();

      await useCases.deleteItem(ITEM);

      expect(deleteItemById).toHaveBeenCalledTimes(1);
    });
  });
});
