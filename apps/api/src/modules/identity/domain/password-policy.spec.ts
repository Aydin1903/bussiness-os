import { describe, expect, it } from 'vitest';

import { PasswordPolicyError } from './identity.error';
import {
  assertPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from './password-policy';

describe('validatePassword — uyumlu', () => {
  it('harf + rakam iceren, uzunlugu uygun parolayi kabul eder', () => {
    expect(validatePassword('abcd1234')).toEqual([]);
  });

  it('tam alt sinirda (8) kabul eder', () => {
    expect(validatePassword('abcdefg1')).toEqual([]);
    expect('abcdefg1'.length).toBe(PASSWORD_MIN_LENGTH);
  });

  it('tam ust sinirda (128) kabul eder', () => {
    const pw = `a1${'x'.repeat(PASSWORD_MAX_LENGTH - 2)}`;
    expect(Array.from(pw)).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(validatePassword(pw)).toEqual([]);
  });

  it('sembol/buyuk-harf ZORUNLU DEGILDIR (NIST SP 800-63B)', () => {
    expect(validatePassword('parola123')).toEqual([]);
  });
});

describe('validatePassword — ihlaller', () => {
  it('cok kisa parolayi isaretler', () => {
    expect(validatePassword('abc123')).toContain('too-short');
  });

  it('cok uzun parolayi isaretler', () => {
    const pw = `a1${'x'.repeat(PASSWORD_MAX_LENGTH)}`; // 130 kod noktasi
    expect(validatePassword(pw)).toContain('too-long');
  });

  it('harf icermeyen parolayi isaretler', () => {
    expect(validatePassword('12345678')).toEqual(['missing-letter']);
  });

  it('rakam icermeyen parolayi isaretler', () => {
    expect(validatePassword('abcdefgh')).toEqual(['missing-digit']);
  });

  it('birden fazla ihlali birlikte doner', () => {
    // 8 sembol: uzunluk uygun ama ne harf ne rakam.
    expect(validatePassword('!@#$%^&*')).toEqual(['missing-letter', 'missing-digit']);
  });

  it('uzunlugu KOD NOKTASI ile sayar, UTF-16 birimi ile degil', () => {
    // 'a1' + 3 emoji = 5 kod noktasi (UTF-16'da 8 birim). Kod noktasiyla < 8 -> kisa.
    const pw = 'a1\u{1F600}\u{1F600}\u{1F600}';
    expect(Array.from(pw)).toHaveLength(5);
    expect(pw.length).toBe(8); // UTF-16 birimi ile 8 gorunur ama...
    expect(validatePassword(pw)).toEqual(['too-short']); // ...kod noktasiyla kisa
  });
});

describe('assertPasswordPolicy', () => {
  it('uyumlu parolada sessizce doner', () => {
    expect(() => {
      assertPasswordPolicy('abcd1234');
    }).not.toThrow();
  });

  it('ihlalde PasswordPolicyError firlatir ve ihlalleri tasir', () => {
    try {
      assertPasswordPolicy('123');
      expect.unreachable('hata firlamaliydi');
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordPolicyError);
      expect((error as PasswordPolicyError).violations).toContain('too-short');
    }
  });

  it('hata mesaji parolanin KENDISINI icermez (sizinti korumasi)', () => {
    const secret = 'sh0rt';
    try {
      assertPasswordPolicy(secret);
      expect.unreachable('hata firlamaliydi');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
