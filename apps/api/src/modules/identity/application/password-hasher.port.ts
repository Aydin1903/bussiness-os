import { type PasswordHash } from '../domain/password-hash.value-object';

/**
 * Parola hash'leme ve dogrulama port'u (AUTH_ARCHITECTURE 6, ADR-0017).
 *
 * ARCHITECTURE 4: port APPLICATION katmanina aittir, implementasyon
 * infrastructure'a (Argon2id adapter). Use case yalnizca bu arayuzu bilir;
 * hangi algoritma, hangi parametre, hangi kutuphane oldugundan habersizdir —
 * algoritma degisirse (PHC formati sayesinde) yalnizca adapter degisir.
 *
 * ============================================================================
 * HAM PAROLA YALNIZCA BURADA GORUNUR
 * ============================================================================
 * `plainPassword: string` bu port'un metotlarina GECICI bir parametre olarak
 * girer ve hicbir yerde saklanmaz/loglanmaz/dondurulmez. Domain katmani ham
 * parolayi HIC gormez: `hash` bir `PasswordHash` (zaten hash'lenmis deger)
 * dondurur; `verify` yalnizca boolean doner. NFKC normalizasyonu (§6.1)
 * adapter'in isidir ve hash ile verify'da AYNI yerde yapilir — aksi halde ayni
 * parola iki farkli normalizasyonla farkli sonuc verirdi.
 * ============================================================================
 */
/** DI token'i. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  /**
   * Ham parolayi hash'ler ve `PasswordHash` olarak dondurur.
   *
   * Bu, ham parolanin `PasswordHash`'e donustugu TEK yerdir — VO'nun `fromHash`
   * sozlesmesi geregi disaridan ham parola verilemez.
   */
  hash(plainPassword: string): Promise<PasswordHash>;

  /**
   * Ham parolayi saklanmis hash ile karsilastirir.
   *
   * `boolean` doner, hata firlatmaz (eslesme/eslesmeme bir DOMAIN sonucudur,
   * bir hata degil). Sabit zamanli karsilastirma adapter'in ve altindaki
   * kutuphanenin garantisidir; string esitligi ile YAPILMAZ.
   */
  verify(plainPassword: string, hash: PasswordHash): Promise<boolean>;

  /**
   * Hash, GUNCEL parametrelerden daha zayif parametrelerle mi uretilmis?
   *
   * Kademeli yeniden hash'leme icin (AUTH_ARCHITECTURE 6.3): kullanici basariyla
   * giris yaptiginda — o an elimizde duz parola varken — `true` donerse
   * `Credential.rehash` ile sessizce guncellenir. Saf bir kontroldur: yalnizca
   * hash'in parametrelerine bakar, I/O yapmaz.
   */
  needsRehash(hash: PasswordHash): boolean;
}
