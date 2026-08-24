import {
  assertHrCalendarDay,
  normalizeCompensationAmount,
  normalizeCompensationCurrency,
} from './compensation-money';

export type CompensationPeriod = 'monthly' | 'hourly' | 'annual';

export interface CompensationRecordFields {
  /** ⚠️ `string` — TS tarafinda ASLA `number` degil (ADR-0034 §2c). */
  readonly amount: string;
  readonly currency: string;
  readonly period: CompensationPeriod;
  /** ⚠️ GELECEK TARIHLI olabilir: gelecek ayin zammi bugunden yazilir. */
  readonly effectiveFrom: string;
}

export interface CompensationRecordState extends CompensationRecordFields {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  /** ⚠️ Denetim izinin maas tarafini KAPATAN kolon (ADR-0043 §6.2). */
  readonly recordedByUserId: string;
  readonly recordedAt: Date;
}

/**
 * Ucret defteri satiri (ADR-0043 §1.2).
 *
 * ============================================================================
 * ⚠️ `update` METODU YOKTUR VE EKLENMEYECEKTIR
 * ============================================================================
 * Bu, ekleme-yalnizligin BIRINCI katmanidir ve digerlerinden farkli bir yuku
 * vardir: bu defterin degistirilemezligi §6.2'ye gore DENETIM IZININ TA
 * KENDISIDIR. _"Maasi kim, ne zaman degistirdi"_ sorusu, degisikligin KENDISI
 * BIR SATIR oldugu icin cevaplanir — `platform.audit_log`a ihtiyac duymadan.
 *
 * Bir `update` metodu eklemek, o cevabi SESSIZCE gecersiz kilardi: gecmis bir
 * satir degistirilebilseydi "kim degistirdi" sorusu geri gelir ve bu kez
 * cevapsiz kalirdi.
 *
 * ⚠️ Koruma UC KATMANLI ve ILK GUNDEN (`0033`/`0034`un iki deftere SONRADAN
 * ekledigi katman burada baslangictan var):
 *   1. bu sinifta `update` metodu YOK
 *   2. `compensation:delete` izni YOK (kataloga hic yazilmadi)
 *   3. veritabani yetkisi YOK (`GRANT SELECT, INSERT` — migration `0035`)
 *
 * ============================================================================
 * ⚠️ BIR DUZELTME NASIL YAPILIR
 * ============================================================================
 * Yanlis girilmis bir ucret DUZELTILMEZ, UZERINE YAZILIR: dogru tutarla ayni
 * `effectiveFrom` icin yeni bir kayit denenirse `compensation_effective_unique`
 * onu reddeder (409) — yani kullanici ya farkli bir yururluk tarihi secer ya da
 * yoneticiyle konusur. ⚠️ Bu, ADR-0039'un "iki satir kalir" muhasebe
 * disiplininden bilincli olarak DAHA SIKIDIR: orada ters kayit mesruydu, burada
 * ayni gune ikinci bir ucret ANLAMSIZDIR.
 */
export class CompensationRecord {
  private constructor(private readonly state: CompensationRecordState) {}

  static create(input: {
    id: string;
    tenantId: string;
    employeeId: string;
    recordedByUserId: string;
    fields: CompensationRecordFields;
    now: Date;
  }): CompensationRecord {
    return new CompensationRecord({
      id: input.id,
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      recordedByUserId: input.recordedByUserId,
      amount: normalizeCompensationAmount(input.fields.amount),
      currency: normalizeCompensationCurrency(input.fields.currency),
      period: input.fields.period,
      effectiveFrom: assertHrCalendarDay(input.fields.effectiveFrom),
      recordedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ. */
  static fromPersistence(state: CompensationRecordState): CompensationRecord {
    return new CompensationRecord(state);
  }

  toState(): CompensationRecordState {
    return this.state;
  }
}
