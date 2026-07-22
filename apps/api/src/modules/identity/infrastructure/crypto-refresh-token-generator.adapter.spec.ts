import { describe, expect, it } from 'vitest';

import { CryptoRefreshTokenGenerator } from './crypto-refresh-token-generator.adapter';

const generator = new CryptoRefreshTokenGenerator();

describe('CryptoRefreshTokenGenerator', () => {
  it('URL-guvenli (base64url) bir token uretir', () => {
    // base64url alfabesi: A-Z a-z 0-9 - _ (padding yok).
    expect(generator.generate()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('256 bit uretir (32 bayt -> 43 base64url karakteri)', () => {
    expect(generator.generate()).toHaveLength(43);
  });

  it('her cagrida farkli deger uretir', () => {
    const values = new Set(Array.from({ length: 100 }, () => generator.generate()));

    expect(values.size).toBe(100);
  });
});
