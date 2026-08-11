import {
  cashflowSummarySchema,
  createFinanceCommentaryResponseSchema,
  financeCategoryListResponseSchema,
  financeCategorySchema,
  financeCommentaryListResponseSchema,
  financeTransactionListResponseSchema,
  financeTransactionSchema,
  reindexCommentariesResponseSchema,
  unindexedCommentariesResponseSchema,
  type CashflowSummary,
  type CreateFinanceCategoryRequest,
  type CreateFinanceCommentaryRequest,
  type CreateFinanceCommentaryResponse,
  type CreateFinanceTransactionRequest,
  type FinanceCategory,
  type FinanceCategoryListResponse,
  type FinanceCommentaryListResponse,
  type FinanceDirection,
  type FinanceTransaction,
  type FinanceTransactionListResponse,
  type ReindexCommentariesResponse,
  type UnindexedCommentariesResponse,
  type UpdateFinanceCategoryRequest,
  type UpdateFinanceTransactionRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Finans uçları (ADR-0034).
 *
 * `crm.ts` / `projects.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR, sorgu
 * dizesi tek bir yardımcıdan üretilir ve `undefined` parametreler düşürülür.
 */

/** `undefined` değerler sorguya GİRMEZ — `?direction=undefined` göndermemek için. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/* ========================================================================== */
/* Kategoriler                                                                */
/* ========================================================================== */

export function listFinanceCategories(params: {
  limit: number;
  offset: number;
  direction?: FinanceDirection;
  includeArchived?: boolean;
}): Promise<FinanceCategoryListResponse> {
  return apiFetch(`/finance/categories?${query(params)}`, financeCategoryListResponseSchema);
}

export function createFinanceCategory(
  body: CreateFinanceCategoryRequest,
): Promise<FinanceCategory> {
  return apiFetch('/finance/categories', financeCategorySchema, { body });
}

/** ⚠️ `direction` gövdeye KONMAZ — sunucu 422 döner (ADR-0034 §3c). */
export function updateFinanceCategory(
  id: string,
  body: UpdateFinanceCategoryRequest,
): Promise<FinanceCategory> {
  return apiFetch(`/finance/categories/${id}`, financeCategorySchema, { method: 'PATCH', body });
}

/**
 * ⚠️ KULLANIMDAKİ kategori silinemez — sunucu `409` döner. Doğru eylem
 * ARŞİVLEMEKTİR: silme geçmiş özetleri sessizce değiştirirdi (§3e).
 */
export function deleteFinanceCategory(id: string): Promise<void> {
  return apiSend(`/finance/categories/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* İşlemler                                                                   */
/* ========================================================================== */

export function listFinanceTransactions(params: {
  limit: number;
  offset: number;
  direction?: FinanceDirection;
  categoryId?: string;
  from?: string;
  to?: string;
}): Promise<FinanceTransactionListResponse> {
  return apiFetch(`/finance/transactions?${query(params)}`, financeTransactionListResponseSchema);
}

export function createFinanceTransaction(
  body: CreateFinanceTransactionRequest,
): Promise<FinanceTransaction> {
  return apiFetch('/finance/transactions', financeTransactionSchema, { body });
}

export function updateFinanceTransaction(
  id: string,
  body: UpdateFinanceTransactionRequest,
): Promise<FinanceTransaction> {
  return apiFetch(`/finance/transactions/${id}`, financeTransactionSchema, {
    method: 'PATCH',
    body,
  });
}

export function deleteFinanceTransaction(id: string): Promise<void> {
  return apiSend(`/finance/transactions/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* Nakit akışı özeti                                                          */
/* ========================================================================== */

/**
 * ⚠️ PARA BİRİMİ BAŞINA ayrı satır döner; tek bir "net" YOKTUR (§5.1).
 *
 * Ekran bunları TOPLAMAZ — toplasaydı sunucunun bilinçli olarak vermediği
 * yanlış sayıyı istemcide üretmiş olurduk.
 */
export function getCashflowSummary(params: {
  from?: string;
  to?: string;
  includeCategories?: boolean;
}): Promise<CashflowSummary> {
  return apiFetch(`/finance/summary?${query(params)}`, cashflowSummarySchema);
}

/* ========================================================================== */
/* Finansal yorumlar                                                          */
/* ========================================================================== */

export function listFinanceCommentaries(params: {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
}): Promise<FinanceCommentaryListResponse> {
  return apiFetch(`/finance/commentaries?${query(params)}`, financeCommentaryListResponseSchema);
}

/**
 * Yorum kaydeder ve indeksler.
 *
 * `502` ANLAMLIDIR: yorum KAYDEDİLDİ ama indekslenemedi — kullanıcı metni
 * yeniden yazmamalı, `reindexCommentaries()` onarır (ADR-0029 §4).
 */
export function createFinanceCommentary(
  body: CreateFinanceCommentaryRequest,
): Promise<CreateFinanceCommentaryResponse> {
  return apiFetch('/finance/commentaries', createFinanceCommentaryResponseSchema, { body });
}

export function countUnindexedCommentaries(): Promise<UnindexedCommentariesResponse> {
  return apiFetch('/finance/commentaries/unindexed', unindexedCommentariesResponseSchema);
}

export function reindexCommentaries(): Promise<ReindexCommentariesResponse> {
  return apiFetch('/finance/reindex', reindexCommentariesResponseSchema, { body: {} });
}
