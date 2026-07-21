import { type TenantId } from './tenant-id.value-object';
import { type TenantSlug } from './tenant-slug.value-object';
import { type UserId } from './user-id.value-object';
import { assertTransition, type TenantStatus } from './tenant-status.value-object';
import {
  InconsistentTenantStateError,
  InvalidArchivedAtError,
  InvalidCreatedAtError,
  InvalidTenantNameError,
  TenantNotModifiableError,
} from './tenant.error';

/**
 * Tenant — izolasyon, faturalama ve yonetim sinirlarinin kesisimi
 * (ADR-0012, MULTI_TENANT_ARCHITECTURE 6).
 *
 * Bu uc sinirin ayni varliga bagli olmasi modelin tum sadeliginin kaynagidir;
 * ayristiklari an hiyerarsi kacinilmaz olur (ADR-0013).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR. Entity `new Date()` veya id uretmez —
 * DEVELOPMENT_RULES 3.2 domain icinde `Date.now()`/`Math.random()` cagrisini
 * yasaklar. `Clock` ve `IdGenerator` port'lari application katmanina aittir.
 * Bunun test tarafindaki karsiligi: bu entity'nin testleri sahte saat
 * gerektirmez (DEVELOPMENT_RULES 5.3 — domain testleri mock'suz).
 */

/** Ad icin ust sinir. Alt sinir: trim sonrasi bos olamaz. */
const MAX_NAME_LENGTH = 200;

export interface ProvisionTenantInput {
  readonly id: TenantId;
  readonly slug: TenantSlug;
  readonly name: string;
  readonly ownerUserId: UserId;
  readonly createdAt: Date;
}

/**
 * Tenant'in tam durumu.
 *
 * Hem constructor'in tek parametresi (DEVELOPMENT_RULES 2.5: 3'ten fazla
 * parametre obje olur) hem de `fromPersistence()` girdisidir.
 *
 * Alanlar value object tasir, ham `string` degil: satiri VO'lara cevirmek
 * repository adapter'inin isidir. Boylece bozuk bir kolon degeri entity'ye
 * ulasmadan, sinirda yakalanir.
 */
export interface TenantState {
  readonly id: TenantId;
  readonly slug: TenantSlug;
  readonly name: string;
  readonly status: TenantStatus;
  readonly ownerUserId: UserId;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
}

export class Tenant {
  readonly id: TenantId;
  readonly ownerUserId: UserId;

  #slug: TenantSlug;
  #name: string;
  #status: TenantStatus;
  #createdAt: Date;
  #archivedAt: Date | null;

  /**
   * Constructor PRIVATE'dir ve dogrulama YAPMAZ — yalnizca dogrulanmis
   * degerleri atar.
   *
   * Boylece iki kural birden saglanir: invariant'lar factory'de korunur
   * (istenen tasarim) ve gecersiz nesne yaratmak dilsel olarak imkansizdir
   * (ARCHITECTURE 4). `new Tenant(...)` derlenmez.
   */
  private constructor(state: TenantState) {
    this.id = state.id;
    this.ownerUserId = state.ownerUserId;
    this.#slug = state.slug;
    this.#name = state.name;
    this.#status = state.status;
    this.#createdAt = state.createdAt;
    this.#archivedAt = state.archivedAt;
  }

  /**
   * Tenant'i yaratmanin TEK yolu.
   *
   * Yeni tenant daima `provisioning` durumunda baslar: ADR-0016 geregi kayit,
   * owner membership'i ve varsayilan ayarlar tek transaction'da olusur; kurulum
   * ise (storage, arama index'i) asenkron tamamlanir. Bu tamamlanana kadar
   * tenant'in verisine erisim YOKTUR (MULTI_TENANT_ARCHITECTURE 6.3).
   */
  static provision(input: ProvisionTenantInput): Tenant {
    assertValidDate(input.createdAt, (reason) => new InvalidCreatedAtError(reason));

    return new Tenant({
      id: input.id,
      slug: input.slug,
      name: normalizeName(input.name),
      status: 'provisioning',
      ownerUserId: input.ownerUserId,
      createdAt: copyDate(input.createdAt),
      archivedAt: null,
    });
  }

  /**
   * Kalici kayittan (veritabani satiri) entity'yi yeniden kurar.
   *
   * `provision()` YENI bir tenant yaratir ve daima `provisioning` durumundan
   * baslar; bu metot ise VAR OLAN bir tenant'i oldugu durumla geri getirir —
   * `archived` ve `failed` dahil her durumu kabul eder.
   *
   * Bir arka kapi DEGILDIR: gecmis gecisleri tekrar dogrulamaz (kayit zaten
   * onlardan gecerek bugune geldi) ama durumun KENDI ICINDE tutarli olmasini
   * zorlar. Bozuk bir satir sessizce gecerli bir nesneye donusemez.
   */
  static fromPersistence(state: TenantState): Tenant {
    assertValidDate(state.createdAt, (reason) => new InvalidCreatedAtError(reason));
    assertArchivedAtConsistency(state);

    return new Tenant({
      id: state.id,
      slug: state.slug,
      name: normalizeName(state.name),
      status: state.status,
      ownerUserId: state.ownerUserId,
      createdAt: copyDate(state.createdAt),
      archivedAt: state.archivedAt === null ? null : copyDate(state.archivedAt),
    });
  }

  get slug(): TenantSlug {
    return this.#slug;
  }

  /** Date mutable oldugu icin kopya doner — bkz. `archivedAt`. */
  get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  get name(): string {
    return this.#name;
  }

  get status(): TenantStatus {
    return this.#status;
  }

  /**
   * Date mutable'dir; kopya donmezsek cagiran taraf entity'nin ic durumunu
   * disaridan degistirebilir.
   */
  get archivedAt(): Date | null {
    return this.#archivedAt === null ? null : copyDate(this.#archivedAt);
  }

  /** Yalnizca `active` tenant veri erisimine izin verir (6.3). */
  get isOperational(): boolean {
    return this.#status === 'active';
  }

  // --- Durum gecisleri (MULTI_TENANT_ARCHITECTURE 6.2) --------------------

  /** provisioning -> active. Asenkron kurulum basariyla tamamlandi. */
  markProvisioned(): void {
    this.#transitionTo('active');
  }

  /**
   * provisioning -> failed. Terminal: kayit bir telafi isi ile silinir ve
   * slug serbest birakilir (ADR-0016).
   */
  markProvisioningFailed(): void {
    this.#transitionTo('failed');
  }

  /** active -> suspended. Odeme basarisiz, politika ihlali veya operator karari. */
  suspend(): void {
    this.#transitionTo('suspended');
  }

  /** suspended -> active. */
  reactivate(): void {
    this.#transitionTo('active');
  }

  /**
   * active|suspended -> archived. Veri SILINMEZ, saklama penceresi boyunca
   * durur (MULTI_TENANT_ARCHITECTURE 6.4).
   */
  archive(archivedAt: Date): void {
    assertValidDate(archivedAt, (reason) => new InvalidArchivedAtError(reason));
    if (archivedAt.getTime() < this.#createdAt.getTime()) {
      throw new InvalidArchivedAtError('olusturulma zamanindan once olamaz');
    }

    this.#transitionTo('archived');
    this.#archivedAt = copyDate(archivedAt);
  }

  /**
   * archived -> active. Saklama penceresi ICINDE geri alma.
   *
   * Pencerenin dolup dolmadigi burada KONTROL EDILMEZ: bu bir sure politikasi
   * ve zaman okumasi gerektirir; ikisi de application katmaninin isidir.
   * Domain yalnizca "arsivden donus mumkundur" kuralini bilir.
   */
  restoreFromArchive(): void {
    this.#transitionTo('active');
    this.#archivedAt = null;
  }

  // --- Diger degisiklikler -----------------------------------------------

  rename(name: string): void {
    this.#assertModifiable();
    this.#name = normalizeName(name);
  }

  /**
   * Slug degisikligi veri katmanini ETKILEMEZ — hicbir satir slug'a bagli
   * degildir (MULTI_TENANT_ARCHITECTURE 6.1). Etkilenen tek sey routing ve
   * cache/CDN anahtarlaridir; onlarin temizligi `TenantSlugChanged` event'i
   * ile yapilir (15.2).
   */
  changeSlug(slug: TenantSlug): void {
    this.#assertModifiable();
    this.#slug = slug;
  }

  // --- Ic yardimcilar ----------------------------------------------------

  #transitionTo(next: TenantStatus): void {
    assertTransition(this.#status, next);
    this.#status = next;
  }

  /**
   * Arsivlenmis ve basarisiz tenant'lar kapali kayitlardir: biri saklama
   * surecinde, digeri silinmeyi bekliyor. Ikisinde de ad/slug degisikligi
   * anlamsizdir ve serbest birakilmis bir slug'i geri almak gibi yan etkiler
   * uretebilir.
   */
  #assertModifiable(): void {
    if (this.#status === 'archived' || this.#status === 'failed') {
      throw new TenantNotModifiableError(this.#status);
    }
  }
}

function normalizeName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new InvalidTenantNameError('bos olamaz');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new InvalidTenantNameError(`en fazla ${String(MAX_NAME_LENGTH)} karakter olabilir`);
  }

  return trimmed;
}

/**
 * Tutarlilik invariant'i: `status === 'archived'` <=> `archivedAt !== null`.
 *
 * Iki yon de kontrol edilir. Yalnizca birini kontrol etmek, ters yondeki bozuk
 * satiri (ornegin arsivden geri alinmis ama `archived_at` temizlenmemis bir
 * kayit) sessizce kabul etmek demektir — ve o kayit, saklama suresi hesaplayan
 * her isi yaniltir.
 */
function assertArchivedAtConsistency(state: TenantState): void {
  if (state.status === 'archived') {
    if (state.archivedAt === null) {
      throw new InconsistentTenantStateError('arsivlenmis tenant arsivleme zamani tasimali');
    }
    assertValidDate(state.archivedAt, (reason) => new InvalidArchivedAtError(reason));
    if (state.archivedAt.getTime() < state.createdAt.getTime()) {
      throw new InconsistentTenantStateError(
        'arsivleme zamani olusturulma zamanindan once olamaz',
      );
    }
    return;
  }

  if (state.archivedAt !== null) {
    throw new InconsistentTenantStateError(
      `"${state.status}" durumundaki tenant arsivleme zamani tasiyamaz`,
    );
  }
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` dondurur. Sinirda yakalanmazsa
 * veritabanina `null` olarak dusen bir zaman degeri olusur.
 */
function assertValidDate(value: Date, toError: (reason: string) => Error): void {
  if (Number.isNaN(value.getTime())) {
    throw toError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
