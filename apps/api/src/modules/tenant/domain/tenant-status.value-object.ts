import { InvalidTenantStatusError, InvalidTenantStatusTransitionError } from './tenant.error';

/**
 * Tenant yasam dongusu durumlari (MULTI_TENANT_ARCHITECTURE 6.2).
 *
 * `failed` durumu, provisioning'in asenkron tamamlama adimi basarisiz
 * oldugunda olusur (ADR-0016). Terminal'dir: oradan cikis yoktur, kayit bir
 * telafi isi tarafindan silinir ve slug serbest birakilir.
 */
export const TENANT_STATUSES = [
  'provisioning',
  'active',
  'suspended',
  'archived',
  'failed',
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * Izin verilen durum gecisleri — MULTI_TENANT_ARCHITECTURE 6.2 state
 * diagram'inin birebir karsiligi.
 *
 * Burada olmayan her gecis YASAKTIR. Ozellikle dikkat:
 *
 * - `provisioning -> archived` YOK. Yarim kurulmus bir tenant arsivlenemez;
 *   once `active` veya `failed` olmak zorundadir. Aksi halde hicbir zaman
 *   tamamlanmamis bir tenant, tamamlanmis gibi saklama surecine girer.
 * - `provisioning -> suspended` YOK. Askiya alinacak bir erisim henuz yok.
 * - `failed` terminal. Basarisiz provisioning "duzeltilmez", kayit silinir.
 * - `archived -> active` VAR: saklama penceresi icinde geri alma
 *   (MULTI_TENANT_ARCHITECTURE 6.4). Pencere disi geri alma bir domain kurali
 *   degil, uygulama katmani politikasidir — sure bilgisi burada tutulmaz.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TenantStatus, readonly TenantStatus[]>> = {
  provisioning: ['active', 'failed'],
  active: ['suspended', 'archived'],
  suspended: ['active', 'archived'],
  archived: ['active'],
  failed: [],
};

/**
 * Dis dunyadan gelen bir metni (ornegin veritabani kolonu) tenant durumuna
 * cevirir.
 *
 * TypeScript tipleri runtime'da yoktur (ARCHITECTURE 4): bir `string`'i
 * `as TenantStatus` ile zorlamak, veritabaninda beklenmeyen bir deger
 * oldugunda hatayi gizler. Bu yuzden ayristirma acikca yapilir.
 */
export function parseTenantStatus(value: string): TenantStatus {
  const match = TENANT_STATUSES.find((status) => status === value);
  if (match === undefined) {
    throw new InvalidTenantStatusError(value);
  }
  return match;
}

/** Gecis tanimli mi? Hata firlatmaz — karar vermek isteyenler icin. */
export function canTransition(from: TenantStatus, to: TenantStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Gecisi dogrular; tanimsizsa hata firlatir.
 *
 * Entity her durum degisikliginde bunu cagirir, boylece gecis kurali tek bir
 * yerde yasar. Kurali her metoda `if` olarak dagitmak, bir gun birinin
 * unutulmasi demektir.
 */
export function assertTransition(from: TenantStatus, to: TenantStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTenantStatusTransitionError(from, to);
  }
}

/** Bir durumdan gidilebilecek durumlar. Test ve dokumantasyon icin. */
export function allowedTransitionsFrom(from: TenantStatus): readonly TenantStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
