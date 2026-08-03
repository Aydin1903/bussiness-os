import { describe, expect, it } from 'vitest';

import {
  InvalidRefreshTokenExpiryError,
  InvalidRefreshTokenUsedAtError,
  RefreshTokenAlreadyUsedError,
} from './identity.error';
import {
  RefreshToken,
  REFRESH_TOKEN_TTL_DAYS,
  type RefreshTokenState,
} from './refresh-token.entity';
import { RefreshTokenHash } from './refresh-token-hash.value-object';
import { RefreshTokenId } from './refresh-token-id.value-object';
import { TokenFamilyId } from './token-family-id.value-object';

const TOKEN_ID = RefreshTokenId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000a2');
const FAMILY_ID = TokenFamilyId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000f1');
const HASH = RefreshTokenHash.fromDigest('0123456789abcdef'.repeat(4));
const NOW = new Date('2026-07-22T10:00:00.000Z');
const EXPIRES = new Date('2026-08-21T10:00:00.000Z'); // +30 gun
const AFTER_EXPIRY = new Date('2026-08-22T10:00:00.000Z');

function persisted(overrides: Partial<RefreshTokenState> = {}): RefreshTokenState {
  return {
    id: TOKEN_ID,
    familyId: FAMILY_ID,
    tokenHash: HASH,
    expiresAt: EXPIRES,
    usedAt: null,
    ...overrides,
  };
}

describe('RefreshToken.issue', () => {
  it('kullanilmamis baslar ve kullanilabilir', () => {
    const token = RefreshToken.issue({
      id: TOKEN_ID,
      familyId: FAMILY_ID,
      tokenHash: HASH,
      expiresAt: EXPIRES,
    });

    expect(token.isUsed).toBe(false);
    expect(token.isUsable(NOW)).toBe(true);
  });

  it('ailesine familyId ile referans verir', () => {
    const token = RefreshToken.issue({
      id: TOKEN_ID,
      familyId: FAMILY_ID,
      tokenHash: HASH,
      expiresAt: EXPIRES,
    });

    expect(token.familyId.equals(FAMILY_ID)).toBe(true);
  });

  it('gecersiz sona erme zamanini reddeder', () => {
    expect(() =>
      RefreshToken.issue({
        id: TOKEN_ID,
        familyId: FAMILY_ID,
        tokenHash: HASH,
        expiresAt: new Date('x'),
      }),
    ).toThrow(InvalidRefreshTokenExpiryError);
  });

  it('expiresAt.i kopyalar', () => {
    const expiresAt = new Date(EXPIRES.getTime());
    const token = RefreshToken.issue({
      id: TOKEN_ID,
      familyId: FAMILY_ID,
      tokenHash: HASH,
      expiresAt,
    });

    expiresAt.setFullYear(1990);

    expect(token.expiresAt).toEqual(EXPIRES);
  });
});

describe('RefreshToken — sure ve kullanilabilirlik', () => {
  it('sona ermeden once suresi dolmamistir', () => {
    expect(persistedToken().isExpired(NOW)).toBe(false);
  });

  it('sona erme aninda ve sonrasinda suresi dolmustur', () => {
    expect(persistedToken().isExpired(EXPIRES)).toBe(true);
    expect(persistedToken().isExpired(AFTER_EXPIRY)).toBe(true);
  });

  it('suresi dolmus token kullanilamaz', () => {
    expect(persistedToken().isUsable(AFTER_EXPIRY)).toBe(false);
  });

  it('kullanilmis token kullanilamaz', () => {
    expect(persistedToken({ usedAt: NOW }).isUsable(NOW)).toBe(false);
  });
});

describe('RefreshToken.markUsed (rotation)', () => {
  it('token.i kullanilmis olarak isaretler', () => {
    const token = persistedToken();

    token.markUsed(NOW);

    expect(token.isUsed).toBe(true);
    expect(token.usedAt).toEqual(NOW);
  });

  it('iki kez kullanilamaz (yeniden kullanimin son savunmasi)', () => {
    const token = persistedToken();
    token.markUsed(NOW);

    expect(() => {
      token.markUsed(NOW);
    }).toThrow(RefreshTokenAlreadyUsedError);
  });

  it('gecersiz kullanim zamanini reddeder', () => {
    const token = persistedToken();

    expect(() => {
      token.markUsed(new Date('x'));
    }).toThrow(InvalidRefreshTokenUsedAtError);
  });
});

describe('RefreshToken.fromPersistence', () => {
  it('kullanilmis token.i geri getirir', () => {
    const token = RefreshToken.fromPersistence(persisted({ usedAt: NOW }));

    expect(token.isUsed).toBe(true);
    expect(token.usedAt).toEqual(NOW);
  });

  it('gecersiz expiresAt.i reddeder', () => {
    expect(() => RefreshToken.fromPersistence(persisted({ expiresAt: new Date('x') }))).toThrow(
      InvalidRefreshTokenExpiryError,
    );
  });

  it('gecersiz usedAt.i reddeder', () => {
    expect(() => RefreshToken.fromPersistence(persisted({ usedAt: new Date('x') }))).toThrow(
      InvalidRefreshTokenUsedAtError,
    );
  });

  it('usedAt getter kopya doner', () => {
    const token = RefreshToken.fromPersistence(persisted({ usedAt: NOW }));

    const read = token.usedAt;
    read?.setFullYear(1990);

    expect(token.usedAt).toEqual(NOW);
  });
});

describe('REFRESH_TOKEN_TTL_DAYS', () => {
  it('ADR-0021 geregi 30 gundur', () => {
    expect(REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });
});

function persistedToken(overrides: Partial<RefreshTokenState> = {}): RefreshToken {
  return RefreshToken.fromPersistence(persisted(overrides));
}
