import {
  countResultSchema,
  reindexInventoryResponseSchema,
  stockItemListResponseSchema,
  stockItemRowSchema,
  stockItemSchema,
  stockMovementListResponseSchema,
  stockMovementSchema,
  type CountResult,
  type CreateCountRequest,
  type CreateMovementRequest,
  type CreateStockItemRequest,
  type ReindexInventoryResponse,
  type StockItem,
  type StockItemListResponse,
  type StockItemRow,
  type StockMovement,
  type StockMovementListResponse,
  type UpdateStockItemRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Stok / Envanter uçları (ADR-0039 §8) — ALTI uç.
 *
 * `appointments.ts` / `documents.ts` ile aynı desen: her yanıt şemayla
 * DOĞRULANIR ve `undefined` parametreler sorgu dizesinden düşer.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN İKİ ŞEY
 * ============================================================================
 *   1. `updateMovement` / `deleteMovement` YOK — defter DEĞİŞTİRİLEMEZ
 *      (ADR-0039 §3.3). Sunucuda uç yok, izin yok, entity'de metot yok; burada
 *      da fonksiyon yok. Olmayan bir fonksiyon yanlışlıkla çağrılamaz.
 *   2. Miktar HESAPLAYAN hiçbir yardımcı YOK — miktar sunucudan gelir (§2).
 */

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function listStockItems(params: {
  limit: number;
  offset: number;
  includeArchived?: boolean;
  lowStockOnly?: boolean;
  search?: string;
}): Promise<StockItemListResponse> {
  return apiFetch(`/inventory/items?${query(params)}`, stockItemListResponseSchema);
}

export function getStockItem(id: string): Promise<StockItemRow> {
  return apiFetch(`/inventory/items/${id}`, stockItemRowSchema);
}

export function createStockItem(body: CreateStockItemRequest): Promise<StockItem> {
  return apiFetch('/inventory/items', stockItemSchema, { body });
}

export function updateStockItem(id: string, body: UpdateStockItemRequest): Promise<StockItem> {
  return apiFetch(`/inventory/items/${id}`, stockItemSchema, { method: 'PATCH', body });
}

export function deleteStockItem(id: string): Promise<void> {
  return apiSend(`/inventory/items/${id}`, { method: 'DELETE' });
}

export function listMovements(params: {
  limit: number;
  offset: number;
  itemId?: string;
}): Promise<StockMovementListResponse> {
  return apiFetch(`/inventory/movements?${query(params)}`, stockMovementListResponseSchema);
}

/**
 * Hareket yazar.
 *
 * ⚠️ `quantity` DAİMA POZİTİFTİR; yön `direction` ile AYRI gönderilir
 * (ADR-0039 §3.1). Arayüz işaretli bir sayı göndermez ve gönderemez — form
 * yönü ayrı butonlarla alır (§11.3).
 */
export function createMovement(body: CreateMovementRequest): Promise<StockMovement> {
  return apiFetch('/inventory/movements', stockMovementSchema, { body });
}

/**
 * FİZİKSEL SAYIM — kullanıcı SAYDIĞINI gönderir (ADR-0039 §3.2).
 *
 * ============================================================================
 * ⚠️ BU FONKSİYON FARK HESAPLAMAZ VE HESAPLAYAMAZ
 * ============================================================================
 * Gövde yalnızca `countedQuantity` taşır. Farkı sunucu, kalem satırı
 * `FOR UPDATE` ile kilitliyken hesaplar.
 *
 * İstemcide hesaplansaydı: istemcinin okuduğu miktar ile yazdığı an arasında
 * başka bir hareket girebilir ve düzeltme YANLIŞ MİKTARDA olurdu — sayım,
 * düzeltmesi gereken farkı YENİDEN ÜRETİR ve hata SESSİZDİR.
 *
 * ⚠️ Dönen `adjusted: false` bir HATA DEĞİLDİR: sayım tuttu, hiçbir satır
 * yazılmadı.
 */
export function recordCount(body: CreateCountRequest): Promise<CountResult> {
  return apiFetch('/inventory/counts', countResultSchema, { body });
}

/**
 * Vektörü eksik NOTLU kalemleri onarır.
 *
 * ⚠️ Bu modülde onarımın TEK işi vardır: gömülememiş notları indekslemek.
 * Önceki üç modülde ikinci bir işi daha vardı — bayat denormalize adı
 * tazelemek. Burada gerekmez: ad AYNI SATIRDA yaşar ve yeniden adlandırma
 * embedding'i aynı işlemde yeniler (ADR-0039 §6.2).
 */
export function reindexInventory(): Promise<ReindexInventoryResponse> {
  return apiFetch('/inventory/items/reindex', reindexInventoryResponseSchema, { body: {} });
}
