import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { IdentityOutboxEventPublisher } from '../../src/modules/identity/infrastructure/identity-outbox-event-publisher.adapter';
import { Email } from '../../src/modules/identity/domain/email.value-object';
import { UserRegistered } from '../../src/modules/identity/domain/user-registered.event';
import { UserId } from '../../src/shared/user-id.value-object';
import type { DomainEvent } from '../../src/shared/domain-event';
import { startTestDatabase, truncateIdentityTables, type TestDatabase } from './support/test-database';

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const NOW = new Date('2026-07-22T10:00:00.000Z');

describe('identity outbox publisher (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let tx: DrizzleTransactionManager;
  let publisher: IdentityOutboxEventPublisher;

  beforeAll(async () => {
    database = await startTestDatabase();
    tx = new DrizzleTransactionManager(database.appPool);
    publisher = new IdentityOutboxEventPublisher();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await truncateIdentityTables(database.ownerPool);
  });

  it('tenant SIZ event i identity_outbox a yazar (context olmadan)', async () => {
    const event = UserRegistered.create({
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e1',
      userId: UserId.create(USER_ID),
      email: Email.create('user@example.com'),
      verificationCode: '123456',
      occurredAt: NOW,
      correlationId: 'corr-1',
    });

    await tx.runInTransaction(() => publisher.publish(event));

    const rows = await database.ownerPool.query<{
      event_type: string;
      payload: { userId: string; verificationCode: string };
      published_at: Date | null;
    }>('SELECT event_type, payload, published_at FROM platform.identity_outbox WHERE id = $1', [
      event.eventId,
    ]);

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.event_type).toBe('user.registered');
    expect(rows.rows[0]?.payload.userId).toBe(USER_ID);
    expect(rows.rows[0]?.payload.verificationCode).toBe('123456');
    // Yayinlama publisher surecinin isi; yazim aninda bos.
    expect(rows.rows[0]?.published_at).toBeNull();
  });

  it('tenant LI event i reddeder (yanlis outbox)', async () => {
    // identity_outbox yalnizca tenant'siz event'ler icindir; tenant'li event
    // platform.outbox'a gitmelidir.
    const tenantEvent: DomainEvent = {
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e2',
      eventType: 'tenant.something_happened',
      eventVersion: 1,
      tenantId: '018f3a2b-7c4d-7e1f-8a2b-0000000000a1',
      occurredAt: NOW,
      correlationId: 'corr-2',
      payload: {},
    };

    await expect(tx.runInTransaction(() => publisher.publish(tenantEvent))).rejects.toThrow(
      /Tenant'li event/,
    );
  });

  it('transaction geri alinirsa event kalmaz (atomiklik)', async () => {
    const event = UserRegistered.create({
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e3',
      userId: UserId.create(USER_ID),
      email: Email.create('user@example.com'),
      verificationCode: '654321',
      occurredAt: NOW,
      correlationId: 'corr-3',
    });

    await expect(
      tx.runInTransaction(async () => {
        await publisher.publish(event);
        throw new Error('use case patladi');
      }),
    ).rejects.toThrow('use case patladi');

    const rows = await database.ownerPool.query('SELECT id FROM platform.identity_outbox');
    expect(rows.rowCount).toBe(0);
  });
});
