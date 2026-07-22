import { describe, expect, it } from 'vitest';

import { InvalidRefreshTokenHashError } from './identity.error';
import { RefreshTokenHash } from './refresh-token-hash.value-object';

const VALID_DIGEST = '0123456789abcdef'.repeat(4);

describe('RefreshTokenHash — sarmalama', () => {
  it('gecerli 64-hex digest.i sarmalar', () => {
    expect(RefreshTokenHash.fromDigest(VALID_DIGEST).value).toBe(VALID_DIGEST);
  });
});

describe('RefreshTokenHash — reddedilen girdiler', () => {
  it('ham token benzeri kisa/opak degeri reddeder', () => {
    expect(() => RefreshTokenHash.fromDigest('opaque-token-value')).toThrow(
      InvalidRefreshTokenHashError,
    );
  });

  it('kisa/uzun degeri reddeder', () => {
    expect(() => RefreshTokenHash.fromDigest('abcd')).toThrow(InvalidRefreshTokenHashError);
    expect(() => RefreshTokenHash.fromDigest(`${VALID_DIGEST}00`)).toThrow(
      InvalidRefreshTokenHashError,
    );
  });

  it('buyuk harf hex.i reddeder (kanonik bicim kucuk harf)', () => {
    expect(() => RefreshTokenHash.fromDigest(VALID_DIGEST.toUpperCase())).toThrow(
      InvalidRefreshTokenHashError,
    );
  });

  it('hata mesaji gecersiz DEGERI icermez (sizinti korumasi)', () => {
    const rawToken = 'super-secret-raw-refresh-token';
    try {
      RefreshTokenHash.fromDigest(rawToken);
      expect.unreachable('hata firlamaliydi');
    } catch (error) {
      expect((error as Error).message).not.toContain(rawToken);
    }
  });
});

describe('RefreshTokenHash — maskeleme', () => {
  it('toString degeri DEGIL maske doner', () => {
    expect(String(RefreshTokenHash.fromDigest(VALID_DIGEST))).toBe('[REDACTED]');
  });

  it('JSON.stringify digest.i sizdirmaz', () => {
    const serialized = JSON.stringify({ tokenHash: RefreshTokenHash.fromDigest(VALID_DIGEST) });

    expect(serialized).not.toContain(VALID_DIGEST);
    expect(serialized).toContain('[REDACTED]');
  });
});
