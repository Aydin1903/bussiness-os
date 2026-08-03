import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import { Credential, type CredentialState } from './credential.entity';
import { InvalidPasswordChangedAtError } from './identity.error';
import { PasswordHash } from './password-hash.value-object';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const HASH_A = PasswordHash.fromHash(
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzYWx0$RdescudvJCsgt3ubuqfdP0mNSKwQnQBs1flkS5j3Vhg',
);
const HASH_B = PasswordHash.fromHash(
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$YWJjZGVmZ2hpamtsbW5vcA',
);
const NOW = new Date('2026-07-22T10:00:00.000Z');
const LATER = new Date('2026-08-01T10:00:00.000Z');

function persisted(overrides: Partial<CredentialState> = {}): CredentialState {
  return { userId: USER_ID, passwordHash: HASH_A, passwordChangedAt: NOW, ...overrides };
}

describe('Credential.create', () => {
  it('sahibini ve hash.i tasir', () => {
    const credential = Credential.create({ userId: USER_ID, passwordHash: HASH_A, createdAt: NOW });

    expect(credential.userId.equals(USER_ID)).toBe(true);
    expect(credential.passwordHash).toBe(HASH_A);
  });

  it('passwordChangedAt.i kayit anina esitler', () => {
    const credential = Credential.create({ userId: USER_ID, passwordHash: HASH_A, createdAt: NOW });

    expect(credential.passwordChangedAt).toEqual(NOW);
  });

  it('gecersiz olusturulma zamanini reddeder', () => {
    expect(() =>
      Credential.create({ userId: USER_ID, passwordHash: HASH_A, createdAt: new Date('x') }),
    ).toThrow(InvalidPasswordChangedAtError);
  });

  it('olusturulma zamanini kopyalar (disaridan mutasyona kapali)', () => {
    const createdAt = new Date(NOW.getTime());
    const credential = Credential.create({ userId: USER_ID, passwordHash: HASH_A, createdAt });

    createdAt.setFullYear(1990);

    expect(credential.passwordChangedAt).toEqual(NOW);
  });
});

describe('Credential.fromPersistence', () => {
  it('kaliciligi geri getirir', () => {
    const credential = Credential.fromPersistence(persisted());

    expect(credential.passwordHash).toBe(HASH_A);
    expect(credential.passwordChangedAt).toEqual(NOW);
  });

  it('gecersiz passwordChangedAt.i reddeder', () => {
    expect(() =>
      Credential.fromPersistence(persisted({ passwordChangedAt: new Date('x') })),
    ).toThrow(InvalidPasswordChangedAtError);
  });

  it('passwordChangedAt getter kopya doner', () => {
    const credential = Credential.fromPersistence(persisted());

    const read = credential.passwordChangedAt;
    read.setFullYear(1990);

    expect(credential.passwordChangedAt).toEqual(NOW);
  });
});

describe('Credential.changePassword — parolanin KENDISI degisir', () => {
  it('hash.i ve passwordChangedAt.i gunceller', () => {
    const credential = Credential.fromPersistence(persisted());

    credential.changePassword(HASH_B, LATER);

    expect(credential.passwordHash).toBe(HASH_B);
    expect(credential.passwordChangedAt).toEqual(LATER);
  });

  it('gecmise donuk degisimi reddeder (monoton guard)', () => {
    const credential = Credential.fromPersistence(persisted({ passwordChangedAt: LATER }));

    expect(() => {
      credential.changePassword(HASH_B, NOW);
    }).toThrow(InvalidPasswordChangedAtError);
  });

  it('gecersiz tarihi reddeder', () => {
    const credential = Credential.fromPersistence(persisted());

    expect(() => {
      credential.changePassword(HASH_B, new Date('x'));
    }).toThrow(InvalidPasswordChangedAtError);
  });
});

describe('Credential.rehash — parola AYNI, yalnizca kodlama yukselir', () => {
  it('hash.i gunceller ama passwordChangedAt.e DOKUNMAZ', () => {
    // AUTH_ARCHITECTURE 6.3'un cekirdek ayrimi: kademeli rehash parola
    // degisikligi DEGILDIR; "parola en son ne zaman degisti" yalan soylememeli.
    const credential = Credential.fromPersistence(persisted());

    credential.rehash(HASH_B);

    expect(credential.passwordHash).toBe(HASH_B);
    expect(credential.passwordChangedAt).toEqual(NOW);
  });
});
