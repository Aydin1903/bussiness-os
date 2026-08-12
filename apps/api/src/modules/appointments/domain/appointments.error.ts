/** Randevu domain hatalari (ADR-0035). */
export abstract class AppointmentsDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Gecersiz randevu durumu.
 *
 * Sozluk hem kodda (`APPOINTMENT_STATUSES`) hem migration `0026`'nin
 * `appointments_status_valid` CHECK'inde yazilidir. Bu hata, uygulama
 * katmanindan gecen istekler icin ANLASILIR bir mesaj uretir; CHECK ise
 * uygulamayi ATLAYAN yollari baglar.
 */
export class InvalidAppointmentStatusError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENT_STATUS_INVALID';
  constructor(status: string) {
    super(`Gecersiz randevu durumu: ${status}`);
  }
}

/**
 * Sure pozitif olmali.
 *
 * ⚠️ Mesaj KURALI soyler, yalnizca "gecersiz" demez. Sifir sure gonderen bir
 * istemci genellikle "sure bilinmiyor" demek istiyordur ve dogru cevap sifir
 * degil, makul bir varsayilandir — mesaj bunu ima eder.
 *
 * Ust sinir BURADA DEGIL, DTO'dadir (gerekce `appointments.dto.ts`'te).
 */
export class InvalidAppointmentDurationError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENT_DURATION_INVALID';
  constructor(minutes: number) {
    super(`Gecersiz sure: ${String(minutes)} dakika. Sure SIFIRDAN BUYUK bir tam sayi olmali.`);
  }
}

/**
 * `scheduledAt` gecerli bir an degil.
 *
 * ============================================================================
 * NEDEN AYRI BIR HATA — `Date` ZATEN TIP OLARAK GECERLI GORUNUR
 * ============================================================================
 * JavaScript'te `new Date('2026-02-31T99:00:00Z')` PATLAMAZ, `Invalid Date`
 * doner ve tipi hala `Date`tir. Kontrol edilmezse bu deger veritabanina kadar
 * gider ve PostgreSQL onu reddeder — kullanici 422 yerine 500 alirdi.
 *
 * ⚠️ Zod kalibi dogrular (ISO 8601), GERCEKLIGI dogrulamaz; ayrim
 * `finance.dto.ts`'in `calendarDay` yorumundaki ile birebir aynidir.
 */
export class InvalidScheduledAtError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENT_SCHEDULED_AT_INVALID';
  constructor(value: string) {
    super(`Gecersiz randevu zamani: ${value}. ISO 8601 bicimli gercek bir an bekleniyor.`);
  }
}

/**
 * Kayit bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS, baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner
 * ve buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini,
 * `TransactionNotFoundError` / `ProjectNotFoundError` ile ayni gerekce).
 */
export class AppointmentNotFoundError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENT_NOT_FOUND';
  constructor() {
    super('Randevu bulunamadi.');
  }
}

/**
 * Randevu, gorulemeyen bir KISIYE baglanamaz (ADR-0035 §4).
 *
 * ============================================================================
 * UC DURUM AYIRT EDILMEZ — bilincli
 * ============================================================================
 * "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" AYNI hatayi
 * verir; `ContactDirectory` ucunu de haritada YOK olarak dondurur. Ayirmak,
 * reddin sebebinden o kisinin VAR OLDUGUNU cikarilabilmesi demekti.
 *
 * `ProjectCompanyNotFoundError` / `TransactionCompanyNotFoundError` ile birebir
 * ayni — ve bu tekrar, desenin ucuncu kez uygulanmasinin dogal sonucudur.
 *
 * ⚠️ 404, 422 DEGIL: govdedeki bir ALAN var olmayan bir KAYNAGA isaret ediyor.
 */
export class AppointmentContactNotFoundError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENT_CONTACT_NOT_FOUND';
  constructor() {
    super('Randevunun baglanacagi kisi bulunamadi.');
  }
}

export class InvalidAppointmentsTimestampError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENTS_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}
