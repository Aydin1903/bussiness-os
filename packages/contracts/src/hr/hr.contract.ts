import { z } from 'zod';

/**
 * IK / Personel uclari — api ↔ web paylasilan semalari (ADR-0043).
 *
 * ============================================================================
 * ⚠️ BU DOSYADA OLMAYAN DORT SEY — ve dordu de birer KARAR
 * ============================================================================
 *   1. **SERBEST NOT ALANI YOK** (§1.1). `notes` / `description` semasi
 *      KOPYALANMADI: bir IK kaydindaki serbest metne ILK YAZILACAK SEY SAGLIK
 *      BILGISIDIR ("raporlu", "ameliyat sonrasi yarim gun"). §3'un sinirini
 *      koyup yanina bos bir metin kutusu birakmak, siniri KULLANICIYA IHLAL
 *      ETTIRMEK olurdu.
 *   2. **UCRET ALANI CALISAN SEMASINDA YOK** (§4.2 katman 1). `Employee` tipi
 *      ucret TASIMAZ ve tasiyamaz — ucret AYRI bir semada, AYRI bir uctan,
 *      AYRI bir izinle (`compensation:read`) gelir. Olmayan bir alan
 *      yanlislikla ekrana basilamaz.
 *   3. **TC KIMLIK NO / EV ADRESI / DOGUM TARIHI / ACIL DURUM KISISI YOK**
 *      (§3.5). Olcut: "bir alan, v1'in bir ozelliginin CALISMASI icin gerekli
 *      degilse yazilmaz" (KVKK veri minimizasyonu).
 *   4. **`updateCompensation` / `deleteCompensation` SEMASI YOK** (§1.2).
 *      Defter EKLEME-YALNIZDIR: sunucuda uc yok, izin yok, veritabani yetkisi
 *      yok, entity'de metot yok; burada da sema yok.
 *
 * ⚠️ `role` KELIMESI BU DOSYADA GECMEZ. Bu projede `role` TEK BIR SEY
 * demektir: `owner` | `admin` | `member` | `viewer` (MT §7.5). Bir IK
 * kaydindaki "unvan" YETKI DEGIL, IS TANIMIDIR -> `jobTitle`.
 */

/** ISO-8601 an (ofsetli). */
const instant = z.iso.datetime({ offset: true });

/** TAKVIM GUNU — `YYYY-MM-DD`. */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * ⚠️ SERT KARAKTER SINIRLARI — TEK KAYNAK BURASIDIR.
 *
 * Sunucu bunlari `employee.entity.ts`ten alir; arayuzun de ayni sayilari
 * bilmesi gerekiyor (canli sayac + submit engeli). Iki tarafta ayri yazilsaydi
 * biri degistiginde digeri SESSIZCE ayrisirdi — kullanici formda "120/120,
 * tamam" gorur, sunucu 422 doner ve sebebini anlayamazdi.
 *
 * ⚠️ `MAX_JOB_TITLE_CHARS` bir BICIM kurali degil, §3'UN SINIRININ
 * TASIYICISIDIR: sinirsiz birakilsaydi kullanici unvan alanini bir NOT
 * ALANINA cevirirdi ("Muhasebe / raporlu, eylulde doner").
 */
export const MAX_EMPLOYEE_NAME_CHARS = 160;
export const MAX_JOB_TITLE_CHARS = 120;
export const MAX_EMPLOYEE_CONTACT_CHARS = 160;

export const employmentStatusSchema = z.enum(['active', 'ended']);
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;

export const compensationPeriodSchema = z.enum(['monthly', 'hourly', 'annual']);
export type CompensationPeriod = z.infer<typeof compensationPeriodSchema>;

/**
 * Calisan.
 *
 * ⚠️ `platformUserId` OPSIYONELDIR ve `null` YAYGINDIR: depo gorevlisinin,
 * saha ekibinin, sistemi hic kullanmayan calisanin hesabi YOKTUR (§2.1).
 * Zorunlu olsaydi veri modeli sirketi LISANS SATIN ALMAYA ZORLARDI.
 */
export const employeeSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  workEmail: z.string().nullable(),
  workPhone: z.string().nullable(),
  employmentStatus: employmentStatusSchema,
  startedOn: calendarDay.nullable(),
  endedOn: calendarDay.nullable(),
  platformUserId: z.uuid().nullable(),
  createdAt: instant,
  updatedAt: instant,
});
export type Employee = z.infer<typeof employeeSchema>;

export const employeeListResponseSchema = z.object({
  items: z.array(employeeSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

export const createEmployeeRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(MAX_EMPLOYEE_NAME_CHARS),
  jobTitle: z.string().trim().max(MAX_JOB_TITLE_CHARS).nullable().optional(),
  workEmail: z.string().trim().max(MAX_EMPLOYEE_CONTACT_CHARS).nullable().optional(),
  workPhone: z.string().trim().max(MAX_EMPLOYEE_CONTACT_CHARS).nullable().optional(),
  employmentStatus: employmentStatusSchema.optional(),
  startedOn: calendarDay.nullable().optional(),
  endedOn: calendarDay.nullable().optional(),
  platformUserId: z.uuid().nullable().optional(),
});
export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;

export const updateEmployeeRequestSchema = createEmployeeRequestSchema.partial();
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;

/**
 * Ucret kaydi.
 *
 * ⚠️ `amount` bir DIZEDIR ve oyle kalir — `number`a CEVRILMEZ (ADR-0034 §2c,
 * dorduncu kez). Bir kez cevrilse yuvarlama hatasi KALICI olurdu ve ciktisi
 * BIR MAAS RAKAMIDIR. Arayuz onu oldugu gibi basar: BINLIK AYRACI YOKTUR,
 * cunku bicimlendirmek `Number`a cevirmek demekti.
 */
export const compensationRecordSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  amount: z.string(),
  currency: z.string(),
  period: compensationPeriodSchema,
  effectiveFrom: calendarDay,
  recordedByUserId: z.uuid(),
  recordedAt: instant,
});
export type CompensationRecord = z.infer<typeof compensationRecordSchema>;

/**
 * Ucret gecmisi + GUNCEL ucret.
 *
 * ⚠️ `current` TURETILMISTIR (§1.5): `effectiveFrom <= bugun` olanlarin en
 * yenisi. GELECEK TARIHLI bir zam `items` icinde GORUNUR ama `current` OLMAZ —
 * ikisini karistirmak, bugunku maasi yanlis gostermek olurdu. Arayuz bu ayrimi
 * ACIKCA yazmak zorundadir.
 */
export const compensationHistoryResponseSchema = z.object({
  items: z.array(compensationRecordSchema),
  current: compensationRecordSchema.nullable(),
});
export type CompensationHistoryResponse = z.infer<typeof compensationHistoryResponseSchema>;

export const addCompensationRequestSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().length(3),
  period: compensationPeriodSchema.optional(),
  effectiveFrom: calendarDay,
});
export type AddCompensationRequest = z.infer<typeof addCompensationRequestSchema>;
