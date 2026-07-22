import { describe, expect, it } from 'vitest';

import { InvalidPasswordHashError } from './identity.error';
import { PasswordHash } from './password-hash.value-object';

// Gercekci bir PHC Argon2id string'i (salt/hash base64, deger onemli degil).
const VALID_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzYWx0$RdescudvJCsgt3ubuqfdP0mNSKwQnQBs1flkS5j3Vhg';

describe('PasswordHash — sarmalama', () => {
  it('gecerli bir PHC Argon2id hash.ini sarmalar', () => {
    expect(PasswordHash.fromHash(VALID_HASH).value).toBe(VALID_HASH);
  });

  it('farkli parametreli (yukseltilmis) bir hash.i de kabul eder', () => {
    // AUTH_ARCHITECTURE 6.3: parametreler zamanla artar, eski/yeni ikisi de gecerli.
    const upgraded = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$YWJjZGVmZ2hpamtsbW5vcA';
    expect(PasswordHash.fromHash(upgraded).value).toBe(upgraded);
  });
});

describe('PasswordHash — reddedilen girdiler', () => {
  it('ham parolayi reddeder (hash bicimine uymaz)', () => {
    expect(() => PasswordHash.fromHash('P@ssw0rd123')).toThrow(InvalidPasswordHashError);
  });

  it('bos degeri reddeder', () => {
    expect(() => PasswordHash.fromHash('')).toThrow(InvalidPasswordHashError);
  });

  it('argon2i (yanlis varyant) hash.ini reddeder', () => {
    const argon2i = '$argon2i$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$YWJjZGVmZ2hpamtsbW5vcA';
    expect(() => PasswordHash.fromHash(argon2i)).toThrow(InvalidPasswordHashError);
  });

  it('bcrypt hash.ini reddeder', () => {
    expect(() => PasswordHash.fromHash('$2b$12$abcdefghijklmnopqrstuv')).toThrow(
      InvalidPasswordHashError,
    );
  });

  it('hata mesaji gecersiz DEGERI icermez (sizinti korumasi)', () => {
    // Ham parola yanlislikla verilirse, log'a dusen mesaj onu tasimamali.
    const secret = 'my-actual-password';
    try {
      PasswordHash.fromHash(secret);
      expect.unreachable('hata firlamaliydi');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe('PasswordHash — log/serilestirme sizintisina karsi maskeleme', () => {
  it('toString degeri DEGIL maske doner', () => {
    expect(String(PasswordHash.fromHash(VALID_HASH))).toBe('[REDACTED]');
  });

  it('JSON.stringify hash.i sizdirmaz', () => {
    const serialized = JSON.stringify({ password: PasswordHash.fromHash(VALID_HASH) });

    expect(serialized).not.toContain(VALID_HASH);
    expect(serialized).toContain('[REDACTED]');
  });

  it('gercek deger yalnizca value uzerinden alinir', () => {
    // Persistence adapter'inin mesru erisim yolu.
    expect(PasswordHash.fromHash(VALID_HASH).value).toBe(VALID_HASH);
  });
});
