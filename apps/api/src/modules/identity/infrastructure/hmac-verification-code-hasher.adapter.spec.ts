import { describe, expect, it } from 'vitest';

import { HmacVerificationCodeHasher } from './hmac-verification-code-hasher.adapter';

const PEPPER = 'test-pepper-at-least-16-characters-long';
const hasher = new HmacVerificationCodeHasher(PEPPER);

describe('HmacVerificationCodeHasher — hash', () => {
  it('ayni kod her zaman ayni digest uretir (HMAC deterministiktir)', () => {
    expect(hasher.hash('123456').value).toBe(hasher.hash('123456').value);
  });

  it('farkli kodlar farkli digest uretir', () => {
    expect(hasher.hash('123456').value).not.toBe(hasher.hash('654321').value);
  });

  it('64-hex bir digest uretir', () => {
    expect(hasher.hash('000042').value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pepper degisince ayni kod farkli digest verir', () => {
    // Pepper'in korumasi: veritabani sizsa bile pepper olmadan digest uretilemez.
    const other = new HmacVerificationCodeHasher('completely-different-pepper-value');

    expect(hasher.hash('123456').value).not.toBe(other.hash('123456').value);
  });
});

describe('HmacVerificationCodeHasher — verify', () => {
  it('dogru kodu dogrular', () => {
    const hash = hasher.hash('135790');

    expect(hasher.verify('135790', hash)).toBe(true);
  });

  it('yanlis kodu reddeder', () => {
    const hash = hasher.hash('135790');

    expect(hasher.verify('999999', hash)).toBe(false);
  });
});

describe('HmacVerificationCodeHasher — pepper guvenligi', () => {
  it('cok kisa pepper.i kurulusta reddeder (fail fast)', () => {
    expect(() => new HmacVerificationCodeHasher('short')).toThrow();
  });
});
