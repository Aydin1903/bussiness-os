import { InvalidUserIdError } from './tenant.error';
import { normalizeUuidV7 } from './uuid-v7';

/**
 * Bir kullanicinin kimligi.
 *
 * ADR-0014: kimlik GLOBALDIR — kullanici tenant'a ait degildir, tenant'lar
 * arasinda paylasilir. Bu yuzden bu tip bir tenant kavrami TASIMAZ.
 *
 * Iki yerde kullanilir: `Tenant.ownerUserId` (tenant'i acan kisi) ve
 * `Membership.userId` (uyeligin sahibi). Ayni kavram oldugu icin ayni tiptir;
 * "owner" bir ROL'dur, ayri bir kimlik turu degil.
 *
 * ARCHITECTURE 6.1: moduller arasi referans id ile tutulur, cross-schema
 * foreign key kurulmaz. Identity modulu (Faz 3) kendi `UserId` tipini
 * sahiplendiginde bu kopya kaldirilir ve public interface uzerinden alinir.
 */
export class UserId {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): UserId {
    const normalized = normalizeUuidV7(value);
    if (normalized === null) {
      throw new InvalidUserIdError(value);
    }
    return new UserId(normalized);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
