import {
  createPointEntryResponseSchema,
  loyaltyAccountListResponseSchema,
  loyaltyAccountSchema,
  loyaltySummarySchema,
  pointEntryListResponseSchema,
  type CreateLoyaltyAccountRequest,
  type CreatePointEntryRequest,
  type CreatePointEntryResponse,
  type LoyaltyAccount,
  type LoyaltyAccountListResponse,
  type LoyaltySummary,
  type PointEntryListResponse,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function listLoyaltyAccounts(params: {
  limit: number;
  offset: number;
}): Promise<LoyaltyAccountListResponse> {
  return apiFetch(`/loyalty/accounts?${query(params)}`, loyaltyAccountListResponseSchema);
}

export function getLoyaltySummary(): Promise<LoyaltySummary> {
  return apiFetch('/loyalty/summary', loyaltySummarySchema);
}

export function getLoyaltyAccount(id: string): Promise<LoyaltyAccount> {
  return apiFetch(`/loyalty/accounts/${id}`, loyaltyAccountSchema);
}

export function createLoyaltyAccount(body: CreateLoyaltyAccountRequest): Promise<LoyaltyAccount> {
  return apiFetch('/loyalty/accounts', loyaltyAccountSchema, { body });
}

/**
 * ⚠️ HESAP SILINIR, DEFTER ONUNLA BIRLIKTE GIDER (ADR-0051 §2.1).
 *
 * ⚠️ Bir `deletePointEntry` KARSILIGI YOKTUR ve olmayacaktir: tek bir satiri
 * silmek BUGUNKU BAKIYEYI SESSIZCE YENIDEN YAZARDI. Hesabin tamamini silmek
 * ise bakiyeyi yeniden yazmaz — YOK EDER.
 */
export function deleteLoyaltyAccount(id: string): Promise<void> {
  return apiSend(`/loyalty/accounts/${id}`, { method: 'DELETE' });
}

export function listPointEntries(
  accountId: string,
  params: { limit: number; offset: number },
): Promise<PointEntryListResponse> {
  return apiFetch(
    `/loyalty/accounts/${accountId}/entries?${query(params)}`,
    pointEntryListResponseSchema,
  );
}

/**
 * ⚠️ CEVAP YENI BAKIYEYI TASIR ve arayuz onu OLDUGU GIBI yazar.
 *
 * Istemci `bakiye + puan` hesaplamaz: es zamanli bir hareket sonrasi ekranda
 * SESSIZCE yanlis bir sayi kalirdi. Sunucu bakiyeyi KILIT ALTINDA turetir
 * (ADR-0051 §4.3).
 */
export function createPointEntry(
  accountId: string,
  body: CreatePointEntryRequest,
): Promise<CreatePointEntryResponse> {
  return apiFetch(`/loyalty/accounts/${accountId}/entries`, createPointEntryResponseSchema, {
    body,
  });
}
