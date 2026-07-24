import { describe, expect, it } from 'vitest';

import { Email } from './email.value-object';
import { PasswordResetRequested } from './password-reset-requested.event';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): PasswordResetRequested {
  return PasswordResetRequested.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e1',
    userId: USER_ID,
    email: Email.create('user@example.com'),
    resetCode: '123456',
    occurredAt: NOW,
    correlationId: 'c-1',
  });
}

describe('PasswordResetRequested', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('password_reset.requested');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    expect(event().tenantId).toBeNull();
  });

  it('payload teslimat icin ham kodu ve adresi tasir', () => {
    expect(event().payload).toEqual({
      userId: USER_ID.value,
      email: 'user@example.com',
      resetCode: '123456',
    });
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (event() as { eventId: string }).eventId = 'x';
    }).toThrow(TypeError);
  });
});
