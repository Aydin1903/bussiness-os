import {
  compensationHistoryResponseSchema,
  compensationRecordSchema,
  employeeListResponseSchema,
  employeeSchema,
  type AddCompensationRequest,
  type CompensationHistoryResponse,
  type CompensationRecord,
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeListResponse,
  type UpdateEmployeeRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * İK / Personel uçları (ADR-0043) — YEDİ uç.
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN İKİ ŞEY
 * ============================================================================
 *   1. `updateCompensation` / `deleteCompensation` YOK — defter
 *      EKLEME-YALNIZDIR (§1.2). Sunucuda uç yok, izin yok, veritabanı yetkisi
 *      yok (`GRANT SELECT, INSERT`), entity'de metot yok; burada da fonksiyon
 *      yok. Olmayan bir fonksiyon yanlışlıkla çağrılamaz.
 *   2. Maaşa göre SIRALAMA/FİLTRELEME parametresi YOK (§4.2) — ve bu, bir
 *      değerin dönmemesinden AYRI bir karardır: sıralamanın kendisi bilgi
 *      sızdırır, iki istekle bütün ekibin ücret sıralaması çıkarılırdı.
 *      Sunucu `?sort=amount` gönderen isteği 422 ile reddeder (`.strict()`).
 */

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

// ============================================================================
// Çalışan
// ============================================================================

export function listEmployees(params: {
  limit: number;
  offset: number;
  status?: 'active' | 'ended';
  search?: string;
}): Promise<EmployeeListResponse> {
  return apiFetch(`/hr/employees?${query(params)}`, employeeListResponseSchema);
}

export function getEmployee(id: string): Promise<Employee> {
  return apiFetch(`/hr/employees/${id}`, employeeSchema);
}

export function createEmployee(body: CreateEmployeeRequest): Promise<Employee> {
  return apiFetch('/hr/employees', employeeSchema, { body });
}

export function updateEmployee(id: string, body: UpdateEmployeeRequest): Promise<Employee> {
  return apiFetch(`/hr/employees/${id}`, employeeSchema, { method: 'PATCH', body });
}

export function deleteEmployee(id: string): Promise<void> {
  return apiSend(`/hr/employees/${id}`, { method: 'DELETE' });
}

// ============================================================================
// ⚠️ ÜCRET — AYRI UÇ, AYRI İZİN (§4.2 katman 2)
// ============================================================================
//
// ⚠️ BU İKİ FONKSİYON YALNIZCA `canReadCompensation(role)` DOĞRUYKEN
// ÇAĞRILIR (`lib/config/hr.ts`). Çağrı, izinsiz kullanıcı için HİÇ YAPILMAZ —
// 403 alıp yutmak DEĞİL, hiç istememek. Gerekçe orada yazılı.

export function getCompensation(employeeId: string): Promise<CompensationHistoryResponse> {
  return apiFetch(`/hr/employees/${employeeId}/compensation`, compensationHistoryResponseSchema);
}

/**
 * Ücret kaydı ekler.
 *
 * ⚠️ GERİ ALMA / SİLME YOKTUR ve bu bir eksik değil: defterin
 * değiştirilemezliği §6.2'ye göre DENETİM İZİNİN TA KENDİSİDİR. Yanlış
 * girilen bir tutar DÜZELTİLMEZ — doğru tutarla YENİ bir yürürlük tarihi
 * yazılır. Aynı güne ikinci kayıt 409 döner.
 */
export function addCompensation(
  employeeId: string,
  body: AddCompensationRequest,
): Promise<CompensationRecord> {
  return apiFetch(`/hr/employees/${employeeId}/compensation`, compensationRecordSchema, {
    body,
  });
}
