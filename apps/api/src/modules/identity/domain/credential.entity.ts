import { type UserId } from '../../../shared/user-id.value-object';
import { InvalidPasswordChangedAtError } from './identity.error';
import { type PasswordHash } from './password-hash.value-object';

/**
 * Bir kullanicinin parola kimlik bilgisi (AUTH_ARCHITECTURE 5.1, 5.3, 6).
 *
 * ============================================================================
 * NEDEN `User`'DAN AYRI
 * ============================================================================
 * AUTH_ARCHITECTURE 5.3: parola hash'i `User`'da degil burada yasar.
 * - Erisim yuzeyi: profil/uyelik sorgulari hash'e ihtiyac duymaz; ayri tutmak
 *   bir `SELECT *` ile hash'in disari cikmasini zorlastirir.
 * - Federasyon: SSO ile parolasiz kullanici olabilecegi icin `User`'da
 *   nullable bir hash "parola yok mu, silindi mi" belirsizligi uretirdi.
 * - Denetim: `passwordChangedAt`, `User`'in yasam dongusunden ayri bir zamandir.
 *
 * Kimligi kendi id'si degil, sahibi olan `userId`'dir — `User` ile 1:1
 * (ER: `user_id PK_FK`). Bu yuzden ayri bir id tasimaz.
 *
 * HAM PAROLA BURAYA GIRMEZ: entity yalnizca `PasswordHash` (zaten hash'lenmis
 * deger) tasir. Hash'leme application/infrastructure'in isidir (ADR-0017).
 * ZAMAN DISARIDAN GELIR (DEVELOPMENT_RULES 3.2).
 * ============================================================================
 */

export interface CreateCredentialInput {
  readonly userId: UserId;
  readonly passwordHash: PasswordHash;
  /** Kayit zamani; ilk parola "bu an" belirlendi. */
  readonly createdAt: Date;
}

/** Credential'in tam durumu — constructor girdisi ve `fromPersistence()` sozlesmesi. */
export interface CredentialState {
  readonly userId: UserId;
  readonly passwordHash: PasswordHash;
  readonly passwordChangedAt: Date;
}

export class Credential {
  readonly userId: UserId;

  #passwordHash: PasswordHash;
  #passwordChangedAt: Date;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. Bkz. `User`. */
  private constructor(state: CredentialState) {
    this.userId = state.userId;
    this.#passwordHash = state.passwordHash;
    this.#passwordChangedAt = state.passwordChangedAt;
  }

  /**
   * Yeni bir kimlik bilgisi olusturur (kayit sirasinda, `User` ile ayni
   * transaction'da — AUTH_ARCHITECTURE 8). `passwordChangedAt` kayit anidir.
   */
  static create(input: CreateCredentialInput): Credential {
    assertValidDate(input.createdAt);

    return new Credential({
      userId: input.userId,
      passwordHash: input.passwordHash,
      passwordChangedAt: copyDate(input.createdAt),
    });
  }

  /** Kalici kayittan yeniden kurar. */
  static fromPersistence(state: CredentialState): Credential {
    assertValidDate(state.passwordChangedAt);

    return new Credential({ ...state, passwordChangedAt: copyDate(state.passwordChangedAt) });
  }

  get passwordHash(): PasswordHash {
    return this.#passwordHash;
  }

  /** Date mutable oldugu icin kopya doner. */
  get passwordChangedAt(): Date {
    return copyDate(this.#passwordChangedAt);
  }

  /**
   * Parolayi DEGISTIRIR (kullanici degisimi veya sifirlama — §7.6).
   *
   * `passwordChangedAt`'i GUNCELLER: burada parolanin KENDISI degisir. Zaman
   * geriye gidemez — bir parola onceki degisikliginden once degistirilemez
   * (Tenant'in `archivedAt >= createdAt` guard'iyla ayni ilke).
   *
   * Kademeli yeniden hash'leme ile KARISTIRILMAMALIDIR — onun icin `rehash`.
   */
  changePassword(newHash: PasswordHash, changedAt: Date): void {
    assertValidDate(changedAt);
    if (changedAt.getTime() < this.#passwordChangedAt.getTime()) {
      throw new InvalidPasswordChangedAtError('onceki degisiklikten once olamaz');
    }

    this.#passwordHash = newHash;
    this.#passwordChangedAt = copyDate(changedAt);
  }

  /**
   * Kademeli yeniden hash'leme (AUTH_ARCHITECTURE 6.3, ADR-0017).
   *
   * Parola AYNIDIR — yalnizca hash'in KODLAMASI daha guclu parametrelerle
   * yenilenir. Bu yuzden `passwordChangedAt`'e DOKUNMAZ: kullanici parolasini
   * degistirmedi. Zamani guncellemek, "parola en son ne zaman degisti" sorusuna
   * yalan soylerdi ve saklama/denetim mantigi bu tarihe guvenir.
   */
  rehash(newHash: PasswordHash): void {
    this.#passwordHash = newHash;
  }
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` doner. Sinirda yakalanmazsa veritabanina
 * `null` olarak dusen bir zaman degeri olusur.
 */
function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidPasswordChangedAtError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
