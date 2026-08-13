import { z } from 'zod';

/**
 * Randevu modülü uçları — api ↔ web paylaşılan şemaları (ADR-0035).
 *
 * ============================================================================
 * ⚠️ `scheduledAt` BİR ANDIR — takvim günü DEĞİL
 * ============================================================================
 * Önceki üç modülün tarih alanları (`nextFollowUpOn`, `dueOn`, `occurredOn`)
 * PG `date`ti ve `YYYY-MM-DD` taşıyordu; dilim dönüşümüne SOKULMUYORLARDI.
 * Randevu bunun TERSİDİR: 14:30'daki bir buluşmayı günle temsil etmek modülün
 * var oluş sebebini yok eder (ADR-0035 §2c).
 *
 * Sunucu UTC ISO-8601 döndürür; **çevrimi istemci yapar** (tarayıcının kendi
 * dilimi). Tek şehirde çalışan bir işletme için bu doğru davranır; çok bölgeli
 * bir tenant için YANLIŞ görünür ve tenant bazlı saat dilimi ayrı bir karardır.
 *
 * ============================================================================
 * `contactName` NULLABLE VE ÜÇ ANLAMA GELİR
 * ============================================================================
 * Randevu bir kişiye bağlı değildir, kişi silinmiştir (sarkan işaretçi —
 * ADR-0035 §4), ya da çağıran `contact:read` taşımıyordur. Sunucu üçünü AYIRT
 * ETMEZ ve istemci de etmemelidir: arayüz hiçbir şey yazmaz — "silinmiş" bile
 * yazmaz, çünkü o kelime bir kaydın BİR ZAMANLAR VAR OLDUĞUNU sızdırırdı.
 */

/**
 * ⚠️ SERVİS NOTUNUN SERT SINIRI — TEK KAYNAK BURASIDIR.
 *
 * ============================================================================
 * NEDEN `contracts`TA, İKİ TARAFTA AYRI AYRI DEĞİL
 * ============================================================================
 * Sunucu bu sınırı `appointment.entity.ts`te `TARGET_CHUNK_CHARS`tan türetir
 * (bu modülde chunking YOKTUR, dolayısıyla notun TAMAMI bir parçanın
 * büyüklüğünde kalmak zorundadır — ADR-0035 §3d).
 *
 * Arayüzün de aynı sayıyı bilmesi gerekiyor: canlı karakter sayacı ve submit
 * engeli ona dayanıyor. İki tarafta ayrı ayrı yazılsaydı biri değiştiğinde
 * diğeri SESSİZCE ayrışırdı — kullanıcı formda "1250/1250, tamam" görür,
 * sunucu 422 döner ve neden reddedildiğini anlayamazdı.
 *
 * ⚠️ Sunucu tarafında bir test bu sabitin `MAX_SERVICE_NOTE_CHARS` ile AYNI
 * olduğunu kilitler (`appointment.entity.spec.ts`). Ayrışma derlemede değil,
 * testte kırmızı yanar.
 */
export const MAX_SERVICE_NOTE_CHARS = 1250;

/** Sürenin üst sınırı — backend `appointments.dto.ts` ile aynı (24 saat). */
export const MAX_DURATION_MINUTES = 1440;

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

export const appointmentStatusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'no_show']);

export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/**
 * Ekranda gösterilecek Türkçe karşılıklar.
 *
 * ⚠️ Veri modeli İNGİLİZCE, arayüz TÜRKÇE — `DIRECTION_LABELS` /
 * `PROJECT_STATUS_LABELS` ile aynı ayrım.
 *
 * ⚠️ `no_show` "İptal" DEĞİL "Gelmedi"dir ve bu ayrım ekranda da korunur:
 * iptal bir HABERDİR, gelmemek bir KAYIPTIR (ADR-0035 §2b). İkisini tek
 * etikette birleştirmek, yapısal katkıcının okuduğu sinyali kullanıcıdan
 * gizlerdi.
 */
export const APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  scheduled: 'Planlandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  no_show: 'Gelmedi',
};

export const appointmentSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  crmContactId: z.uuid().nullable(),
  serviceNote: z.string().nullable(),
  scheduledAt: instant,
  durationMinutes: z.number().int().positive(),
  status: appointmentStatusSchema,
  createdByUserId: z.string(),
  createdAt: instant,
  updatedAt: instant,
});

export type Appointment = z.infer<typeof appointmentSchema>;

/** Liste satırı — `Appointment` + ÇÖZÜLMÜŞ kişi adı (üç anlamı için bkz. üst). */
export const appointmentRowSchema = appointmentSchema.extend({
  contactName: z.string().nullable(),
});

export type AppointmentRow = z.infer<typeof appointmentRowSchema>;

export const appointmentListResponseSchema = z.object({
  items: z.array(appointmentRowSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type AppointmentListResponse = z.infer<typeof appointmentListResponseSchema>;

export const createAppointmentRequestSchema = z.object({
  scheduledAt: instant,
  durationMinutes: z.number().int().min(1).max(MAX_DURATION_MINUTES),
  status: appointmentStatusSchema.optional(),
  contactId: z.uuid().nullish(),
  serviceNote: z.string().max(MAX_SERVICE_NOTE_CHARS).nullish(),
});

export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

/** ⚠️ `null` = TEMİZLE, alan yok = DOKUNMA (ADR-0035 §4, §5). */
export const updateAppointmentRequestSchema = z.object({
  scheduledAt: instant.optional(),
  durationMinutes: z.number().int().min(1).max(MAX_DURATION_MINUTES).optional(),
  status: appointmentStatusSchema.optional(),
  contactId: z.uuid().nullable().optional(),
  serviceNote: z.string().max(MAX_SERVICE_NOTE_CHARS).nullable().optional(),
});

export type UpdateAppointmentRequest = z.infer<typeof updateAppointmentRequestSchema>;

export const reindexAppointmentsResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type ReindexAppointmentsResponse = z.infer<typeof reindexAppointmentsResponseSchema>;
