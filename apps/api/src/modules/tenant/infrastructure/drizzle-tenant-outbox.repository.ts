import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type {
  TenantOutboxDeliveryFailure,
  TenantOutboxRecord,
  TenantOutboxRepository,
} from '../application/tenant-outbox.repository.port';

/**
 * `platform.claim_outbox_batch` fonksiyonunun dondurdugu ham satir.
 *
 * `type` (interface DEGIL): drizzle `db.execute<T>`, T'nin `Record<string, unknown>`
 * kisitini saglamasini bekler; object-literal `type` implicit index signature
 * tasir, `interface` TASIMAZ. `DrizzleMembershipRepository`'deki
 * `UserMembershipQueryRow` ile ayni gerekce — bu yuzden
 * `consistent-type-definitions` burada bilincli olarak devre disi.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ClaimedRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_type: string;
  readonly event_version: number;
  readonly payload: unknown;
  readonly correlation_id: string;
  readonly occurred_at: Date;
  readonly attempt_count: number;
};

/**
 * `TenantOutboxRepository`'nin Drizzle implementasyonu (ADR-0006).
 *
 * ============================================================================
 * NEDEN DUZ SORGU DEGIL, SQL FONKSIYONU
 * ============================================================================
 * `platform.outbox` standart RLS sablonunu tasir (`ENABLE` + `FORCE`, migration
 * `0002`) ve politika `tenant_id = current_setting('app.current_tenant_id')`
 * der. Tuketici tenant'lar ARASI okur ve tenant context'i YOKTUR — duz bir
 * `SELECT` hicbir satir dondurmezdi (ya da context yoksa hata verirdi).
 *
 * Bu yuzden uc islem de `SECURITY DEFINER` fonksiyonlara delege edilir
 * (migration `0010`). Fonksiyonlarin sahibi `businessos_outbox_relay`: NOLOGIN,
 * BYPASSRLS, ve YALNIZCA `platform.outbox`'a yetkili dar bir rol. Asim uc
 * fonksiyon imzasinda TOPLANMISTIR; genel bir "outbox'i oku" yetkisi yoktur
 * (MULTI_TENANT_ARCHITECTURE 12.4.2, 12.4.4 deseni).
 *
 * Identity'nin ayni katmandaki repository'si duz Drizzle sorgusu yapar cunku
 * `platform.identity_outbox` tenant'siz ve RLS'sizdir. Tek yapisal fark budur.
 * ============================================================================
 *
 * Kendi transaction'ini ACMAZ: sinir tuketici use case'indedir. Kilidin teslimat
 * boyunca tutulabilmesi bunu zaten zorunlu kilar — repository kendi
 * transaction'ini acsaydi kilit `SELECT` biter bitmez birakilir ve iki instance
 * ayni kaydi teslim edebilirdi.
 */
@Injectable()
export class DrizzleTenantOutboxRepository implements TenantOutboxRepository {
  async claimPending(limit: number, now: Date): Promise<TenantOutboxRecord[]> {
    const { db } = requireTransaction();

    // Kilit, cagiran transaction adina alinir ve tur sonuna kadar tutulur.
    const result = await db.execute<ClaimedRow>(
      sql`SELECT * FROM platform.claim_outbox_batch(${limit}, ${now})`,
    );

    return [...result.rows].map(toRecord);
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (ids.length === 0) {
      // Bos dizi ile cagirmak gecersiz degil ama gereksiz bir tur; erken donmek
      // daha durust (Identity ile ayni davranis).
      return;
    }

    const { db } = requireTransaction();

    // ==========================================================================
    // DIZI NEDEN JSON OLARAK GECIYOR
    // ==========================================================================
    // Drizzle'in `sql` sablonu bir JS dizisini TEK bir metin parametresine
    // duzlestirir ve elemanlari virgulle birlestirir: `$1` degeri
    // `uuid1,uuid2` olur, PostgreSQL array literal'i (`{uuid1,uuid2}`) DEGIL.
    // Sonuc `malformed array literal` hatasidir — ve `runOnce` hatayi
    // yuttugu icin SESSIZCE hicbir kayit isaretlenmez.
    //
    // Array literal'ini elle kurmak (`{${ids.join(',')}}`) calisirdi ama SQL
    // metnini string birlestirmeyle uretme aliskanligini normallestirirdi.
    // JSON, tek bir metin parametresi olarak guvenle tasinir ve dizi
    // PostgreSQL tarafinda tiplenerek kurulur; fonksiyonun `uuid[]` imzasi
    // AYNEN korunur.
    // ==========================================================================
    await db.execute(
      sql`SELECT platform.mark_outbox_published(
        ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify([...ids])}::jsonb))::uuid[],
        ${publishedAt}
      )`,
    );
  }

  async recordFailures(failures: readonly TenantOutboxDeliveryFailure[]): Promise<void> {
    const { db } = requireTransaction();

    // Her kaydin sayaci ve yeniden deneme ani FARKLIDIR; tek bir toplu cagri
    // ile yazilamaz. Basarisizlik nadir oldugu icin N sorgu kabul edilebilir —
    // ve tur zaten batch boyutuyla sinirlidir.
    for (const failure of failures) {
      await db.execute(
        sql`SELECT platform.record_outbox_failure(
          ${failure.id}::uuid,
          ${failure.attemptCount},
          ${failure.lastError},
          ${failure.nextAttemptAt},
          ${failure.deadLetteredAt}
        )`,
      );
    }
  }
}

/**
 * `jsonb` kolonu `unknown` doner. Tip yuklemi ile daraltilir; `as` ile zorlamak
 * (DEVELOPMENT_RULES 2.3) bozuk bir satiri "gecerli payload" gibi gosterirdi.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Satiri okuma modeline cevirir. Payload'in ALANLARI burada dogrulanmaz. */
function toRecord(row: ClaimedRow): TenantOutboxRecord {
  if (!isRecord(row.payload)) {
    throw new TypeError(`outbox.payload nesne degil: ${row.id}`);
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    // Alanlarin ayristirilmasi tuketicinin isidir: repository'nin her event
    // tipinin sozlesmesini bilmesi gerekmez.
    payload: row.payload,
    correlationId: row.correlation_id,
    occurredAt: new Date(row.occurred_at),
    attemptCount: row.attempt_count,
  };
}
