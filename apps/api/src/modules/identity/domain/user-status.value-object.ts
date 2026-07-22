import { InvalidUserStatusError, InvalidUserStatusTransitionError } from './identity.error';

/**
 * Kullanici yasam dongusu durumlari (AUTH_ARCHITECTURE 5.2).
 *
 * ============================================================================
 * `status` ile `emailVerified` AYRI KAVRAMLARDIR
 * ============================================================================
 * AUTH_ARCHITECTURE 5.2/9 ikisini AYRI tutar ve giris akisi ikisini AYRI kapida
 * kontrol eder. Sebep: `emailVerified` hesabin KALICI bir ozelligidir (bir kez
 * dogrulaninca hep dogrulanmis kalir), `status` ise DEGISEN yasam dongusudur
 * (active <-> locked). Dogrulamayi status'a gomseydik, `deactivated` bir
 * kullanicinin e-postasini dogrulayip dogrulamadigi bilgisini kaybederdik.
 *
 * - `pending`     : kayit olmus, e-postasi HENUZ dogrulanmamis.
 * - `active`      : e-postasi dogrulanmis, giris yapabilir.
 * - `locked`      : kaba kuvvet veya operator karariyla erisim kapatilmis (§14).
 * - `deactivated` : hesap kapatilmis. Terminal.
 * ============================================================================
 */
export const USER_STATUSES = ['pending', 'active', 'locked', 'deactivated'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Izin verilen durum gecisleri. Burada olmayan her gecis YASAKTIR.
 *
 * - `pending -> active` : e-posta dogrulamasi (§7.5).
 * - `pending -> deactivated` : dogrulanmamis hesabin kapatilmasi/temizlenmesi.
 * - `pending -> locked` YOK : e-postasi dogrulanmamis kullanici giris yapamaz
 *   (giris akisinda `email_verified?` kapisi status'tan ONCE gelir, §9), bu
 *   yuzden kilitlenecek bir erisim henuz yoktur.
 * - `active <-> locked` : kilit ve kilit acma (§14).
 * - `* -> deactivated`  : pending/active/locked her durumdan kapatilabilir.
 * - `deactivated -> *` YOK : terminal. Yeniden aktifles­tirme bir domain gecisi
 *   degil, ayri ve ACIK bir islem olurdu (Tenant'ta `failed`'in terminal
 *   olmasiyla ayni ilke).
 *
 * Bu gecis grafigi dogrudan `emailVerified` tutarlilik invariant'ini uretir
 * (bkz. `user.entity.ts`): `active` ve `locked`'a yalnizca dogrulanmis bir
 * kullanici ulasabilir.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  pending: ['active', 'deactivated'],
  active: ['locked', 'deactivated'],
  locked: ['active', 'deactivated'],
  deactivated: [],
};

/**
 * Dis dunyadan gelen bir metni (ornegin veritabani kolonu) kullanici durumuna
 * cevirir. `as UserStatus` ile zorlamak, beklenmeyen bir kolon degerinde hatayi
 * gizlerdi (ARCHITECTURE 4); bu yuzden ayristirma acikca yapilir.
 */
export function parseUserStatus(value: string): UserStatus {
  const match = USER_STATUSES.find((status) => status === value);
  if (match === undefined) {
    throw new InvalidUserStatusError(value);
  }
  return match;
}

/** Gecis tanimli mi? Hata firlatmaz — karar vermek isteyenler icin. */
export function canTransition(from: UserStatus, to: UserStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Gecisi dogrular; tanimsizsa hata firlatir. Entity her durum degisikliginde
 * bunu cagirir, boylece gecis kurali tek bir yerde yasar.
 */
export function assertTransition(from: UserStatus, to: UserStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidUserStatusTransitionError(from, to);
  }
}

/** Bir durumdan gidilebilecek durumlar. Test ve dokumantasyon icin. */
export function allowedTransitionsFrom(from: UserStatus): readonly UserStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
