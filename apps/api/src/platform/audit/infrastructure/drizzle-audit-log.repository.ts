import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import { auditLog } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type AuditAction } from '../../../shared/audit.port';
import {
  type AuditLogFilter,
  type AuditLogPage,
  type AuditLogRepository,
} from '../application/audit-log.repository.port';

/**
 * ⚠️ SECILEN KOLONLAR ACIKCA SAYILIR — `select()` (yildiz) KULLANILMAZ.
 *
 * Bu, ADR-0043 §6.5'in okuma tarafindaki karsiligidir: bir gun tabloya
 * yanlislikla bir kolon eklenirse, o kolon bu listeye ELLE eklenmedikce API
 * cevabina GIREMEZ. Yildizli bir sorgu onu SESSIZCE disari tasirdi.
 */
const ENTRY_COLUMNS = {
  id: auditLog.id,
  occurredAt: auditLog.occurredAt,
  actorUserId: auditLog.actorUserId,
  resourceType: auditLog.resourceType,
  resourceId: auditLog.resourceId,
  action: auditLog.action,
  fieldName: auditLog.fieldName,
} as const;

/** Kolon `text`; tablo CHECK'i uc degerden birini garanti eder. */
function toAction(value: string): AuditAction {
  return value === 'created' || value === 'deleted' ? value : 'updated';
}

/**
 * `AuditLogRepository`nin Drizzle implementasyonu.
 *
 * Kendi transaction'ini ACMAZ: sinir use case'tedir (MT §13.3 kural 2).
 * Tenant daraltmasi RLS'tedir — sorguda `tenant_id` filtresi YOKTUR ve
 * OLMAMALIDIR (MT §13.1: iki daraltma mekanizmasi birbirini gizler).
 *
 * ⚠️ YAZMA METODU YOKTUR. Yazma yolu `DrizzleAuditRecorder`dir ve o, disa
 * acik port'u (`shared/audit.port.ts`) uygular. Ikisinin ayri durmasi
 * bilinclidir: okuma bir YONETIM islemidir (`audit:read`), yazma bir modulun
 * kendi isinin yan etkisidir.
 */
@Injectable()
export class DrizzleAuditLogRepository implements AuditLogRepository {
  async list(filter: AuditLogFilter): Promise<AuditLogPage> {
    const { db } = requireTransaction();

    const conditions: SQL[] = [];

    if (filter.resourceType !== null) {
      conditions.push(eq(auditLog.resourceType, filter.resourceType));
    }

    if (filter.resourceId !== null) {
      conditions.push(eq(auditLog.resourceId, filter.resourceId));
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);

    const rows = await db
      .select(ENTRY_COLUMNS)
      .from(auditLog)
      .where(where)
      // En yeni once. `id` ikincil anahtardir: UUIDv7 zaman sirali oldugu icin
      // AYNI `occurred_at` degerine sahip satirlar (ayni islemin alanlari)
      // KARARLI bir sirada doner — aksi halde sayfalama satir atlayabilirdi.
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(filter.limit)
      .offset(filter.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where);

    return {
      items: rows.map((row) => ({ ...row, action: toAction(row.action) })),
      total: counted?.total ?? 0,
    };
  }
}
