import { describe, expect, it } from 'vitest';

import { Email } from './email.value-object';
import { UserRegistered } from './user-registered.event';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const EMAIL = Email.create('user@example.com');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): UserRegistered {
  return UserRegistered.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e1',
    userId: USER_ID,
    email: EMAIL,
    verificationCode: '123456',
    occurredAt: NOW,
    correlationId: 'corr-1',
  });
}

describe('UserRegistered', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('user.registered');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    expect(event().tenantId).toBeNull();
  });

  it('payload ILKEL degerler tasir (userId, email, ham kod)', () => {
    expect(event().payload).toEqual({
      userId: USER_ID.value,
      email: 'user@example.com',
      verificationCode: '123456',
    });
  });

  it('occurredAt i kopyalar (disaridan mutasyona kapali)', () => {
    const occurredAt = new Date(NOW.getTime());
    const e = UserRegistered.create({
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e2',
      userId: USER_ID,
      email: EMAIL,
      verificationCode: '000000',
      occurredAt,
      correlationId: 'corr-2',
    });

    occurredAt.setFullYear(1990);

    expect(e.occurredAt).toEqual(NOW);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (event() as { eventId: string }).eventId = 'x';
    }).toThrow(TypeError);
  });
});
