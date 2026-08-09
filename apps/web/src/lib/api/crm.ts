import {
  companyListResponseSchema,
  companySchema,
  companySummarySchema,
  contactListResponseSchema,
  contactSchema,
  createInteractionResponseSchema,
  followUpListResponseSchema,
  generateCompanySummaryResponseSchema,
  interactionListResponseSchema,
  opportunityListResponseSchema,
  opportunitySchema,
  reindexInteractionsResponseSchema,
  unindexedInteractionsResponseSchema,
  type Company,
  type CompanyListResponse,
  type CompanySummary,
  type Contact,
  type ContactListResponse,
  type CreateCompanyRequest,
  type CreateContactRequest,
  type CreateInteractionRequest,
  type CreateInteractionResponse,
  type CreateOpportunityRequest,
  type FollowUpListResponse,
  type GenerateCompanySummaryResponse,
  type InteractionListResponse,
  type Opportunity,
  type OpportunityListResponse,
  type OpportunityOrder,
  type OpportunityStage,
  type ReindexInteractionsResponse,
  type UnindexedInteractionsResponse,
  type UpdateCompanyRequest,
  type UpdateContactRequest,
  type UpdateOpportunityRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * CRM modülü uçları — hepsi TENANT-SCOPED (ADR-0031).
 *
 * `knowledge.ts` ile aynı kural: bu çağrılar tenant SEÇİLDİKTEN sonradır,
 * dolayısıyla `apiFetch`'in varsayılanı (memory'deki access token) doğrudur ve
 * `bearer` geçilmez.
 *
 * ============================================================================
 * SİLME UÇLARI `apiSend` KULLANIR
 * ============================================================================
 * Üçü de `204 No Content` döner. `apiFetch` gövdeyi JSON olarak okumaya
 * çalışırdı ve boş gövdede "Yanıt gövdesi JSON olarak okunamadı" diye
 * BAŞARILI bir silmeyi hata gibi gösterirdi.
 */

/** `limit`/`offset` → sorgu dizesi. Boş/`undefined` filtreler DÜŞER. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/* ========================================================================== */
/* Şirketler                                                                  */
/* ========================================================================== */

export function listCompanies(params: {
  limit: number;
  offset: number;
}): Promise<CompanyListResponse> {
  return apiFetch(`/crm/companies?${query(params)}`, companyListResponseSchema);
}

export function getCompany(id: string): Promise<Company> {
  return apiFetch(`/crm/companies/${id}`, companySchema);
}

export function createCompany(body: CreateCompanyRequest): Promise<Company> {
  return apiFetch('/crm/companies', companySchema, { body });
}

export function updateCompany(id: string, body: UpdateCompanyRequest): Promise<Company> {
  return apiFetch(`/crm/companies/${id}`, companySchema, { method: 'PATCH', body });
}

/** ⚠️ CASCADE: kişileri ve görüşmeleri de götürür (ADR-0031 §7). Geri alınamaz. */
export function deleteCompany(id: string): Promise<void> {
  return apiSend(`/crm/companies/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* Kişiler                                                                    */
/* ========================================================================== */

export function listContacts(params: {
  limit: number;
  offset: number;
  companyId?: string;
}): Promise<ContactListResponse> {
  return apiFetch(`/crm/contacts?${query(params)}`, contactListResponseSchema);
}

export function createContact(body: CreateContactRequest): Promise<Contact> {
  return apiFetch('/crm/contacts', contactSchema, { body });
}

export function updateContact(id: string, body: UpdateContactRequest): Promise<Contact> {
  return apiFetch(`/crm/contacts/${id}`, contactSchema, { method: 'PATCH', body });
}

export function deleteContact(id: string): Promise<void> {
  return apiSend(`/crm/contacts/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* Fırsatlar                                                                  */
/* ========================================================================== */

/**
 * `GET /crm/opportunities` — sayfalı, ŞİRKET ADIYLA (Slice 8b join'i).
 *
 * `stage` filtresi hattın (pipeline) temelidir: her sütun kendi isteğini atar,
 * tek bir sayfa istemcide gruplanmaz. Gerekçe `pipeline-board.tsx`'te.
 */
export function listOpportunities(params: {
  limit: number;
  offset: number;
  companyId?: string;
  stage?: OpportunityStage;
  /** `priority`: önce gecikmiş takipler, sonra en son güncellenen. */
  order?: OpportunityOrder;
}): Promise<OpportunityListResponse> {
  return apiFetch(`/crm/opportunities?${query(params)}`, opportunityListResponseSchema);
}

/** ⚠️ Yanıt `companyName` TAŞIMAZ — tek kayıt uçlarında şirket bağlamdan bellidir. */
export function createOpportunity(body: CreateOpportunityRequest): Promise<Opportunity> {
  return apiFetch('/crm/opportunities', opportunitySchema, { body });
}

export function updateOpportunity(
  id: string,
  body: UpdateOpportunityRequest,
): Promise<Opportunity> {
  return apiFetch(`/crm/opportunities/${id}`, opportunitySchema, { method: 'PATCH', body });
}

export function deleteOpportunity(id: string): Promise<void> {
  return apiSend(`/crm/opportunities/${id}`, { method: 'DELETE' });
}

/* ========================================================================== */
/* Takipler                                                                   */
/* ========================================================================== */

/**
 * `GET /crm/follow-ups` — takip tarihi olan ve KAPANMAMIŞ fırsatlar, kronolojik.
 *
 * GECİKMİŞ takipler DAHİLDİR ve en başta gelir (sunucu yalnızca tarihe göre
 * sıralar). "Gecikmiş" işaretini İSTEMCİ koyar — sunucunun `CURRENT_DATE`'i ile
 * kullanıcının takvim günü aynı olmak zorunda değil.
 */
export function listFollowUps(params: {
  limit: number;
  offset: number;
}): Promise<FollowUpListResponse> {
  return apiFetch(`/crm/follow-ups?${query(params)}`, followUpListResponseSchema);
}

/* ========================================================================== */
/* Görüşmeler                                                                 */
/* ========================================================================== */

export function listInteractions(params: {
  limit: number;
  offset: number;
  companyId?: string;
  opportunityId?: string;
}): Promise<InteractionListResponse> {
  return apiFetch(`/crm/interactions?${query(params)}`, interactionListResponseSchema);
}

/**
 * `POST /crm/interactions` — görüşmeyi kaydeder ve İNDEKSLER.
 *
 * Yanıttaki `chunkCount` indekslemenin kanıtıdır; `0` ise görüşme kaydedilmiş
 * ama AI tarafından BULUNAMAZ durumdadır (ADR-0031 §4).
 */
export function createInteraction(
  body: CreateInteractionRequest,
): Promise<CreateInteractionResponse> {
  return apiFetch('/crm/interactions', createInteractionResponseSchema, { body });
}

/** `GET /crm/interactions/unindexed` — kaç görüşme ARANAMAZ durumda. */
export function countUnindexedInteractions(): Promise<UnindexedInteractionsResponse> {
  return apiFetch('/crm/interactions/unindexed', unindexedInteractionsResponseSchema);
}

/**
 * `POST /crm/reindex` — parçasız görüşmeleri onarır.
 *
 * PARA harcar (embedding çağrıları) ve görüşme oluşturmayla AYNI oran sınırı
 * kovasını kullanır.
 */
export function reindexInteractions(): Promise<ReindexInteractionsResponse> {
  return apiFetch('/crm/reindex', reindexInteractionsResponseSchema, { method: 'POST' });
}

/* ========================================================================== */
/* Müşteri özeti (ADR-0032)                                                   */
/* ========================================================================== */

/**
 * `GET /crm/companies/:id/summary` — ÜCRETSİZ okuma.
 *
 * Sayfa her açıldığında çağrılır ve model çağırmaz. Bu uç oran sınırına tabi
 * DEĞİLDİR; ücretli olsaydı müşteri sayfasına bakmak para harcamak olurdu.
 */
export function getCompanySummary(companyId: string): Promise<CompanySummary> {
  return apiFetch(`/crm/companies/${companyId}/summary`, companySummarySchema);
}

/**
 * `POST /crm/companies/:id/summary` — PARA harcayabilir.
 *
 * "Harcayabilir", çünkü israf freni devredeyse (kaynakların imzası
 * değişmemişse) model hiç çağrılmaz ve `regenerated: false` döner. Arayüz bu
 * ayrımı kullanıcıya göstermek zorundadır.
 *
 * 409 → başka bir istek şu anda üretiyor. 422 → özetlenecek görüşme yok.
 */
export function generateCompanySummary(companyId: string): Promise<GenerateCompanySummaryResponse> {
  return apiFetch(`/crm/companies/${companyId}/summary`, generateCompanySummaryResponseSchema, {
    method: 'POST',
  });
}
