import {
  employeeLeaveResponseSchema,
  hrOverviewSchema,
  leaveListResponseSchema,
  leaveRequestSchema,
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
  type CreateLeaveRequest,
  type DecideLeaveRequest,
  type EmployeeLeaveResponse,
  type HrOverview,
  type LeaveListResponse,
  type LeaveRequest,
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
  department?: string;
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

// ============================================================================
// IK v2 — izin takibi (ADR-0044 §2)
// ============================================================================
//
// ⚠️ BU BOLUMDE `deleteLeave` YOKTUR: reddedilen bir izin `rejected` olur,
// silinmez (§6). Sunucuda uc yok, `leave:delete` izni yok; burada da fonksiyon
// yok. Olmayan bir fonksiyon yanlislikla cagrilamaz.
//
// ⚠️ `createLeave` govdesinde SEBEP ALANI YOKTUR ve tur listesinde
// `sick`/`raporlu` YOKTUR — ikisi de ADR-0043 §3'un saglik verisi sinirinin
// TASIYICISIDIR. Sunucu `.strict()` ile `reason` gonderen istegi 422 reddeder.

/** Odanin duvari — ⚠️ bu sayilar EKRANA gider, `POST /ask` havuzuna GITMEZ. */
export function getHrOverview(): Promise<HrOverview> {
  return apiFetch('/hr/overview', hrOverviewSchema);
}

export function listLeave(params: {
  limit: number;
  offset: number;
  status?: 'pending' | 'approved' | 'rejected';
  employeeId?: string;
}): Promise<LeaveListResponse> {
  return apiFetch(`/hr/leave?${query(params)}`, leaveListResponseSchema);
}

/**
 * Bir calisanin izin gecmisi + BAKIYESI.
 *
 * ⚠️ Bakiye TURETILMISTIR (§2.3) ve NEGATIF olabilir — hak edisinden fazla
 * izin kullanmis bir calisan gercek bir durumdur ve gizlenmemelidir.
 */
export function getEmployeeLeave(employeeId: string): Promise<EmployeeLeaveResponse> {
  return apiFetch(`/hr/employees/${employeeId}/leave`, employeeLeaveResponseSchema);
}

export function createLeave(employeeId: string, body: CreateLeaveRequest): Promise<LeaveRequest> {
  return apiFetch(`/hr/employees/${employeeId}/leave`, leaveRequestSchema, { body });
}

/**
 * Onaylar ya da reddeder.
 *
 * ⚠️ KARARA BAGLANMIS BIR IZIN YENIDEN KARARA BAGLANAMAZ (409): bir onayin
 * sessizce geri alinmasi "kim onayladi" sorusunun cevabini DEGISTIRIRDI.
 * Fikir degisirse dogru yol YENI BIR TALEPTIR.
 */
export function decideLeave(leaveId: string, body: DecideLeaveRequest): Promise<LeaveRequest> {
  return apiFetch(`/hr/leave/${leaveId}`, leaveRequestSchema, { method: 'PATCH', body });
}
