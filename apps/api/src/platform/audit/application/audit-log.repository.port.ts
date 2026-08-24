import { type AuditAction } from '../../../shared/audit.port';

/** DI token'i. */
export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

/**
 * Denetim kaydinin DIS goruntusu.
 *
 * ⚠️ Yazma tarafiyla ayni sinir: burada da DEGER YOKTUR (ADR-0043 §6.5).
 * Tabloda olmayan bir sey okumada da olamaz — bu tip, o gercegin API
 * sozlesmesindeki aynasidir.
 */
export interface AuditLogEntryView {
  readonly id: string;
  readonly occurredAt: Date;
  /** ⚠️ `null` = sistem/worker (ADR-0043 §6.4). */
  readonly actorUserId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: AuditAction;
  /** ⚠️ Degisen alanin ADI; `created`/`deleted` icin `null`. */
  readonly fieldName: string | null;
}

/**
 * Liste filtresi.
 *
 * ⚠️ `resourceId` TEK BASINA verilemez — `resourceType` olmadan bir uuid
 * filtresi, kaynak turunu bilmeden "bu id'ye ne oldu" demektir ve iki farkli
 * moduldeki ayni id'yi karistirabilir. Kural DTO'da (`list-audit.dto.ts`)
 * zorlanir; burasi yalnizca sekli tasir.
 */
export interface AuditLogFilter {
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface AuditLogPage {
  readonly items: readonly AuditLogEntryView[];
  readonly total: number;
}

/**
 * Denetim kaydi OKUMA port'u — modul ICI (`platform/audit/application`).
 *
 * ⚠️ Yazma port'u (`shared/audit.port.ts`) DISA aciktir, bu DEGILDIR ve bu
 * ayrim bilinclidir: bir modul denetim kaydi YAZAR, ama baska bir modulun
 * denetim gecmisini OKUMAK bir modul isi degil, bir YONETIM islemidir
 * (`audit:read`, owner + admin).
 *
 * ⚠️ Bir `update` ya da `delete` metodu YOKTUR ve eklenemez: tablo
 * degismezdir ve veritabani bunu IKI KATMANDA zorlar (yetki + trigger).
 * Buraya bir metot eklemek derlenir ama CALISMAZ — yine de eklenmemelidir,
 * cunku sozlesme var olmayan bir yetenegi IMA EDERDI.
 */
export interface AuditLogRepository {
  list(filter: AuditLogFilter): Promise<AuditLogPage>;
}
