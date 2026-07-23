import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import {
  InconsistentTokenFamilyStateError,
  InvalidTokenFamilyCreatedAtError,
  InvalidTokenFamilyRevokedAtError,
  TokenFamilyAlreadyRevokedError,
} from './identity.error';
import {
  TOKEN_FAMILY_ABSOLUTE_TTL_DAYS,
  TokenFamily,
  type TokenFamilyState,
} from './token-family.entity';
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

const DAY_MS = 24 * 60 * 60_000;

function daysAfterCreation(days: number): Date {
  return new Date(CREATED.getTime() + days * DAY_MS);
}

describe('TokenFamily — mutlak omur (90 gun tavani)', () => {
  it('tavan ADR-0021 ekindeki deger ile aynidir', () => {
    expect(TOKEN_FAMILY_ABSOLUTE_TTL_DAYS).toBe(90);
  });

  it('tavanin ALTINDA dolmus saymaz', () => {
    const family = TokenFamily.fromPersistence(persisted());

    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(89))).toBe(false);
  });

  it('TAM 90. gunde dolmus sayar', () => {
    const family = TokenFamily.fromPersistence(persisted());

    // Sinirin varlik sebebi katiligidir; bir milisaniye gevsetmek de gevsetmektir.
    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(90))).toBe(true);
  });

  it('tavanin USTUNDE dolmus sayar', () => {
    const family = TokenFamily.fromPersistence(persisted());

    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(91))).toBe(true);
  });

  it('tavan dolsa da aile IPTAL EDILMIS olmaz', () => {
    const family = TokenFamily.fromPersistence(persisted());

    // Sona erme bir zaman gercegidir, iptal kaydi degil: `revokedAt` bos kalir
    // ve denetim kaydi "birileri karar verdi" demez.
    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(91))).toBe(true);
    expect(family.isRevoked).toBe(false);
    expect(family.revokedAt).toBeNull();
    expect(family.revokedReason).toBeNull();
  });

  it('isRenewable IKI sinirin ikisini de uygular', () => {
    const active = TokenFamily.fromPersistence(persisted());
    const revoked = TokenFamily.fromPersistence(
      persisted({ revokedReason: 'logout', revokedAt: REVOKED_AT }),
    );

    expect(active.isRenewable(daysAfterCreation(1))).toBe(true);
    // Tavan doldu (iptal yok):
    expect(active.isRenewable(daysAfterCreation(91))).toBe(false);
    // Iptal edildi (tavan dolmadi):
    expect(revoked.isRenewable(daysAfterCreation(1))).toBe(false);
  });

  it('rotasyon tavani SIFIRLAMAZ — tavan olusturulma anina baglidir', () => {
    // Aile 80 gun once acildi; token'lar arada defalarca rotasyona ugramis
    // olabilir, aile hala AYNI `createdAt`'i tasir.
    const family = TokenFamily.fromPersistence(persisted());

    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(80))).toBe(false);
    expect(family.hasReachedAbsoluteLifetime(daysAfterCreation(90))).toBe(true);
  });
});
