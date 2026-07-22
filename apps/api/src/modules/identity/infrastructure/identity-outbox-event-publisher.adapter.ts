import { Injectable } from '@nestjs/common';

import { identityOutbox } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type { DomainEvent } from '../../../shared/domain-event';
import type { DomainEventPublisher } from '../../../shared/domain-event-publisher.port';

/**
 * Identity event'lerini `platform.identity_outbox`'a yazan transactional outbox
 * adapter'i (ADR-0006, Ç4).
 *
 * Mevcut `OutboxEventPublisher`'in SIMETRIGI: o tenant'siz event'i REDDEDER,
 * bu ise tenant'LI event'i reddeder. Iki tablo iki farkli tehdit modelini ayri
 * tutar (§15.1); bir event'in yanlis outbox'a dusmesi sessiz bir hata olurdu.
 *
 * Kendi transaction'ini ACMAZ: event, use case'in acik transaction'ina yazilir
 * (atomiklik oradan gelir). Identity akislari tenant context'siz calisir.
 */
@Injectable()
export class IdentityOutboxEventPublisher implements DomainEventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    const { db } = requireTransaction();

    if (event.tenantId !== null) {
      // Tenant'li bir event buraya AIT DEGILDIR — o `platform.outbox`'a gider.
      // Sessizce yutmak yerine acikca patlar.
      throw new Error(
        `Tenant'li event identity_outbox'a yazilamaz: ${event.eventType}. ` +
          'Bu tablo yalnizca tenantsiz Identity event akisi icindir (15.1).',
      );
    }

    await db.insert(identityOutbox).values({
      id: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
      correlationId: event.correlationId,
      occurredAt: event.occurredAt,
      // published_at bilincli olarak bos: yayinlama publisher surecinin isidir.
    });
  }
}
