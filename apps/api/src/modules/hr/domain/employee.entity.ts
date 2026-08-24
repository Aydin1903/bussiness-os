import { assertHrCalendarDay } from './compensation-money';
import {
  BlankEmployeeNameError,
  HrFieldTooLongError,
  InvalidAnnualLeaveDaysError,
  InconsistentEmploymentStatusError,
  InvalidEmploymentDatesError,
} from './hr.error';

/**
 * ⚠️ SERT karakter sinirlari — ve bunlar bir BICIM kurali degil, §3'un
 * SINIRININ TASIYICISIDIR.
 *
 * Bu modulde SERBEST NOT ALANI YOKTUR (ADR-0043 §1.1) cunku bir IK kaydindaki
 * serbest metne ilk yazilacak sey SAGLIK BILGISIDIR. Ama `job_title` sinirsiz
 * birakilsaydi kullanici onu bir not alanina CEVIRIRDI ("Muhasebe / raporlu,
 * eylulde doner") ve sinir dolayli olarak ihlal edilirdi.
 *
 * 120 karakter bir unvan icin genis ("Kidemli Muhasebe Uzmani — Finansal
 * Raporlama"), bir PARAGRAF icin degil.
 */
export const MAX_EMPLOYEE_NAME_CHARS = 160;
export const MAX_JOB_TITLE_CHARS = 120;
export const MAX_CONTACT_CHARS = 160;

/** ⚠️ `role` DEGIL — bkz. `EmployeeFields.jobTitle`. */
export type EmploymentStatus = 'active' | 'ended';

/** IK v2 (ADR-0044 §3) — kadro gorunumu. */
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';

/** IK v2 — IK'nin en cok sorulan alani. */
export type WorkMode = 'office' | 'remote' | 'hybrid';

/** ⚠️ Hak edisin ust siniri — bir yilda 365 gunden fazla izin olamaz. */
export const MAX_ANNUAL_LEAVE_DAYS = 365;
export const MAX_DEPARTMENT_CHARS = 80;

export interface EmployeeFields {
  readonly fullName: string;

  /**
   * ⚠️ UNVAN — `role` KELIMESI BU MODULDE KULLANILMAZ (ADR-0043 §1.3).
   *
   * Bu projede `role` TEK BIR SEY demektir: `owner` | `admin` | `member` |
   * `viewer` (MT §7.5, ADR-0025). Bir IK kaydindaki "unvan" ise "Kidemli
   * Muhasebe Uzmani"dir — YETKI DEGIL, IS TANIMI.
   *
   * ⚠️ Ikisi ayni kelimeyle adlandirilsaydi hata SESSIZ VE TEHLIKELI olurdu:
   * bir gun birisi `employee.role`a bakip YETKI KARARI verir, ya da
   * `membership.role`u ekranda "unvan" diye gosterirdi. Ikisi de tip hatasi
   * uretmez.
   *
   * SERBEST METIN, enum DEGIL: her sirketin unvan seti farklidir.
   */
  readonly jobTitle: string | null;

  /** ⚠️ IS e-postasi. Ad bilerek NITELENMIS (§3.5). */
  readonly workEmail: string | null;
  /** ⚠️ IS telefonu. */
  readonly workPhone: string | null;

  readonly employmentStatus: EmploymentStatus;
  readonly startedOn: string | null;
  readonly endedOn: string | null;

  /**
   * ⚠️ OPSIYONEL platform kullanicisi bagi (§2.5).
   *
   * `null` MESRUDUR ve YAYGINDIR: depo gorevlisinin, saha ekibinin, sistemi
   * hic kullanmayan calisanin hesabi YOKTUR. Zorunlu olsaydi veri modeli
   * sirketi LISANS SATIN ALMAYA ZORLARDI.
   *
   * Dogrulama entity'de DEGIL use case'tedir: bir uyelik kontrolu bir DIS
   * OKUMADIR (`tenant.public.ts`) ve domain katmani I/O yapamaz.
   */
  readonly platformUserId: string | null;

  // --- IK v2 (ADR-0044 §3) — bes alan, her biri §3.5'in olcutunden gecti ---

  /** Ekip bazli filtre + patronun "hangi ekip ne kadar" sorusu. */
  readonly department: string | null;
  readonly employmentType: EmploymentType;
  readonly workMode: WorkMode;
  /** ⚠️ Patronun alarm kalemi: yaklasan sozlesme bitisleri. */
  readonly contractEndsOn: string | null;
  /**
   * ⚠️ HAK EDIS BIR MEVZUAT KURALI DEGIL, BIR SAYIDIR (ADR-0044 §2.2).
   *
   * Turkiye'de kidemle degisir (14/20/26) ama bu ULKEYE OZEL MEVZUATTIR ve
   * ulke degisince bastan yazilir. Sistem carpar ve cikarir, KURAL BILMEZ.
   */
  readonly annualLeaveDays: number;
  /**
   * ⚠️ KENDINE REFERANS — "kime bagli". Dongu (A -> B -> A) veritabaninda
   * ENGELLENMEZ (ADR-0044 §3.1): kontrol ozyinelemeli sorgu ister ve her
   * yazmada calisirdi. Yalnizca EN KISA dongu (kendisi = yoneticisi) hem
   * burada hem CHECK ile engellenir.
   */
  readonly managerEmployeeId: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<EmployeeFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Ayrim anlamlidir:
 * `undefined` = dokunma, `null` = temizle.
 */
export type EmployeePatch = {
  readonly [K in keyof EmployeeFields]?: EmployeeFields[K] | undefined;
};

export interface EmployeeState extends EmployeeFields {
  readonly id: string;
  readonly tenantId: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * ⚠️ DENETLENEN ALANLAR — `platform.audit_log`a hangi alan adlarinin
 * yazilacagini belirleyen TEK liste (ADR-0043 §6.3).
 *
 * ⚠️ Kolon adlari (snake_case) kullanilir, TS alan adlari degil: denetim kaydi
 * VERITABANI gercegini anlatir ve okuyan kisi ekranda degil semada arar.
 *
 * ⚠️ Bu listeye bir alan EKLENMEZSE degisikligi SESSIZCE izlenmez. Bir birim
 * testi listeyi `EmployeeFields`in anahtarlariyla karsilastirir — yani yeni
 * bir alan eklendiginde test KIRMIZI yanar ve ekleyeni "bu alan denetlenmeli
 * mi" sorusunu cevaplamaya zorlar.
 */
export interface AuditedField {
  readonly key: keyof EmployeeFields;
  /** ⚠️ KOLON adi (snake_case) — TS alan adi degil. */
  readonly column: string;
}

export const AUDITED_EMPLOYEE_FIELDS: readonly AuditedField[] = [
  { key: 'fullName', column: 'full_name' },
  { key: 'jobTitle', column: 'job_title' },
  { key: 'workEmail', column: 'work_email' },
  { key: 'workPhone', column: 'work_phone' },
  { key: 'employmentStatus', column: 'employment_status' },
  { key: 'startedOn', column: 'started_on' },
  { key: 'endedOn', column: 'ended_on' },
  { key: 'platformUserId', column: 'platform_user_id' },
  // --- IK v2 (ADR-0044 §3) ---
  // ⚠️ Bes yeni alan da DENETLENIR. Listeye eklenmeselerdi degisiklikleri
  // SESSIZCE izlenmezdi; bir birim testi listeyi `EmployeeFields` ile
  // karsilastirdigi icin bu satirlar unutulamaz.
  { key: 'department', column: 'department' },
  { key: 'employmentType', column: 'employment_type' },
  { key: 'workMode', column: 'work_mode' },
  { key: 'contractEndsOn', column: 'contract_ends_on' },
  { key: 'annualLeaveDays', column: 'annual_leave_days' },
  { key: 'managerEmployeeId', column: 'manager_employee_id' },
];

export class Employee {
  private constructor(private readonly state: EmployeeState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: EmployeeFields;
    now: Date;
  }): Employee {
    return new Employee({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: EmployeeState): Employee {
    return new Employee(state);
  }

  /**
   * KISMI guncelleme.
   *
   * `undefined` = "dokunma". `PUT` secilseydi unutulan her alan sessizce
   * varsayilanina duserdi — bir IK kaydinda bu, iletisim bilgisinin
   * kaybolmasi demekti.
   *
   * ⚠️ MAAS BURADAN DEGISTIRILEMEZ ve bu, §4.2'nin BIRINCI izolasyon
   * katmaninin domain karsiligidir: `EmployeeFields`ta ucret alani YOKTUR.
   * Ucret yalnizca `hr.compensation_records`a YENI BIR SATIR yazilarak degisir.
   */
  update(changes: EmployeePatch, now: Date): Employee {
    const current = this.state;

    const merged: EmployeeFields = {
      fullName: changes.fullName ?? current.fullName,
      // ⚠️ `??` DEGIL: `null` = TEMIZLE ve mesrudur. `changes.x ?? current.x`
      // yazilsaydi `null` gonderen bir istek SESSIZCE yok sayilirdi.
      jobTitle: pick(changes.jobTitle, current.jobTitle),
      workEmail: pick(changes.workEmail, current.workEmail),
      workPhone: pick(changes.workPhone, current.workPhone),
      employmentStatus: changes.employmentStatus ?? current.employmentStatus,
      startedOn: pickDate(changes.startedOn, current.startedOn),
      endedOn: pickDate(changes.endedOn, current.endedOn),
      platformUserId:
        changes.platformUserId === undefined ? current.platformUserId : changes.platformUserId,
      department: pick(changes.department, current.department),
      employmentType: changes.employmentType ?? current.employmentType,
      workMode: changes.workMode ?? current.workMode,
      contractEndsOn: pickDate(changes.contractEndsOn, current.contractEndsOn),
      annualLeaveDays: changes.annualLeaveDays ?? current.annualLeaveDays,
      managerEmployeeId:
        changes.managerEmployeeId === undefined
          ? current.managerEmployeeId
          : changes.managerEmployeeId,
    };

    return new Employee({ ...current, ...normalize(merged), updatedAt: now });
  }

  /**
   * Iki durum arasinda DEGISEN ALANLARIN adlarini dondurur — DEGERLERINI DEGIL.
   *
   * ==========================================================================
   * ⚠️ BU METOT DENETIM IZININ TEK BESLEYICISIDIR (ADR-0043 §6.5)
   * ==========================================================================
   * Donen sey bir ADLAR listesidir. Bir gun birisi buradan `{ field, before,
   * after }` dondurmek isterse, `platform.audit_log`ta yazacak bir kolon
   * BULAMAZ (Slice 1'de bilerek yok) — yani sinir iki yerde birden korunur.
   *
   * ⚠️ Ilk tuketici IK'dir ve degisen alanlardan biri MAAS DEGILDIR (ucret bu
   * entity'de yasamaz) — ama `work_phone` ve `full_name` KISISEL VERIDIR ve
   * eski degerlerini bir denetim tablosuna kopyalamak, KVKK envanterini
   * sessizce buyutmek olurdu.
   */
  changedFieldsFrom(previous: Employee): string[] {
    const before = previous.state;
    const after = this.state;

    return AUDITED_EMPLOYEE_FIELDS.filter((field) => before[field.key] !== after[field.key]).map(
      (field) => field.column,
    );
  }

  toState(): EmployeeState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: EmployeeFields): EmployeeFields {
  const fullName = fields.fullName.trim();
  if (fullName === '') {
    throw new BlankEmployeeNameError();
  }
  assertLength('Calisan adi', fullName, MAX_EMPLOYEE_NAME_CHARS);

  const jobTitle = blankToNull(fields.jobTitle);
  const workEmail = blankToNull(fields.workEmail);
  const workPhone = blankToNull(fields.workPhone);

  // ⚠️ Kontroller `blankToNull`DAN SONRA: bosluklarla sisirilmis bir metin,
  // kirpildiktan sonraki GERCEK uzunluguyla olculur.
  if (jobTitle !== null) assertLength('Unvan', jobTitle, MAX_JOB_TITLE_CHARS);
  if (workEmail !== null) assertLength('Is e-postasi', workEmail, MAX_CONTACT_CHARS);
  if (workPhone !== null) assertLength('Is telefonu', workPhone, MAX_CONTACT_CHARS);

  const startedOn = fields.startedOn === null ? null : assertHrCalendarDay(fields.startedOn);
  const endedOn = fields.endedOn === null ? null : assertHrCalendarDay(fields.endedOn);

  // ==========================================================================
  // ⚠️ DURUM VE AYRILMA TARIHI BIRLIKTE TUTARLI OLMALI
  // ==========================================================================
  // Veritabaninda da bir CHECK var; buradaki kontrol onun YERINE degil
  // ONCESINDEDIR — kullanici ham bir kisit adi degil, anlamli bir mesaj gorur.
  if (fields.employmentStatus === 'ended' && endedOn === null) {
    throw new InconsistentEmploymentStatusError('ended-without-date');
  }

  if (fields.employmentStatus === 'active' && endedOn !== null) {
    throw new InconsistentEmploymentStatusError('active-with-date');
  }

  if (startedOn !== null && endedOn !== null && endedOn < startedOn) {
    throw new InvalidEmploymentDatesError();
  }

  const department = blankToNull(fields.department);
  if (department !== null) assertLength('Departman', department, MAX_DEPARTMENT_CHARS);

  const contractEndsOn =
    fields.contractEndsOn === null ? null : assertHrCalendarDay(fields.contractEndsOn);

  if (
    !Number.isInteger(fields.annualLeaveDays) ||
    fields.annualLeaveDays < 0 ||
    fields.annualLeaveDays > MAX_ANNUAL_LEAVE_DAYS
  ) {
    throw new InvalidAnnualLeaveDaysError(fields.annualLeaveDays);
  }

  return {
    fullName,
    jobTitle,
    workEmail,
    workPhone,
    employmentStatus: fields.employmentStatus,
    startedOn,
    endedOn,
    platformUserId: fields.platformUserId,
    department,
    employmentType: fields.employmentType,
    workMode: fields.workMode,
    contractEndsOn,
    annualLeaveDays: fields.annualLeaveDays,
    managerEmployeeId: fields.managerEmployeeId,
  };
}

function assertLength(field: string, value: string, max: number): void {
  if (value.length > max) {
    throw new HrFieldTooLongError(field, value.length, max);
  }
}

/** Bos dizeler `null`a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** `undefined` = dokunma, `null`/bos = temizle. */
function pick(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}

/** Tarihlerde bos dize `null` demektir; bicim dogrulamasi `normalize`da. */
function pickDate(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}
