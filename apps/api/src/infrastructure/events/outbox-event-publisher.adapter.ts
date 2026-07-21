import { Injectable } from '@nestjs/common';

import type { DomainEvent } from '../../shared/domain-event';
import type { DomainEventPublisher } from '../../shared/domain-event-publisher.port';
import { outbox } from '../database/schema';
import { requireTransaction } from '../database/transaction-context';

/**
 * `DomainEventPublisher` port'unun transactional outbox implementasyonu
 * (ADR-0006).
 *
 * ============================================================================
 * BU ADAPTER KUYRUGA YAZMAZ — TABLOYA YAZAR
 * ============================================================================
 * Event, cagiran use case'in ACIK transaction'ina yazilir. Yani `publish()`
 * "gonderildi" anlamina GELMEZ; "ayni transaction'da kaydedildi, teslimi
 * garanti altina alindi" anlamina gelir.
 *
 * Kritik sonuc: is verisi geri alinirsa event de geri gider. Dogrudan kuyruga
 * yazan bir implementasyonda ise DB commit olur, surec coker ve event hic
 * yayinlanmaz — sistem kalici olarak tutarsiz kalir.
 * ============================================================================
 */
@Injectable()
export class OutboxEventPublisher implements DomainEventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    // Kendi transaction'ini ACMAZ. Aktif transaction yoksa hata firlatir —
    // cunku transaction'siz yazilan bir outbox satiri, outbox'i anlamsiz
    // kilar: atomiklik garantisi tam olarak transaction'dan gelir.
    const { db } = requireTransaction();

    if (event.tenantId === null) {
      // Tenant'siz event'ler (Identity, MULTI_TENANT_ARCHITECTURE 15.1) bu
      // tabloya YAZILAMAZ: tenant_id NOT NULL'dir ve RLS politikasi zaten
      // reddederdi. Sessizce yutmak yerine acikca patlar — Identity modulu
      // geldiginde bu satir, karar verilmesi gereken yeri gosterir.
      throw new Error(
        `Tenant'siz event outbox'a yazilamaz: ${event.eventType}. ` +
          'Identity event yolu icin ayri bir karar gerekiyor (15.1).',
      );
    }

    await db.insert(outbox).values({
      id: event.eventId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      // Zarf alanlari KOLON, is verisi JSONB. Publisher'in filtreleyip
      // siralayabilmesi icin zarfin sorgulanabilir olmasi gerekir.
      payload: event.payload,
      correlationId: event.correlationId,
      occurredAt: event.occurredAt,
      // published_at bilincli olarak bos: yayinlama publisher surecinin isidir.
    });
  }
}
