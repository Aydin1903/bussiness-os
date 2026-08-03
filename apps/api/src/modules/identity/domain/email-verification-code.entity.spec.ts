import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import { EmailVerificationCodeId } from './email-verification-code-id.value-object';
import {
  EmailVerificationCode,
  type EmailVerificationCodeState,
  MAX_VERIFICATION_ATTEMPTS,
} from './email-verification-code.entity';
import {
  InconsistentVerificationCodeStateError,
  InvalidVerificationCodeExpiryError,
  VerificationCodeAlreadyConsumedError,
  VerificationCodeExhaustedError,
} from './identity.error';
import { VerificationCodeHash } from './verification-code-hash.value-object';

const CODE_ID = EmailVerificationCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000e1');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const HASH = VerificationCodeHash.fromDigest('0123456789abcdef'.repeat(4));
const NOW = new Date('2026-07-22T10:00:00.000Z');
const EXPIRES = new Date('2026-07-22T10:15:00.000Z');
const AFTER_EXPIRY = new Date('2026-07-22T10:20:00.000Z');

function issued(): EmailVerificationCode {
  return EmailVerificationCode.issue({
    id: CODE_ID,
    userId: USER_ID,
    codeHash: HASH,
    expiresAt: EXPIRES,
  });
}

function persisted(
  overrides: Partial<EmailVerificationCodeState> = {},
): EmailVerificationCodeState {
  return {
    id: CODE_ID,
    userId: USER_ID,
    codeHash: HASH,
    attemptCount: 0,
    expiresAt: EXPIRES,
    consumedAt: null,
    ...overrides,
  };
}

describe('EmailVerificationCode.issue', () => {
  it('sifir deneme ve tuketilmemis baslar', () => {
    const code = issued();

    expect(code.attemptCount).toBe(0);
    expect(code.isConsumed).toBe(false);
    expect(code.hasAttemptsRemaining).toBe(true);
  });

  it('gecersiz sona erme zamanini reddeder', () => {
    expect(() =>
      EmailVerificationCode.issue({
        id: CODE_ID,
        userId: USER_ID,
        codeHash: HASH,
        expiresAt: new Date('x'),
      }),
    ).toThrow(InvalidVerificationCodeExpiryError);
  });

  it('expiresAt.i kopyalar', () => {
    const expiresAt = new Date(EXPIRES.getTime());
    const code = EmailVerificationCode.issue({
      id: CODE_ID,
      userId: USER_ID,
      codeHash: HASH,
      expiresAt,
    });

    expiresAt.setFullYear(1990);

    expect(code.expiresAt).toEqual(EXPIRES);
  });
});

describe('EmailVerificationCode — sure', () => {
  it('sona erme zamanindan once suresi dolmamistir', () => {
    expect(issued().isExpired(NOW)).toBe(false);
  });

  it('sona erme aninda ve sonrasinda suresi dolmustur', () => {
    expect(issued().isExpired(EXPIRES)).toBe(true);
    expect(issued().isExpired(AFTER_EXPIRY)).toBe(true);
  });
});

describe('EmailVerificationCode — isVerifiable', () => {
  it('taze kod denenebilir', () => {
    expect(issued().isVerifiable(NOW)).toBe(true);
  });

  it('suresi dolmus kod denenemez', () => {
    expect(issued().isVerifiable(AFTER_EXPIRY)).toBe(false);
  });

  it('tuketilmis kod denenemez', () => {
    const code = issued();
    code.consume(NOW);

    expect(code.isVerifiable(NOW)).toBe(false);
  });

  it('deneme hakki tukenmis kod denenemez', () => {
    const code = EmailVerificationCode.fromPersistence(
      persisted({ attemptCount: MAX_VERIFICATION_ATTEMPTS }),
    );

    expect(code.isVerifiable(NOW)).toBe(false);
  });
});

describe('EmailVerificationCode.registerFailedAttempt', () => {
  it('sayaci artirir', () => {
    const code = issued();

    code.registerFailedAttempt();

    expect(code.attemptCount).toBe(1);
  });

  it(`${String(MAX_VERIFICATION_ATTEMPTS)} yanlis denemeden sonra kod gecersizlesir`, () => {
    const code = issued();

    for (let i = 0; i < MAX_VERIFICATION_ATTEMPTS; i += 1) {
      code.registerFailedAttempt();
    }

    expect(code.attemptCount).toBe(MAX_VERIFICATION_ATTEMPTS);
    expect(code.hasAttemptsRemaining).toBe(false);
    expect(code.isVerifiable(NOW)).toBe(false);
  });

  it('hak tukendikten sonra yeni deneme reddedilir', () => {
    const code = EmailVerificationCode.fromPersistence(
      persisted({ attemptCount: MAX_VERIFICATION_ATTEMPTS }),
    );

    expect(() => {
      code.registerFailedAttempt();
    }).toThrow(VerificationCodeExhaustedError);
  });

  it('tuketilmis koda deneme islenmez', () => {
    const code = issued();
    code.consume(NOW);

    expect(() => {
      code.registerFailedAttempt();
    }).toThrow(VerificationCodeAlreadyConsumedError);
  });
});

describe('EmailVerificationCode.consume', () => {
  it('kodu tuketir', () => {
    const code = issued();

    code.consume(NOW);

    expect(code.isConsumed).toBe(true);
    expect(code.consumedAt).toEqual(NOW);
  });

  it('iki kez tuketilemez', () => {
    const code = issued();
    code.consume(NOW);

    expect(() => {
      code.consume(NOW);
    }).toThrow(VerificationCodeAlreadyConsumedError);
  });

  it('gecersiz zamani reddeder', () => {
    const code = issued();

    expect(() => {
      code.consume(new Date('x'));
    }).toThrow(InvalidVerificationCodeExpiryError);
  });
});

describe('EmailVerificationCode.fromPersistence', () => {
  it('kaliciligi geri getirir', () => {
    const code = EmailVerificationCode.fromPersistence(
      persisted({ attemptCount: 2, consumedAt: NOW }),
    );

    expect(code.attemptCount).toBe(2);
    expect(code.isConsumed).toBe(true);
  });

  it('araligin disindaki sayaci tutarsiz sayar', () => {
    expect(() =>
      EmailVerificationCode.fromPersistence(
        persisted({ attemptCount: MAX_VERIFICATION_ATTEMPTS + 1 }),
      ),
    ).toThrow(InconsistentVerificationCodeStateError);

    expect(() => EmailVerificationCode.fromPersistence(persisted({ attemptCount: -1 }))).toThrow(
      InconsistentVerificationCodeStateError,
    );
  });

  it('tam sayi olmayan sayaci tutarsiz sayar', () => {
    expect(() => EmailVerificationCode.fromPersistence(persisted({ attemptCount: 1.5 }))).toThrow(
      InconsistentVerificationCodeStateError,
    );
  });

  it('gecersiz expiresAt.i reddeder', () => {
    expect(() =>
      EmailVerificationCode.fromPersistence(persisted({ expiresAt: new Date('x') })),
    ).toThrow(InvalidVerificationCodeExpiryError);
  });

  it('gecersiz consumedAt.i reddeder', () => {
    expect(() =>
      EmailVerificationCode.fromPersistence(persisted({ consumedAt: new Date('x') })),
    ).toThrow(InvalidVerificationCodeExpiryError);
  });

  it('consumedAt getter kopya doner', () => {
    const code = EmailVerificationCode.fromPersistence(persisted({ consumedAt: NOW }));

    const read = code.consumedAt;
    read?.setFullYear(1990);

    expect(code.consumedAt).toEqual(NOW);
  });
});
