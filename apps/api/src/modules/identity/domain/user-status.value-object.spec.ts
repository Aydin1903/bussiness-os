import { describe, expect, it } from 'vitest';

import { InvalidUserStatusError, InvalidUserStatusTransitionError } from './identity.error';
import {
  allowedTransitionsFrom,
  canTransition,
  parseUserStatus,
  assertTransition,
  USER_STATUSES,
} from './user-status.value-object';

describe('parseUserStatus', () => {
  it.each(USER_STATUSES)('gecerli durumu ("%s") ayristirir', (status) => {
    expect(parseUserStatus(status)).toBe(status);
  });

  it('bilinmeyen durumu reddeder', () => {
    expect(() => parseUserStatus('unverified')).toThrow(InvalidUserStatusError);
  });
});

describe('canTransition — izin verilen gecisler', () => {
  it('pending -> active (e-posta dogrulama)', () => {
    expect(canTransition('pending', 'active')).toBe(true);
  });

  it('pending -> deactivated', () => {
    expect(canTransition('pending', 'deactivated')).toBe(true);
  });

  it('active <-> locked', () => {
    expect(canTransition('active', 'locked')).toBe(true);
    expect(canTransition('locked', 'active')).toBe(true);
  });

  it('active -> deactivated ve locked -> deactivated', () => {
    expect(canTransition('active', 'deactivated')).toBe(true);
    expect(canTransition('locked', 'deactivated')).toBe(true);
  });
});

describe('canTransition — yasak gecisler', () => {
  it('pending -> locked YOK (dogrulanmamis kullanici giris yapamaz)', () => {
    expect(canTransition('pending', 'locked')).toBe(false);
  });

  it('deactivated terminaldir — hicbir gecis yok', () => {
    expect(allowedTransitionsFrom('deactivated')).toHaveLength(0);
    expect(canTransition('deactivated', 'active')).toBe(false);
  });

  it('ayni duruma gecis tanimli degildir', () => {
    expect(canTransition('active', 'active')).toBe(false);
  });
});

describe('assertTransition', () => {
  it('gecerli gecise izin verir', () => {
    expect(() => {
      assertTransition('pending', 'active');
    }).not.toThrow();
  });

  it('gecersiz geciste hata firlatir', () => {
    expect(() => {
      assertTransition('deactivated', 'active');
    }).toThrow(InvalidUserStatusTransitionError);
  });
});
