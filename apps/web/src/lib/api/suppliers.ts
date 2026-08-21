import {
  reindexSuppliersResponseSchema,
  supplierContactListResponseSchema,
  supplierContactSchema,
  supplierInteractionListResponseSchema,
  supplierInteractionSchema,
  supplierListResponseSchema,
  supplierSchema,
  supplierUpdateResultSchema,
  type CreateSupplierContactRequest,
  type CreateSupplierInteractionRequest,
  type CreateSupplierRequest,
  type ReindexSuppliersResponse,
  type Supplier,
  type SupplierContact,
  type SupplierContactListResponse,
  type SupplierInteraction,
  type SupplierInteractionListResponse,
  type SupplierListResponse,
  type SupplierUpdateResult,
  type UpdateSupplierContactRequest,
  type UpdateSupplierRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Tedarikçi Yönetimi uçları (ADR-0040 §5) — ON İKİ uç.
 *
 * `inventory.ts` / `documents.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR
 * ve `undefined` parametreler sorgu dizesinden düşer.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN ŞEYLER
 * ============================================================================
 *   1. `updateInteraction` / `deleteInteraction` YOK — günlük EKLEME-YALNIZDIR
 *      (ADR-0040 §1). Sunucuda uç yok, izin yok (`create`, `write` DEĞİL),
 *      entity'de metot yok; burada da fonksiyon yok. Olmayan bir fonksiyon
 *      yanlışlıkla çağrılamaz.
 *   2. Ödeme koşulunu AYRIŞTIRAN hiçbir yardımcı YOK — `paymentTerms` serbest
 *      metindir (§1.2) ve "60 gün" gibi bir ifadeden vade çıkarmak SESSİZ HATA
 *      MAKİNESİ olurdu.
 *
 * ============================================================================
 * ⚠️ ROTA SIRASI BURADA DA GÖRÜNÜR
 * ============================================================================
 * `/suppliers/contacts` ve `/suppliers/interactions` SABİT yollardır;
 * `/suppliers/:id` parametrelidir. Sunucu tarafında sabit yollar `:id`den
 * ÖNCE tanımlıdır (tek controller, gerekçe `supplier.controller.ts`te).
 * Bozulsaydı `contacts` bir UUID sanılır ve **422** dönerdi — ekran çalışır,
 * hiçbir test kırmızı yanmazdı. Bir entegrasyon testi bunu kilitliyor.
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

// ============================================================================
// Tedarikçi
// ============================================================================

export function listSuppliers(params: {
  limit: number;
  offset: number;
  /**
   * ⚠️ SUNUCUDA aranır (ad + vergi no, büyük/küçük harf duyarsız).
   *
   * Randevu'nun "kişi filtresi istemcide" bilinen sınırı burada
   * TEKRARLANMADI: tedarikçi sayısı sayfa sınırını aşabilir ve istemci tarafı
   * arama yalnızca görünen sayfaya uygulanırdı — kullanıcı "yok" sanıp AYNI
   * FİRMAYI ikinci kez açardı ve GÖRÜŞME GEÇMİŞİ ikiye bölünürdü.
   */
  search?: string;
}): Promise<SupplierListResponse> {
  return apiFetch(`/suppliers?${query(params)}`, supplierListResponseSchema);
}

export function getSupplier(id: string): Promise<Supplier> {
  return apiFetch(`/suppliers/${id}`, supplierSchema);
}

export function createSupplier(body: CreateSupplierRequest): Promise<Supplier> {
  return apiFetch('/suppliers', supplierSchema, { body });
}

/**
 * Tedarikçiyi kısmi günceller.
 *
 * ⚠️ CEVAP `staleAfterRename` TAŞIR ve arayüz onu GÖSTERMEK ZORUNDADIR: ad
 * değiştiyse o tedarikçinin TÜM görüşme vektörleri bayatlamıştır (§6) ve
 * onarım AÇIK bir eylemdir (`reindexSuppliers({ supplierId })`).
 */
export function updateSupplier(
  id: string,
  body: UpdateSupplierRequest,
): Promise<SupplierUpdateResult> {
  return apiFetch(`/suppliers/${id}`, supplierUpdateResultSchema, { method: 'PATCH', body });
}

/**
 * Tedarikçiyi siler.
 *
 * ⚠️ KİŞİLER VE GÖRÜŞMELER DE GİDER (`ON DELETE CASCADE`, §1.3) — ve bu bir
 * KVKK girdisidir: vektör görüşme satırının KENDİSİNDE yaşadığı için silinen
 * bir tedarikçi AI'ın hafızasından da silinir. Arayüz bunu onay metninde
 * AÇIKÇA söyler.
 */
export function deleteSupplier(id: string): Promise<void> {
  return apiSend(`/suppliers/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Kişi
// ============================================================================

export function listSupplierContacts(supplierId: string): Promise<SupplierContactListResponse> {
  return apiFetch(
    `/suppliers/contacts?${query({ supplierId })}`,
    supplierContactListResponseSchema,
  );
}

export function createSupplierContact(
  body: CreateSupplierContactRequest,
): Promise<SupplierContact> {
  return apiFetch('/suppliers/contacts', supplierContactSchema, { body });
}

export function updateSupplierContact(
  id: string,
  body: UpdateSupplierContactRequest,
): Promise<SupplierContact> {
  return apiFetch(`/suppliers/contacts/${id}`, supplierContactSchema, {
    method: 'PATCH',
    body,
  });
}

/**
 * Kişiyi siler.
 *
 * ⚠️ GÖRÜŞME KAYITLARI SİLİNMEZ: `contact_id` `ON DELETE SET NULL` taşır
 * (§1.3). Ayrılan bir satın alma sorumlusunun silinmesi kurumsal hafızayı
 * götürseydi hata SESSİZ olurdu — bu, tedarikçi silmenin TAM TERSİ yöndür ve
 * onay metinleri de farklıdır.
 */
export function deleteSupplierContact(id: string): Promise<void> {
  return apiSend(`/suppliers/contacts/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Görüşme günlüğü
// ============================================================================

export function listSupplierInteractions(params: {
  limit: number;
  offset: number;
  supplierId?: string;
}): Promise<SupplierInteractionListResponse> {
  return apiFetch(
    `/suppliers/interactions?${query(params)}`,
    supplierInteractionListResponseSchema,
  );
}

/**
 * Görüşme kaydeder ve gömer.
 *
 * ⚠️ BU ÇAĞRI HER ZAMAN ORAN SINIRI PAYI ÖDER — Randevu/Stok'tan farklı olarak
 * metin ZORUNLUDUR, yani her yazma bir embedding çağrısı üretir. Sayaç ile
 * maliyet arasındaki oran SABİT ve BİRE BİRDİR.
 *
 * ⚠️ **502 gövdesi AÇIKTIR** (`DisclosableProblem`): sağlayıcı çökerse görüşme
 * KAYDEDİLİR, yalnızca aranamaz kalır ve mesaj `/suppliers/reindex`i söyler.
 * Arayüz bu mesajı olduğu gibi göstermelidir — kullanıcıyı yeniden girmeye
 * itmek, EKLEME-YALNIZ bir günlükte SİLİNEMEYEN mükerrer bir kayıt üretirdi.
 */
export function createSupplierInteraction(
  body: CreateSupplierInteractionRequest,
): Promise<SupplierInteraction> {
  return apiFetch('/suppliers/interactions', supplierInteractionSchema, { body });
}

/**
 * Vektörleri onarır.
 *
 * ⚠️ İKİ İŞİ VARDIR ve `supplierId` hangisinin yapılacağını belirler (§6):
 *
 *   verilmezse → VEKTÖRSÜZ görüşmeleri gömer (sağlayıcı çökmesinden kalanlar)
 *   verilirse  → o tedarikçinin görüşmelerini YENİDEN gömer (BAYAT BAŞLIK)
 *
 * İkinci iş Stok'ta YOKTU: orada ad kalemin AYNI SATIRINDAYDI ve `PATCH`
 * vektörü aynı işlemde yeniliyordu ("bayatlama penceresi yok"). Burada ad
 * AYRI SATIRDA yaşar.
 */
export function reindexSuppliers(
  params: {
    supplierId?: string;
  } = {},
): Promise<ReindexSuppliersResponse> {
  return apiFetch('/suppliers/reindex', reindexSuppliersResponseSchema, {
    body: params.supplierId === undefined ? {} : { supplierId: params.supplierId },
  });
}
