import { z } from 'zod';

import {
  MAX_ANNUAL_LEAVE_DAYS,
  MAX_CONTACT_CHARS,
  MAX_DEPARTMENT_CHARS,
  MAX_EMPLOYEE_NAME_CHARS,
  MAX_JOB_TITLE_CHARS,
} from '../domain/employee.entity';

/**
 * IK uclarinin girdi sozlesmeleri (ADR-0043).
 *
 * DEVELOPMENT_RULES 2.3: dis veri HER ZAMAN Zod ile dogrulanir.
 *
 * ============================================================================
 * ⚠️ BURADA BIR "NOT" ALANI YOKTUR VE EKLENMEYECEKTIR (ADR-0043 §1.1)
 * ============================================================================
 * Sekiz modulun sekizinde bir `notes`/`description` alani var. Burada YOK,
 * cunku bir IK kaydindaki serbest metne ILK YAZILACAK SEY SAGLIK BILGISIDIR
 * ("raporlu", "ameliyat sonrasi yarim gun").
 *
 * ⚠️ `.strict()` bunu MEKANIK olarak da korur: govdede `note` gonderen bir
 * istek 422 alir, sessizce yok sayilmaz. Sessiz yok sayma daha kotu olurdu —
 * kullanici yazdiginin kaydedildigini SANIRDI.
 *
 * ⚠️ TC kimlik no, ev adresi, dogum tarihi ve acil durum kisisi de YOKTUR
 * (§3.5). Olcut: "bir alan, v1'in bir ozelliginin CALISMASI icin gerekli
 * degilse yazilmaz" (KVKK veri minimizasyonu).
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** ⚠️ `role` DEGIL — bu projede `role` owner/admin/member/viewer demektir. */
const employmentStatus = z.enum(['active', 'ended']);

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biciminde olmali');

export const createEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(1).max(MAX_EMPLOYEE_NAME_CHARS),
    /** ⚠️ SERBEST METIN, enum degil: her sirketin unvan seti farklidir (§1.3). */
    jobTitle: z.string().trim().max(MAX_JOB_TITLE_CHARS).nullable().optional(),
    /** ⚠️ Adlar NITELENMIS: `email` denseydi arayuz KISISEL e-postayi kabul ederdi. */
    workEmail: z.string().trim().max(MAX_CONTACT_CHARS).nullable().optional(),
    workPhone: z.string().trim().max(MAX_CONTACT_CHARS).nullable().optional(),
    employmentStatus: employmentStatus.default('active'),
    startedOn: calendarDay.nullable().optional(),
    endedOn: calendarDay.nullable().optional(),
    /** ⚠️ Opsiyonel bag; `resolveMemberAccess` ile dogrulanir (§2.5). */
    platformUserId: z.uuid().nullable().optional(),

    // --- IK v2 (ADR-0044 §3) ---
    department: z.string().trim().max(MAX_DEPARTMENT_CHARS).nullable().optional(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'),
    workMode: z.enum(['office', 'remote', 'hybrid']).default('office'),
    /** ⚠️ Patronun alarm kalemi: yaklasan sozlesme bitisleri. */
    contractEndsOn: calendarDay.nullable().optional(),
    /**
     * ⚠️ HAK EDIS BIR SAYIDIR, BIR MEVZUAT KURALI DEGIL (§2.2). Sistem
     * kidemden hak edis HESAPLAMAZ — ulkeye ozel mevzuat cekirdege girmez.
     */
    annualLeaveDays: z.coerce.number().int().min(0).max(MAX_ANNUAL_LEAVE_DAYS).default(0),
    /** ⚠️ Kendine referans; dongu VERITABANINDA engellenmez (§3.1). */
    managerEmployeeId: z.uuid().nullable().optional(),
  })
  .strict();

export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

/**
 * KISMI guncelleme.
 *
 * ⚠️ `undefined` = dokunma, `null` = temizle. `PUT` secilseydi unutulan her
 * alan sessizce varsayilanina duserdi — bir IK kaydinda bu, iletisim
 * bilgisinin kaybolmasi demekti.
 */
export const updateEmployeeSchema = createEmployeeSchema.partial().strict();

export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

/**
 * Liste sorgusu.
 *
 * ============================================================================
 * ⚠️ BIR `sort` PARAMETRESI YOKTUR — VE OZELLIKLE MAASA GORE YOK (§4.2)
 * ============================================================================
 * Gerekce ince: bir deger DONMESE BILE siralamanin kendisi bilgi sizdirir —
 * iki istekle butun ekibin ucret siralamasi cikarilirdi. Hata SESSIZ olurdu:
 * hicbir alan gorunmez, bilgi yine de akar.
 *
 * ⚠️ `.strict()` bunu zorlar: `?sort=amount` gonderen bir istek 422 alir.
 * Siralama SUNUCUDA SABITTIR (ad, alfabetik).
 */
export const listEmployeesSchema = z
  .object({
    status: employmentStatus.optional(),
    /** IK v2 — ekip bazli filtre. */
    department: z.string().trim().min(1).max(MAX_DEPARTMENT_CHARS).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListEmployeesQueryDto = z.infer<typeof listEmployeesSchema>;

/**
 * Ucret kaydi.
 *
 * ⚠️ `amount` hem `string` hem `number` kabul eder (JSON'da ondalik tip
 * yoktur) ama domain onu KANONIK BIR DIZEYE cevirir ve hicbir noktada
 * `number` olarak SAKLANMAZ (ADR-0034 §2c, dorduncu kez).
 *
 * ⚠️ `effectiveFrom` GELECEK TARIHLI olabilir: gelecek ayin zammi bugunden
 * yazilir (§1.5). Bir "gecmis olmali" kisiti YOKTUR ve konmamalidir.
 */
export const addCompensationSchema = z
  .object({
    amount: z.union([z.string().trim().min(1), z.number()]),
    currency: z.string().trim().length(3),
    period: z.enum(['monthly', 'hourly', 'annual']).default('monthly'),
    effectiveFrom: calendarDay,
  })
  .strict();

export type AddCompensationDto = z.infer<typeof addCompensationSchema>;

/** Yol parametresi — rota golgelemesi riskine karsi (ADR-0040'in dersi). */
export const employeeIdParamSchema = z.object({ employeeId: z.uuid() }).strict();

// ============================================================================
// IK v2 — izin takibi (ADR-0044 §2)
// ============================================================================

/**
 * ⚠️ BU SEMADA "SEBEP" ALANI YOKTUR ve `type` icinde `sick`/`raporlu` YOKTUR.
 *
 * Ikisi de ADR-0043 §3'un saglik verisi sinirinin TASIYICISIDIR: bir izin
 * kaydinin en dogal alani "sebep"tir ve oraya ILK YAZILACAK SEY "RAPORLU"DUR.
 *
 * ⚠️ `.strict()` bunu MEKANIK de korur: govdede `reason` gonderen bir istek
 * 422 alir, SESSIZCE yok sayilmaz.
 */
export const createLeaveRequestSchema = z
  .object({
    type: z.enum(['annual', 'unpaid', 'excuse', 'administrative']),
    startsOn: calendarDay,
    endsOn: calendarDay,
  })
  .strict();

export type CreateLeaveRequestDto = z.infer<typeof createLeaveRequestSchema>;

/** ⚠️ `pending`e GERI DONULEMEZ: karara baglanmis izin yeniden karara baglanmaz. */
export const decideLeaveRequestSchema = z
  .object({ status: z.enum(['approved', 'rejected']) })
  .strict();

export type DecideLeaveRequestDto = z.infer<typeof decideLeaveRequestSchema>;

export const listLeaveSchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    employeeId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListLeaveQueryDto = z.infer<typeof listLeaveSchema>;

export const leaveIdParamSchema = z.object({ leaveId: z.uuid() }).strict();
