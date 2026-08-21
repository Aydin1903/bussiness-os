import { z } from 'zod';

/**
 * Stok / Envanter uçları — api ↔ web paylaşılan şemaları (ADR-0039).
 *
 * ============================================================================
 * ⚠️ `quantity` BİR DİZEDİR — VE `number`A ÇEVRİLMEZ
 * ============================================================================
 * Sunucu `numeric(14,3)` tutar ve kanonik dize döndürür (`"12.500"`).
 * `z.number()` yazılsaydı Zod dizeyi reddeder; `z.coerce.number()` yazılsaydı
 * SESSİZCE `number`a çevirir ve `0.1 + 0.2` sınıfından bir kayma arayüze
 * girerdi.
 *
 * Bu, ADR-0034'ün para için verdiği kararın birebir aynısı — ve buradaki
 * çıktı bir STOK RAKAMIDIR; rakamlara itiraz edilmez.
 *
 * ============================================================================
 * ⚠️ `quantity` TÜRETİLMİŞTİR — SUNUCUDAN GELİR, İSTEMCİDE HESAPLANMAZ
 * ============================================================================
 * `items` tablosunda miktar kolonu YOKTUR (ADR-0039 §2); her okumada
 * `movements` toplanır. Arayüzün bunu yeniden hesaplaması demek, ikinci bir
 * doğruluk kaynağı kurmak demektir — hem de yalnızca GÖRÜNEN sayfadaki
 * hareketlerden, yani YANLIŞ bir sayı.
 *
 * ============================================================================
 * ⚠️ FARKLI KALEMLERİN MİKTARLARI TOPLANMAZ (ADR-0039 §4.1)
 * ============================================================================
 * 3 kg un ile 12 adet vidanın toplamı YOKTUR. Bu yüzden bu dosyada "toplam
 * stok" anlamına gelecek TEK BİR ALAN BİLE yoktur ve olmamalıdır —
 * `cashflowSummarySchema`nın para birimi için yaptığı tip seviyesindeki
 * korumanın aynısı.
 */

/**
 * ⚠️ KALEM NOTUNUN SERT SINIRI — TEK KAYNAK BURASIDIR.
 *
 * Sunucu bunu `stock-item.entity.ts`te `TARGET_CHUNK_CHARS`tan türetir (bu
 * modülde chunking YOKTUR — ADR-0039 §5). Arayüzün de aynı sayıyı bilmesi
 * gerekiyor: canlı karakter sayacı ve submit engeli ona dayanıyor. İki tarafta
 * ayrı yazılsaydı biri değiştiğinde diğeri SESSİZCE ayrışırdı — kullanıcı
 * formda "1250/1250, tamam" görür, sunucu 422 döner ve sebebini anlayamazdı.
 */
export const MAX_ITEM_NOTE_CHARS = 1250;

export const MAX_ITEM_NAME_CHARS = 200;
export const MAX_ITEM_SKU_CHARS = 64;

/** ⚠️ Kısa tutulur: birim yapısal katkının HER satırında gönderilir (§4). */
export const MAX_ITEM_UNIT_CHARS = 16;

export const MAX_MOVEMENT_NOTE_CHARS = 500;

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

/**
 * ⚠️ Kanonik ondalık dize — `numeric(14,3)`.
 *
 * İŞARETLİ kabul edilir çünkü `quantity` NEGATİF olabilir: mevcuttan fazla
 * çıkış yazmak ENGELLENMEZ (ADR-0039 §Alternatifler — engellemek işletmeyi
 * yalan söylemeye iter) ve negatif stok bir ALARM sinyalidir.
 */
const decimal = z.string().regex(/^-?\d{1,11}(\.\d{1,3})?$/, 'Geçersiz miktar');

/**
 * HAREKET YÖNÜ — iki değerli (ADR-0039 §3.1).
 *
 * ⚠️ `adjustment` ÜÇÜNCÜ BİR YÖN DEĞİLDİR ve bu sözlükte yoktur. "Düzeltme"
 * bir sebeptir (`isCorrection`), bir yön değil: `adjustment` tek başına
 * miktarın hangi yöne gittiğini söylemez ve ya işaretli miktar (ADR-0034 §5'in
 * açıkça reddettiği) ya da satır bazında anlam değiştiren nullable bir yön
 * gerektirirdi.
 */
export const movementDirectionSchema = z.enum(['in', 'out']);

export type MovementDirection = z.infer<typeof movementDirectionSchema>;

/** Ekranda gösterilecek Türkçe karşılıklar — sözlük TEK yerde. */
export const MOVEMENT_DIRECTION_LABELS: Readonly<Record<MovementDirection, string>> = {
  in: 'Giriş',
  out: 'Çıkış',
};

export const stockItemSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  sku: z.string().nullable(),
  unit: z.string(),
  /** ⚠️ `null` = İZLEME YOK; `"0.000"` = tükendiğinde haber ver. AYNI ŞEY DEĞİL. */
  minQuantity: decimal.nullable(),
  note: z.string().nullable(),
  archivedAt: instant.nullable(),
  createdByUserId: z.string(),
  createdAt: instant,
  updatedAt: instant,
});

export type StockItem = z.infer<typeof stockItemSchema>;

/**
 * Liste/detay satırı — tanım + TÜRETİLMİŞ miktar.
 *
 * ⚠️ `quantity` ayrı bir alandır, `StockItem`ın parçası DEĞİLDİR — çünkü
 * sunucuda da öyle: entity onu taşımaz (ADR-0039 §2). Tipin şekli kararın
 * şeklini yansıtır.
 */
export const stockItemRowSchema = stockItemSchema.extend({
  quantity: decimal,
});

export type StockItemRow = z.infer<typeof stockItemRowSchema>;

export const stockItemListResponseSchema = z.object({
  items: z.array(stockItemRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type StockItemListResponse = z.infer<typeof stockItemListResponseSchema>;

export const stockMovementSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  itemId: z.uuid(),
  direction: movementDirectionSchema,
  /** ⚠️ HER ZAMAN POZİTİF; işaret `direction`dadır. */
  quantity: decimal,
  /**
   * Fiziksel sayımdan doğan fark mı?
   *
   * ⚠️ Bunu `true` yapabilen TEK yol `POST /inventory/counts`tur. Hareket
   * gövdesinde böyle bir alan YOKTUR — istemci işaretleyebilseydi "fire"
   * toplamı, kullanıcının keyfi olarak işaretlediği satırların toplamına
   * dönerdi.
   */
  isCorrection: z.boolean(),
  /** ⚠️ `createdAt` ile AYNI ŞEY DEĞİL: hareket dün olmuş, bugün girilmiş olabilir. */
  occurredAt: instant,
  note: z.string().nullable(),
  createdByUserId: z.string(),
  createdAt: instant,
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

/**
 * ⚠️ BU TİPTE `updatedAt` YOKTUR — ve bu bir eksik değil.
 *
 * Defter DEĞİŞTİRİLEMEZ (ADR-0039 §3.3): bir hareket güncellenmez, silinmez.
 * Güncellenmeyen bir satırın güncellenme zamanı da olmaz. Alanı buraya koymak,
 * ileride birinin "demek ki güncellenebiliyor" diye okuyacağı sessiz bir davet
 * olurdu.
 */

export const stockMovementListResponseSchema = z.object({
  items: z.array(stockMovementSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type StockMovementListResponse = z.infer<typeof stockMovementListResponseSchema>;

export const createStockItemRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_ITEM_NAME_CHARS),
  sku: z.string().trim().min(1).max(MAX_ITEM_SKU_CHARS).nullish(),
  unit: z.string().trim().min(1).max(MAX_ITEM_UNIT_CHARS),
  minQuantity: z.union([decimal, z.number()]).nullish(),
  note: z.string().trim().max(MAX_ITEM_NOTE_CHARS).nullish(),
});

export type CreateStockItemRequest = z.infer<typeof createStockItemRequestSchema>;

/**
 * KISMİ güncelleme.
 *
 * ⚠️ `null` = TEMİZLE, alan yok = DOKUNMA. Üçü de meşrudur: SKU'yu kaldırmak,
 * EŞİĞİ kaldırmak (izleme yok), notu silmek.
 *
 * ⚠️ AD ya da SKU değişimi sunucuda EMBEDDING'İ YENİDEN ÜRETİR (ikisi de
 * bağlam başlığına girer — ADR-0039 §6.2) ve oran sınırı payı öder. Bu, bu
 * modülün "bayatlama penceresi yok" kazancının bedelidir.
 */
export const updateStockItemRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_ITEM_NAME_CHARS).optional(),
  sku: z.string().trim().min(1).max(MAX_ITEM_SKU_CHARS).nullable().optional(),
  unit: z.string().trim().min(1).max(MAX_ITEM_UNIT_CHARS).optional(),
  minQuantity: z.union([decimal, z.number()]).nullable().optional(),
  note: z.string().trim().max(MAX_ITEM_NOTE_CHARS).nullable().optional(),
  /** `true` = arşivle, `false` = arşivden çıkar. İkisi de meşru. */
  archived: z.boolean().optional(),
});

export type UpdateStockItemRequest = z.infer<typeof updateStockItemRequestSchema>;

export const createMovementRequestSchema = z.object({
  itemId: z.uuid(),
  direction: movementDirectionSchema,
  /** ⚠️ POZİTİF girilir; yön AYRI seçilir (ADR-0039 §11.3). */
  quantity: z.union([decimal, z.number()]),
  occurredAt: instant.optional(),
  note: z.string().trim().max(MAX_MOVEMENT_NOTE_CHARS).nullish(),
});

export type CreateMovementRequest = z.infer<typeof createMovementRequestSchema>;

/**
 * FİZİKSEL SAYIM isteği (ADR-0039 §3.2).
 *
 * ============================================================================
 * ⚠️ BU ŞEMADA `delta` DİYE BİR ALAN YOKTUR — VE OLMAYACAKTIR
 * ============================================================================
 * Kullanıcı SAYDIĞI mutlak miktarı gönderir; farkı SUNUCU hesaplar (kalem
 * satırı `SELECT ... FOR UPDATE` ile kilitli, tek transaction içinde).
 *
 * İstemciye hesaplatmak YASAK: istemci mevcut miktarı BİR ÖNCEKİ istekte
 * okumuştur ve arada başka bir hareket yazıldıysa düzeltme YANLIŞ MİKTARDA
 * olur — sayım, düzeltmesi gereken farkı YENİDEN ÜRETİR ve hata SESSİZDİR.
 *
 * ⚠️ `occurredAt` de yoktur: sayım "şimdi" yapılan bir ölçümdür. Geçmişe
 * tarihlenmiş bir sayım, aradaki hareketlerle birlikte anlamsızdır.
 */
export const createCountRequestSchema = z.object({
  itemId: z.uuid(),
  /** SAYILAN MUTLAK MİKTAR — fark değil. */
  countedQuantity: z.union([decimal, z.number()]),
  note: z.string().trim().max(MAX_MOVEMENT_NOTE_CHARS).nullish(),
});

export type CreateCountRequest = z.infer<typeof createCountRequestSchema>;

/**
 * Sayım sonucu.
 *
 * ⚠️ `adjusted: false` BİR HATA DEĞİLDİR: sayım TUTTU, yani hiçbir düzeltme
 * gerekmedi ve deftere hiçbir satır yazılmadı. Arayüz bunu AÇIKÇA söylemek
 * zorundadır — yoksa kullanıcı işlemin başarısız olduğunu sanar.
 *
 * ⚠️ `quantity` sayım SONRASI miktardır ve SUNUCUDAN gelir. Arayüz bunu
 * kullanıcının girdiğinden türetmez: iki değer üretimde aynıdır ama farkı,
 * gösterilen sayının sunucunun ONAYLADIĞI sayı olmasıdır.
 */
export const countResultSchema = z.object({
  adjusted: z.boolean(),
  quantity: decimal,
  movement: stockMovementSchema.nullable(),
});

export type CountResult = z.infer<typeof countResultSchema>;

export const reindexInventoryResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type ReindexInventoryResponse = z.infer<typeof reindexInventoryResponseSchema>;

/**
 * EŞİK DURUMU — arayüzün rozet rengi bunun üzerinden kurulur.
 *
 * ============================================================================
 * ⚠️ BU SINIFLANDIRMA SUNUCUDAKİ YAPISAL KATKICIYLA AYNI BANTLARI KULLANIR
 * ============================================================================
 * `InventoryStockContributor` skoru şöyle verir (ADR-0039 §6.1):
 *
 *   negatif veya eşik altı            -> 0.95  (gerçek alarm)
 *   eşiğe yakın (`nearRatio` bandı)   -> 0.90  (dikkat)
 *   sağlıklı / eşik tanımsız          -> 0.75  (bilgi)
 *
 * ⚠️ `NEAR_THRESHOLD_RATIO` sunucudaki `INVENTORY_NEAR_THRESHOLD_RATIO` ile
 * SENKRON KALMAK ZORUNDADIR. Ayrışırlarsa hata SESSİZDİR: ekran "yaklaştı"
 * der, katkıcı sağlıklı sayıp 0.75 verir — yani AI ile arayüz aynı stok
 * hakkında farklı şey söyler.
 *
 * Bu, `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrışmasının ÜÇÜNCÜ
 * tekrarıdır ve bu kez sabit ilk günden PAYLAŞILAN pakette yazıldı — iki
 * tarafta ayrı ayrı değil.
 */
export const NEAR_THRESHOLD_RATIO = 1.25;

export type StockLevel = 'critical' | 'near' | 'healthy' | 'untracked';

/**
 * Miktar + eşikten durumu türetir.
 *
 * ⚠️ KARŞILAŞTIRMA DİZE ÜZERİNDE YAPILMAZ, `Number`A DA ÇEVRİLMEZ: ikisi de
 * yanlış olurdu (`"9" > "12"` sözlük sırasında doğrudur; `Number` kayma
 * üretir). Değerler ölçekli tam sayıya çevrilip karşılaştırılır — sunucudaki
 * `quantity.ts`in aynı yöntemi.
 */
export function stockLevelOf(input: { quantity: string; minQuantity: string | null }): StockLevel {
  const quantity = toUnits(input.quantity);

  // ⚠️ Negatif stok FİZİKSEL OLARAK İMKANSIZDIR — eşiği olmasa bile kritiktir,
  // çünkü kaydın kendisi tutarsızdır (ADR-0039 §6.1).
  if (quantity < 0) {
    return 'critical';
  }

  if (input.minQuantity === null) {
    return 'untracked';
  }

  const threshold = toUnits(input.minQuantity);
  if (quantity <= threshold) {
    return 'critical';
  }

  // ⚠️ Çarpım TAM SAYI uzayında: `threshold * 1.25` bir kayan nokta çarpımıdır,
  // ama sonuç yalnızca bir KARŞILAŞTIRMA eşiğidir ve `Math.floor` ile tam
  // sayıya indirilir. Miktarın kendisi hiçbir noktada `number` olmaz.
  return quantity <= Math.floor(threshold * NEAR_THRESHOLD_RATIO) ? 'near' : 'healthy';
}

/** Kanonik dize -> ölçekli tam sayı (3 ondalık). `Number` KULLANILMAZ. */
function toUnits(value: string): number {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const units = Number(whole) * 1000 + Number(fraction.padEnd(3, '0').slice(0, 3));
  return negative ? -units : units;
}

export const STOCK_LEVEL_LABELS: Readonly<Record<StockLevel, string>> = {
  critical: 'Kritik',
  near: 'Azalıyor',
  healthy: 'Yeterli',
  untracked: 'İzlenmiyor',
};
