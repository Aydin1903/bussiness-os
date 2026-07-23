import { describe, expect, it } from 'vitest';

import { RefreshTokenReuseDetected } from './refresh-token-reuse-detected.event';
import { TokenFamilyId } from './token-family-id.value-object';
import { UserId } from '../../../shared/user-id.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const FAMILY_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function event(): RefreshTokenReuseDetected {
  return RefreshTokenReuseDetected.create({
    eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000e9',
    userId: USER_ID,
    familyId: FAMILY_ID,
    occurredAt: NOW,
    correlationId: 'corr-1',
  });
}

describe('RefreshTokenReuseDetected', () => {
  it('tur ve surumu tasir', () => {
    expect(event().eventType).toBe('refresh_token.reuse_detected');
    expect(event().eventVersion).toBe(1);
  });

  it('tenant a atfedilemez (tenantId null)', () => {
    expect(event().tenantId).toBeNull();
  });

  it('payload yalnizca userId ve familyId tasir — SIR YOK', () => {
    // Token, hash veya kod payload'a girmez; alarm kimin/hangi oturum sorusunu
    // yanitlar, sirri tasimaz (P1).
    expect(event().payload).toEqual({ userId: USER_ID.value, familyId: FAMILY_ID.value });
  });

  it('occurredAt i kopyalar — disaridan degistirilemez', () => {
    const mutable = new Date(NOW.getTime());
    const created = RefreshTokenReuseDetected.create({
      eventId: '018f3a2b-7c4d-7e1f-8a2b-0000000000ea',
      userId: USER_ID,
      familyId: FAMILY_ID,
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
