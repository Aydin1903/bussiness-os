import { describe, expect, it } from 'vitest';

import { Email } from './email.value-object';
import { InvalidLoginAttemptTimestampError } from './identity.error';
import { IpAddress } from './ip-address.value-object';
import { LoginAttempt, type LoginAttemptState } from './login-attempt.entity';
import { LoginAttemptId } from './login-attempt-id.value-object';

const ID = LoginAttemptId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000d1');
const EMAIL = Email.create('user@example.com');
const IP = IpAddress.create('203.0.113.7');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function input(overrides: Partial<LoginAttemptState> = {}): LoginAttemptState {
  return { id: ID, email: EMAIL, ipAddress: IP, succeeded: false, attemptedAt: NOW, ...overrides };
}

describe('LoginAttempt.record', () => {
  it('basarisiz denemeyi tum alanlariyla kaydeder', () => {
    const attempt = LoginAttempt.record(input({ succeeded: false }));

    expect(attempt.id.equals(ID)).toBe(true);
    expect(attempt.email.equals(EMAIL)).toBe(true);
    expect(attempt.ipAddress.equals(IP)).toBe(true);
    expect(attempt.succeeded).toBe(false);
    expect(attempt.attemptedAt).toEqual(NOW);
  });

  it('basarili denemeyi de kaydeder', () => {
    expect(LoginAttempt.record(input({ succeeded: true })).succeeded).toBe(true);
  });

  it('gecersiz zamani reddeder', () => {
    expect(() => LoginAttempt.record(input({ attemptedAt: new Date('x') }))).toThrow(
      InvalidLoginAttemptTimestampError,
    );
  });

  it('zamani kopyalar (disaridan mutasyona kapali)', () => {
    const attemptedAt = new Date(NOW.getTime());
    const attempt = LoginAttempt.record(input({ attemptedAt }));

    attemptedAt.setFullYear(1990);

    expect(attempt.attemptedAt).toEqual(NOW);
  });
});

describe('LoginAttempt.fromPersistence', () => {
  it('kaliciligi geri getirir', () => {
    const attempt = LoginAttempt.fromPersistence(input({ succeeded: true }));

    expect(attempt.succeeded).toBe(true);
    expect(attempt.attemptedAt).toEqual(NOW);
  });

  it('gecersiz zamani reddeder', () => {
    expect(() => LoginAttempt.fromPersistence(input({ attemptedAt: new Date('x') }))).toThrow(
      InvalidLoginAttemptTimestampError,
    );
  });

  it('attemptedAt getter kopya doner', () => {
    const attempt = LoginAttempt.fromPersistence(input());

    const read = attempt.attemptedAt;
    read.setFullYear(1990);

    expect(attempt.attemptedAt).toEqual(NOW);
  });
});
