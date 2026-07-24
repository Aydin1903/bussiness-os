import { describe, expect, it } from 'vitest';

import { Email } from './email.value-object';
import { UserPasswordChanged } from './user-password-changed.event';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): UserPasswordChanged {
  return UserPasswordChanged.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e2',
    userId: USER_ID,
    email: Email.create('user@example.com'),
    occurredAt: NOW,
    correlationId: 'c-1',
  });
}

describe('UserPasswordChanged', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('user.password_changed');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    expect(event().tenantId).toBeNull();
  });

  it('payload yalnizca userId + email tasir — SIR YOK', () => {
    // Bilgilendirme teslimati icin adres gerekir; yeni parola/kod TASINMAZ.
    expect(event().payload).toEqual({ userId: USER_ID.value, email: 'user@example.com' });
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (event() as { eventId: string }).eventId = 'x';
    }).toThrow(TypeError);
  });
});
