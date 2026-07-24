import { describe, expect, it } from 'vitest';

import {
  VerificationCodeAlreadyConsumedError,
  VerificationCodeExhaustedError,
} from './identity.error';
import {
  MAX_PASSWORD_RESET_ATTEMPTS,
  PASSWORD_RESET_CODE_TTL_MINUTES,
  PasswordResetCode,
} from './password-reset-code.entity';
import { PasswordResetCodeId } from './password-reset-code-id.value-object';
import { VerificationCodeHash } from './verification-code-hash.value-object';
import { UserId } from '../../../shared/user-id.value-object';

const ID = PasswordResetCodeId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000c1');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const HASH = VerificationCodeHash.fromDigest('a'.repeat(64));
const NOW = new Date('2026-07-22T10:00:00.000Z');

function issued(): PasswordResetCode {
  return PasswordResetCode.issue({
    id: ID,
    userId: USER_ID,
    codeHash: HASH,
    expiresAt: new Date(NOW.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * 60_000),
  });
}

function persisted(overrides: {
  attemptCount?: number;
  expiresAt?: Date;
  consumedAt?: Date | null;
}): PasswordResetCode {
  return PasswordResetCode.fromPersistence({
    id: ID,
    userId: USER_ID,
    codeHash: HASH,
    attemptCount: overrides.attemptCount ?? 0,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 60_000),
    consumedAt: overrides.consumedAt ?? null,
  });
}

describe('PasswordResetCode — parametreler ADR-0024 (dogrulamadan sikilar)', () => {
  it('10 dakika omur, 3 deneme', () => {
    expect(PASSWORD_RESET_CODE_TTL_MINUTES).toBe(10);
    expect(MAX_PASSWORD_RESET_ATTEMPTS).toBe(3);
  });

  it('yeni kod 0 deneme ve tuketilmemis baslar', () => {
    const code = issued();

    expect(code.attemptCount).toBe(0);
    expect(code.isConsumed).toBe(false);
    expect(code.isVerifiable(NOW)).toBe(true);
  });
});

describe('PasswordResetCode — denenebilirlik', () => {
  it('suresi dolmus kod denenemez', () => {
    expect(persisted({ expiresAt: new Date(NOW.getTime() - 1) }).isVerifiable(NOW)).toBe(false);
  });

  it('tuketilmis kod denenemez', () => {
    expect(persisted({ consumedAt: NOW }).isVerifiable(NOW)).toBe(false);
  });

  it('3 denemeye ULASMIS kod denenemez', () => {
    expect(persisted({ attemptCount: MAX_PASSWORD_RESET_ATTEMPTS }).isVerifiable(NOW)).toBe(false);
  });
});

describe('PasswordResetCode — sayac ve tuketim', () => {
  it('registerFailedAttempt sayaci artirir', () => {
    const code = issued();

    code.registerFailedAttempt();

    expect(code.attemptCount).toBe(1);
  });

  it('hakki tukenmis koda deneme islenmez', () => {
    const code = persisted({ attemptCount: MAX_PASSWORD_RESET_ATTEMPTS });

    expect(() => {
      code.registerFailedAttempt();
    }).toThrow(VerificationCodeExhaustedError);
  });

  it('tuketilmis koda deneme islenmez', () => {
    const code = persisted({ consumedAt: NOW });

    expect(() => {
      code.registerFailedAttempt();
    }).toThrow(VerificationCodeAlreadyConsumedError);
  });

  it('consume kodu tek kullanimlik yapar', () => {
    const code = issued();

    code.consume(NOW);

    expect(code.isConsumed).toBe(true);
    expect(() => {
      code.consume(NOW);
    }).toThrow(VerificationCodeAlreadyConsumedError);
  });

  it('supersede kodu gecersizlestirir (consumedAt paylasilir)', () => {
    const code = issued();

    code.supersede(NOW);

    expect(code.isConsumed).toBe(true);
    expect(code.consumedAt).toEqual(NOW);
  });
});

describe('PasswordResetCode.fromPersistence — tutarlilik', () => {
  it('3 ustu deneme sayacini reddeder (CHECK karsiligi)', () => {
    expect(() => persisted({ attemptCount: 4 })).toThrow();
  });
});
