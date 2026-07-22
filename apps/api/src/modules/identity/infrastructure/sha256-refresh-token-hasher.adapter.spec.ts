import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Sha256RefreshTokenHasher } from './sha256-refresh-token-hasher.adapter';

const hasher = new Sha256RefreshTokenHasher();

describe('Sha256RefreshTokenHasher', () => {
  it('64-hex bir digest uretir', () => {
    expect(hasher.hash('some-token').value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deterministiktir: ayni token ayni digest (lookup icin sart)', () => {
    expect(hasher.hash('token-abc').value).toBe(hasher.hash('token-abc').value);
  });

  it('farkli token farkli digest', () => {
    expect(hasher.hash('token-abc').value).not.toBe(hasher.hash('token-xyz').value);
  });

  it('bilinen SHA-256 ile ayni sonucu verir', () => {
    const token = 'the-refresh-token';
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');

    expect(hasher.hash(token).value).toBe(expected);
  });
});
