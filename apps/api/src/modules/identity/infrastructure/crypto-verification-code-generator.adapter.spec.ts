import { describe, expect, it } from 'vitest';

import { CryptoVerificationCodeGenerator } from './crypto-verification-code-generator.adapter';

const generator = new CryptoVerificationCodeGenerator();
const samples = Array.from({ length: 1000 }, () => generator.generate());

describe('CryptoVerificationCodeGenerator', () => {
  it('daima tam 6 hane uretir (bastaki sifirlar korunur)', () => {
    expect(samples.every((code) => /^[0-9]{6}$/.test(code))).toBe(true);
  });

  it('[0, 999999] araliginda deger uretir', () => {
    const outOfRange = samples.filter((code) => Number(code) < 0 || Number(code) > 999_999);

    expect(outOfRange).toHaveLength(0);
  });

  it('bastaki sifirli kodlar uretebilir', () => {
    // padStart(6, '0') sayesinde 100000 altindaki degerler bastan sifir alir;
    // 1000 ornekte en az birinin < 100000 olmasi olasiligi pratikte 1.
    expect(samples.some((code) => Number(code) < 100_000)).toBe(true);
  });
});
