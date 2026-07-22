import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import {
  InconsistentTokenFamilyStateError,
  InvalidTokenFamilyCreatedAtError,
  InvalidTokenFamilyRevokedAtError,
  TokenFamilyAlreadyRevokedError,
} from './identity.error';
import { TokenFamily, type TokenFamilyState } from './token-family.entity';
import { TokenFamilyId } from './token-family-id.value-object';

const FAMILY_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const CREATED = new Date('2026-07-22T10:00:00.000Z');
const REVOKED_AT = new Date('2026-07-22T11:00:00.000Z');
const BEFORE_CREATED = new Date('2026-07-22T09:00:00.000Z');

function persisted(overrides: Partial<TokenFamilyState> = {}): TokenFamilyState {
  return {
    id: FAMILY_ID,
    userId: USER_ID,
    revokedReason: null,
    createdAt: CREATED,
    revokedAt: null,
    ...overrides,
  };
}

describe('TokenFamily.start', () => {
  it('iptal edilmemis (aktif) baslar', () => {
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: CREATED });

    expect(family.isRevoked).toBe(false);
    expect(family.isActive).toBe(true);
    expect(family.revokedReason).toBeNull();
  });

  it('gecersiz olusturulma zamanini reddeder', () => {
    expect(() =>
      TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: new Date('x') }),
    ).toThrow(InvalidTokenFamilyCreatedAtError);
  });

  it('olusturulma zamanini kopyalar', () => {
    const createdAt = new Date(CREATED.getTime());
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt });

    createdAt.setFullYear(1990);

    expect(family.createdAt).toEqual(CREATED);
  });
});

describe('TokenFamily.revoke', () => {
  it('aileyi neden ve zamanla iptal eder', () => {
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: CREATED });

    family.revoke('token-reuse-detected', REVOKED_AT);

    expect(family.isRevoked).toBe(true);
    expect(family.isActive).toBe(false);
    expect(family.revokedReason).toBe('token-reuse-detected');
    expect(family.revokedAt).toEqual(REVOKED_AT);
  });

  it('olusturulmadan once iptal zamanini reddeder', () => {
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: CREATED });

    expect(() => {
      family.revoke('logout', BEFORE_CREATED);
    }).toThrow(InvalidTokenFamilyRevokedAtError);
  });

  it('gecersiz iptal zamanini reddeder', () => {
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: CREATED });

    expect(() => {
      family.revoke('logout', new Date('x'));
    }).toThrow(InvalidTokenFamilyRevokedAtError);
  });

  it('iki kez iptal edilemez (ilk iptal esastir)', () => {
    const family = TokenFamily.start({ id: FAMILY_ID, userId: USER_ID, createdAt: CREATED });
    family.revoke('token-reuse-detected', REVOKED_AT);

    expect(() => {
      family.revoke('logout', REVOKED_AT);
    }).toThrow(TokenFamilyAlreadyRevokedError);
  });
});

describe('TokenFamily.fromPersistence', () => {
  it('aktif aileyi geri getirir', () => {
    expect(TokenFamily.fromPersistence(persisted()).isActive).toBe(true);
  });

  it('iptal edilmis aileyi geri getirir', () => {
    const family = TokenFamily.fromPersistence(
      persisted({ revokedReason: 'password-changed', revokedAt: REVOKED_AT }),
    );

    expect(family.isRevoked).toBe(true);
    expect(family.revokedReason).toBe('password-changed');
  });

  it('nedeni olup zamani olmayan durumu tutarsiz sayar', () => {
    expect(() =>
      TokenFamily.fromPersistence(persisted({ revokedReason: 'logout', revokedAt: null })),
    ).toThrow(InconsistentTokenFamilyStateError);
  });

  it('zamani olup nedeni olmayan durumu tutarsiz sayar', () => {
    expect(() =>
      TokenFamily.fromPersistence(persisted({ revokedReason: null, revokedAt: REVOKED_AT })),
    ).toThrow(InconsistentTokenFamilyStateError);
  });

  it('iptal zamani olusturulmadan onceyse tutarsiz sayar', () => {
    expect(() =>
      TokenFamily.fromPersistence(
        persisted({ revokedReason: 'logout', revokedAt: BEFORE_CREATED }),
      ),
    ).toThrow(InconsistentTokenFamilyStateError);
  });

  it('gecersiz olusturulma zamanini reddeder', () => {
    expect(() => TokenFamily.fromPersistence(persisted({ createdAt: new Date('x') }))).toThrow(
      InvalidTokenFamilyCreatedAtError,
    );
  });

  it('revokedAt getter kopya doner', () => {
    const family = TokenFamily.fromPersistence(
      persisted({ revokedReason: 'logout', revokedAt: REVOKED_AT }),
    );

    const read = family.revokedAt;
    read?.setFullYear(1990);

    expect(family.revokedAt).toEqual(REVOKED_AT);
  });
});
