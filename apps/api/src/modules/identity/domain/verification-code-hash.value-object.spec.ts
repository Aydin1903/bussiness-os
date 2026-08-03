import { describe, expect, it } from 'vitest';

import { InvalidVerificationCodeHashError } from './identity.error';
import { VerificationCodeHash } from './verification-code-hash.value-object';

// 64 kucuk-harf hex (SHA-256 digest bicimi).
const VALID_DIGEST = '0123456789abcdef'.repeat(4);

describe('VerificationCodeHash — sarmalama', () => {
  it('gecerli 64-hex digest.i sarmalar', () => {
    expect(VerificationCodeHash.fromDigest(VALID_DIGEST).value).toBe(VALID_DIGEST);
  });
});

describe('VerificationCodeHash — reddedilen girdiler', () => {
  it('ham 6 haneli kodu reddeder (hash bicimine uymaz)', () => {
    expect(() => VerificationCodeHash.fromDigest('000042')).toThrow(
      InvalidVerificationCodeHashError,
    );
  });

  it('kisa/uzun degeri reddeder', () => {
    expect(() => VerificationCodeHash.fromDigest('abcd')).toThrow(InvalidVerificationCodeHashError);
    expect(() => VerificationCodeHash.fromDigest(`${VALID_DIGEST}00`)).toThrow(
      InvalidVerificationCodeHashError,
    );
  });

  it('buyuk harf hex.i reddeder (kanonik bicim kucuk harf)', () => {
    expect(() => VerificationCodeHash.fromDigest(VALID_DIGEST.toUpperCase())).toThrow(
      InvalidVerificationCodeHashError,
    );
  });

  it('hex olmayan karakteri reddeder', () => {
    expect(() => VerificationCodeHash.fromDigest('g'.repeat(64))).toThrow(
      InvalidVerificationCodeHashError,
    );
  });

  it('hata mesaji gecersiz DEGERI icermez (sizinti korumasi)', () => {
    const rawCode = '424242';
    try {
      VerificationCodeHash.fromDigest(rawCode);
      expect.unreachable('hata firlamaliydi');
    } catch (error) {
      expect((error as Error).message).not.toContain(rawCode);
    }
  });
});

describe('VerificationCodeHash — maskeleme', () => {
  it('toString degeri DEGIL maske doner', () => {
    expect(String(VerificationCodeHash.fromDigest(VALID_DIGEST))).toBe('[REDACTED]');
  });

  it('JSON.stringify digest.i sizdirmaz', () => {
    const serialized = JSON.stringify({ codeHash: VerificationCodeHash.fromDigest(VALID_DIGEST) });

    expect(serialized).not.toContain(VALID_DIGEST);
    expect(serialized).toContain('[REDACTED]');
  });
});
