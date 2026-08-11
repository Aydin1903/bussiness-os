import { InvalidOccurredOnError } from './finance.error';

/**
 * `YYYY-MM-DD` bicimi VE gercek bir takvim gunu.
 *
 * ============================================================================
 * ⚠️ YALNIZCA KALIP KONTROLU YETMEZ
 * ============================================================================
 * `2026-02-31` kalibi GECER ama var olmayan bir gundur ve PostgreSQL onu `date`
 * kolonuna yazarken reddeder — yani kullanici 422 yerine 500 alirdi.
 * `Date.UTC` ile geri cevrim, kalibin anlattigi gunun GERCEKTEN var oldugunu
 * dogrular.
 *
 * `Date`e cevirmek burada saat dilimi sorusunu GERI GETIRMEZ: UTC kullaniliyor
 * ve sonuc saklanmiyor, yalnizca dogrulama icin uretilip atiliyor.
 *
 * ============================================================================
 * NEDEN AYRI DOSYA
 * ============================================================================
 * `FinanceTransaction.occurredOn` ve `Commentary.occurredOn` AYNI kurali
 * paylasir. Ikinci entity yazilirken kopyalamak, bir tarih kuralinin IKI
 * kaynagi olmasi demekti — ve biri sikilastirildiginda digeri sessizce gevsek
 * kalirdi. Modul ICI ortak bir domain yardimcisidir; `shared/`a girmez cunku
 * baska bir modulun ihtiyaci yok (ADR-0031 §4'un uc kosulundan ucuncusu).
 */
export function assertCalendarDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) {
    throw new InvalidOccurredOnError(value);
  }

  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new InvalidOccurredOnError(value);
  }

  return `${year}-${month}-${day}`;
}

/**
 * `Date` -> `YYYY-MM-DD` (UTC).
 *
 * `projects/application/today.ts` ile ayni saat dilimi karari. Kaynak burada
 * `Clock`tur: yorumun `occurredOn`u verilmediginde BUGUNE duser.
 */
export function toCalendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
