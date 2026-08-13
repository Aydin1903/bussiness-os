import {
  appointmentListResponseSchema,
  appointmentSchema,
  reindexAppointmentsResponseSchema,
  type Appointment,
  type AppointmentListResponse,
  type AppointmentStatus,
  type CreateAppointmentRequest,
  type ReindexAppointmentsResponse,
  type UpdateAppointmentRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

/**
 * Randevu uçları (ADR-0035 §9).
 *
 * `finance.ts` / `projects.ts` ile aynı desen: her yanıt şemayla DOĞRULANIR,
 * sorgu dizesi tek bir yardımcıdan üretilir ve `undefined` parametreler düşer.
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

/**
 * Takvim penceresi + durum filtresi.
 *
 * ⚠️ `from` DAHİL, `to` HARİÇ (`>= from` ve `< to`) — önceki üç modülün "ikisi
 * de dahil" kuralından SAPAN tek okuma davranışı. Haftalık grid "pazartesi
 * 00:00'dan gelecek pazartesi 00:00'a" diye sorar; `<=` olsaydı sınırdaki bir
 * kayıt İKİ HAFTADA DA görünürdü.
 */
export function listAppointments(params: {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  status?: AppointmentStatus;
}): Promise<AppointmentListResponse> {
  return apiFetch(`/appointments?${query(params)}`, appointmentListResponseSchema);
}

export function createAppointment(body: CreateAppointmentRequest): Promise<Appointment> {
  return apiFetch('/appointments', appointmentSchema, { body });
}

/** ⚠️ Gövdede `null` = TEMİZLE, alan yok = DOKUNMA (ADR-0035 §4, §5). */
export function updateAppointment(
  id: string,
  body: UpdateAppointmentRequest,
): Promise<Appointment> {
  return apiFetch(`/appointments/${id}`, appointmentSchema, { method: 'PATCH', body });
}

export function deleteAppointment(id: string): Promise<void> {
  return apiSend(`/appointments/${id}`, { method: 'DELETE' });
}

/** Vektörü eksik NOTLU randevuları onarır — oran sınırı yazma yoluyla ORTAK. */
export function reindexAppointments(): Promise<ReindexAppointmentsResponse> {
  return apiFetch('/appointments/reindex', reindexAppointmentsResponseSchema, { body: {} });
}
