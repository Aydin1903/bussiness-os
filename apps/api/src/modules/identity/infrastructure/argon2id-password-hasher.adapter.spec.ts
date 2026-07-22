import { describe, expect, it } from 'vitest';

import { Argon2idPasswordHasher } from './argon2id-password-hasher.adapter';
import { type Argon2Parameters } from './argon2-parameters';

/**
 * Bu testler GERCEK `@node-rs/argon2`'yi calistirir — adapter'in kutuphaneyle
 * dogru butunlestigini kanitlamanin tek yolu budur (bir mock, kutuphanenin
 * gercekten dogru hash uretip dogruladigini soyleyemez). Docker gerekmez;
 * argon2 in-process calisir.
 *
 * Parametreler HIZ icin dusuk tutulur; uretim ADR-0017 tabanini kullanir.
 */
const CHEAP: Argon2Parameters = { memoryCost: 512, timeCost: 2, parallelism: 1, hashLength: 32 };
const CHEAPER: Argon2Parameters = { memoryCost: 256, timeCost: 2, parallelism: 1, hashLength: 32 };

const hasher = new Argon2idPasswordHasher(CHEAP);

describe('Argon2idPasswordHasher — hash ve verify', () => {
  it('dogru parolayi dogrular', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
  });

  it('yanlis parolayi reddeder', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('wrong password', hash)).toBe(false);
  });

  it('uretilen deger bir Argon2id PHC hash.idir', async () => {
    // PasswordHash.fromHash iceride `$argon2id$` on ekini zorlar; buraya donmusse
    // dogru algoritma kullanilmis demektir.
    const hash = await hasher.hash('some-password-1');

    expect(hash.value).toMatch(/^\$argon2id\$/);
  });

  it('ham parolayi PasswordHash icinde SIZDIRMAZ (maske)', async () => {
    const hash = await hasher.hash('super-secret-1');

    expect(String(hash)).toBe('[REDACTED]');
  });
});

describe('Argon2idPasswordHasher — NFKC normalizasyonu (bkz. AUTH 6.1)', () => {
  it('ayni parolanin farkli Unicode normalizasyonunu dogrular', async () => {
    // 'e-acute' iki bicimde yazilabilir. Kod noktalari ACIKCA yazilir (\u...),
    // aksi halde dosya kodlamasi ikisini tek bicime indirip testi anlamsizlastirir.
    const decomposed = 'café-parola-1'; // 'e' + U+0301 birlesen aksan
    const composed = 'café-parola-1'; // U+00E9 e-acute

    // On kosul: iki string GERCEKTEN farkli, yalnizca NFKC altinda esit.
    expect(decomposed).not.toBe(composed);

    const hash = await hasher.hash(decomposed);

    expect(await hasher.verify(composed, hash)).toBe(true);
  });
});

describe('Argon2idPasswordHasher — needsRehash (kademeli yukseltme, AUTH 6.3)', () => {
  it('guncel parametreli hash icin false doner', async () => {
    const hash = await hasher.hash('pw-current-1');

    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('daha zayif parametreli hash icin true doner', async () => {
    // CHEAPER (m=256) ile uretilmis hash, CHEAP (m=512) bekleyen hasher icin eskidir.
    const older = new Argon2idPasswordHasher(CHEAPER);
    const oldHash = await older.hash('pw-old-1');

    expect(hasher.needsRehash(oldHash)).toBe(true);
  });
});
