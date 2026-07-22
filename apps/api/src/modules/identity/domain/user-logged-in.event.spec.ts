import { describe, expect, it } from 'vitest';

import { TokenFamilyId } from './token-family-id.value-object';
import { UserLoggedIn } from './user-logged-in.event';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const SESSION_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): UserLoggedIn {
  return UserLoggedIn.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e3',
    userId: USER_ID,
    sessionId: SESSION_ID,
    occurredAt: NOW,
    correlationId: 'corr-1',
  });
}

describe('UserLoggedIn', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('user.logged_in');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    expect(event().tenantId).toBeNull();
  });

  it('payload yalnizca userId ve sessionId tasir (sir yok)', () => {
    expect(event().payload).toEqual({ userId: USER_ID.value, sessionId: SESSION_ID.value });
  });

  it('olusturulduktan sonra degistirilemez', () => {
    expect(() => {
      (event() as { eventId: string }).eventId = 'x';
    }).toThrow(TypeError);
  });
});
