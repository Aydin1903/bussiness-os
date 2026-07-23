import { describe, expect, it } from 'vitest';

import { UserEmailVerified } from './user-email-verified.event';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): UserEmailVerified {
  return UserEmailVerified.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e7',
    userId: USER_ID,
    occurredAt: NOW,
    correlationId: 'corr-1',
  });
}

describe('UserEmailVerified', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('user.email_verified');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    // Dogrulama tenant seciminden oncedir (§15.1).
    expect(event().tenantId).toBeNull();
  });

  it('payload YALNIZCA userId tasir', () => {
    // Kod, hash veya e-posta payload'a girmez: teslim edilecek bir sir yok.
    expect(event().payload).toEqual({ userId: USER_ID.value });
  });

  it('occurredAt i kopyalar — disaridan degistirilemez', () => {
    const mutable = new Date(NOW.getTime());
    const created = UserEmailVerified.create({
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e8',
      userId: USER_ID,
      occurredAt: mutable,
      correlationId: 'corr-1',
    });

    mutable.setFullYear(2030);

    expect(created.occurredAt).toEqual(NOW);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (event() as { eventId: string }).eventId = 'x';
    }).toThrow(TypeError);
  });
});
