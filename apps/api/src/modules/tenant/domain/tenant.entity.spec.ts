import { describe, expect, it } from 'vitest';

import { TenantId } from './tenant-id.value-object';
import { UserId } from '../../../shared/user-id.value-object';
import { TenantSlug } from './tenant-slug.value-object';
import { Tenant, type ProvisionTenantInput, type TenantState } from './tenant.entity';
import {
  InconsistentTenantStateError,
  InvalidArchivedAtError,
  InvalidCreatedAtError,
  InvalidTenantNameError,
  InvalidTenantStatusTransitionError,
  TenantNotModifiableError,
} from './tenant.error';

const CREATED_AT = new Date('2026-07-21T10:00:00.000Z');
const LATER = new Date('2026-08-21T10:00:00.000Z');

/**
 * Zaman ve kimlik disaridan geliyor; bu yuzden testler sahte saat veya sahte
 * id uretici GEREKTIRMEZ (DEVELOPMENT_RULES 5.3 — domain testleri mock'suz).
 */
function provisionTenant(overrides: Partial<ProvisionTenantInput> = {}): Tenant {
  return Tenant.provision({
    id: TenantId.create('018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b'),
    slug: TenantSlug.create('acme'),
    name: 'Acme Ltd.',
    ownerUserId: UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c'),
    createdAt: CREATED_AT,
    ...overrides,
  });
}

/** Verilen duruma, yalnizca izin verilen gecisleri kullanarak ulasir. */
function tenantInStatus(status: 'active' | 'suspended' | 'archived' | 'failed'): Tenant {
  const tenant = provisionTenant();

  if (status === 'failed') {
    tenant.markProvisioningFailed();
    return tenant;
  }

  tenant.markProvisioned();
  if (status === 'active') return tenant;

  if (status === 'suspended') {
    tenant.suspend();
    return tenant;
  }

  tenant.archive(LATER);
  return tenant;
}

describe('Tenant.provision', () => {
  it('yeni tenant.i provisioning durumunda yaratir', () => {
    // ADR-0016: kurulum asenkron tamamlanana kadar veri erisimi YOK.
    expect(provisionTenant().status).toBe('provisioning');
  });

  it('yeni tenant.i arsivlenmemis olarak yaratir', () => {
    expect(provisionTenant().archivedAt).toBeNull();
  });

  it('verilen kimlik, slug ve sahibi korur', () => {
    const tenant = provisionTenant();

    expect(tenant.id.value).toBe('018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b');
    expect(tenant.slug.value).toBe('acme');
    expect(tenant.ownerUserId.value).toBe('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
  });

  it('provisioning durumundaki tenant.i islemeye hazir saymaz', () => {
    expect(provisionTenant().isOperational).toBe(false);
  });

  it('adin basindaki ve sonundaki bosluklari temizler', () => {
    expect(provisionTenant({ name: '  Acme Ltd.  ' }).name).toBe('Acme Ltd.');
  });

  it('bos ad ile yaratmayi reddeder', () => {
    expect(() => provisionTenant({ name: '' })).toThrow(InvalidTenantNameError);
  });

  it('yalnizca bosluktan olusan ad ile yaratmayi reddeder', () => {
    expect(() => provisionTenant({ name: '   ' })).toThrow(InvalidTenantNameError);
  });

  it('200 karakterden uzun ad ile yaratmayi reddeder', () => {
    expect(() => provisionTenant({ name: 'a'.repeat(201) })).toThrow(InvalidTenantNameError);
  });

  it('gecersiz olusturulma zamani ile yaratmayi reddeder', () => {
    // new Date('gecersiz') hata firlatmaz, Invalid Date uretir ve tum
    // karsilastirmalarda sessizce false doner.
    expect(() => provisionTenant({ createdAt: new Date('gecersiz') })).toThrow(
      InvalidCreatedAtError,
    );
  });
});

describe('Tenant.fromPersistence', () => {
  function persistedState(overrides: Partial<TenantState> = {}): TenantState {
    return {
      id: TenantId.create('018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b'),
      slug: TenantSlug.create('acme'),
      name: 'Acme Ltd.',
      status: 'active',
      ownerUserId: UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c'),
      createdAt: CREATED_AT,
      archivedAt: null,
      ...overrides,
    };
  }

  it('kalici kayittaki durumu oldugu gibi geri getirir', () => {
    // provision() daima provisioning'den baslar; bu metot VAR OLAN durumu korur.
    const tenant = Tenant.fromPersistence(persistedState({ status: 'suspended' }));

    expect(tenant.status).toBe('suspended');
  });

  it('arsivlenmis tenant.i arsivleme zamaniyla geri getirir', () => {
    const tenant = Tenant.fromPersistence(
      persistedState({ status: 'archived', archivedAt: LATER }),
    );

    expect(tenant.status).toBe('archived');
    expect(tenant.archivedAt).toEqual(LATER);
  });

  it('basarisiz tenant.i geri getirir', () => {
    expect(Tenant.fromPersistence(persistedState({ status: 'failed' })).status).toBe('failed');
  });

  it('geri getirilen tenant uzerinde durum gecisleri calismaya devam eder', () => {
    const tenant = Tenant.fromPersistence(persistedState({ status: 'active' }));
    tenant.suspend();

    expect(tenant.status).toBe('suspended');
  });

  it('geri getirilen tenant gecmise degil MEVCUT duruma gore gecis dogrular', () => {
    // suspended -> active gecerli, ama suspended -> failed degil.
    const tenant = Tenant.fromPersistence(persistedState({ status: 'suspended' }));

    expect(() => {
      tenant.markProvisioningFailed();
    }).toThrow(InvalidTenantStatusTransitionError);
  });

  it('arsivleme zamani olmayan arsivlenmis kaydi reddeder', () => {
    expect(() => Tenant.fromPersistence(persistedState({ status: 'archived' }))).toThrow(
      InconsistentTenantStateError,
    );
  });

  it('arsivlenmemis oldugu halde arsivleme zamani tasiyan kaydi reddeder', () => {
    // Ters yon: arsivden geri alinmis ama archived_at temizlenmemis bir satir.
    // Sessizce kabul edilirse saklama suresi hesaplayan her isi yaniltir.
    expect(() =>
      Tenant.fromPersistence(persistedState({ status: 'active', archivedAt: LATER })),
    ).toThrow(InconsistentTenantStateError);
  });

  it('provisioning durumunda arsivleme zamani tasiyan kaydi reddeder', () => {
    expect(() =>
      Tenant.fromPersistence(persistedState({ status: 'provisioning', archivedAt: LATER })),
    ).toThrow(InconsistentTenantStateError);
  });

  it('olusturulma zamanindan onceki arsivleme zamanini reddeder', () => {
    expect(() =>
      Tenant.fromPersistence(
        persistedState({
          status: 'archived',
          archivedAt: new Date('2026-07-20T10:00:00.000Z'),
        }),
      ),
    ).toThrow(InconsistentTenantStateError);
  });

  it('gecersiz arsivleme zamani tasiyan kaydi reddeder', () => {
    expect(() =>
      Tenant.fromPersistence(persistedState({ status: 'archived', archivedAt: new Date('x') })),
    ).toThrow(InvalidArchivedAtError);
  });

  it('gecersiz olusturulma zamani tasiyan kaydi reddeder', () => {
    expect(() => Tenant.fromPersistence(persistedState({ createdAt: new Date('x') }))).toThrow(
      InvalidCreatedAtError,
    );
  });

  it('bos ad tasiyan kaydi reddeder', () => {
    expect(() => Tenant.fromPersistence(persistedState({ name: '   ' }))).toThrow(
      InvalidTenantNameError,
    );
  });

  it('kaydin tarihlerini kopyalar', () => {
    const mutableArchivedAt = new Date(LATER.getTime());
    const tenant = Tenant.fromPersistence(
      persistedState({ status: 'archived', archivedAt: mutableArchivedAt }),
    );

    mutableArchivedAt.setFullYear(2099);

    expect(tenant.archivedAt?.getFullYear()).toBe(LATER.getFullYear());
  });
});

describe('Tenant durum gecisleri', () => {
  it('provisioning tamamlandiginda tenant.i aktiflestirir', () => {
    const tenant = provisionTenant();
    tenant.markProvisioned();

    expect(tenant.status).toBe('active');
    expect(tenant.isOperational).toBe(true);
  });

  it('provisioning basarisiz oldugunda failed durumuna gecirir', () => {
    const tenant = provisionTenant();
    tenant.markProvisioningFailed();

    expect(tenant.status).toBe('failed');
  });

  it('aktif tenant.i askiya alir', () => {
    const tenant = tenantInStatus('active');
    tenant.suspend();

    expect(tenant.status).toBe('suspended');
    expect(tenant.isOperational).toBe(false);
  });

  it('askidaki tenant.i yeniden aktiflestirir', () => {
    const tenant = tenantInStatus('suspended');
    tenant.reactivate();

    expect(tenant.status).toBe('active');
  });

  it('aktif tenant.i arsivler ve arsivleme zamanini kaydeder', () => {
    const tenant = tenantInStatus('active');
    tenant.archive(LATER);

    expect(tenant.status).toBe('archived');
    expect(tenant.archivedAt).toEqual(LATER);
  });

  it('askidaki tenant.i arsivler', () => {
    const tenant = tenantInStatus('suspended');
    tenant.archive(LATER);

    expect(tenant.status).toBe('archived');
  });

  it('arsivlenmis tenant.i saklama penceresi icinde geri alir', () => {
    const tenant = tenantInStatus('archived');
    tenant.restoreFromArchive();

    expect(tenant.status).toBe('active');
    expect(tenant.archivedAt).toBeNull();
  });

  it('provisioning durumundaki tenant.i askiya almayi reddeder', () => {
    expect(() => { provisionTenant().suspend(); }).toThrow(InvalidTenantStatusTransitionError);
  });

  it('provisioning durumundaki tenant.i arsivlemeyi reddeder', () => {
    expect(() => { provisionTenant().archive(LATER); }).toThrow(InvalidTenantStatusTransitionError);
  });

  it('aktif tenant.i tekrar aktiflestirmeyi reddeder', () => {
    expect(() => { tenantInStatus('active').markProvisioned(); }).toThrow(
      InvalidTenantStatusTransitionError,
    );
  });

  it('aktif tenant.i basarisiz olarak isaretlemeyi reddeder', () => {
    expect(() => { tenantInStatus('active').markProvisioningFailed(); }).toThrow(
      InvalidTenantStatusTransitionError,
    );
  });

  it('basarisiz tenant.i aktiflestirmeyi reddeder', () => {
    // failed terminal: duzeltilmez, kayit silinir (ADR-0016).
    expect(() => { tenantInStatus('failed').markProvisioned(); }).toThrow(
      InvalidTenantStatusTransitionError,
    );
  });

  it('basarisiz tenant.i arsivlemeyi reddeder', () => {
    expect(() => { tenantInStatus('failed').archive(LATER); }).toThrow(
      InvalidTenantStatusTransitionError,
    );
  });

  it('arsivlenmis tenant.i askiya almayi reddeder', () => {
    expect(() => { tenantInStatus('archived').suspend(); }).toThrow(InvalidTenantStatusTransitionError);
  });

  it('gecersiz gecis denendiginde durumu degistirmeden birakir', () => {
    const tenant = provisionTenant();

    expect(() => { tenant.suspend(); }).toThrow(InvalidTenantStatusTransitionError);
    expect(tenant.status).toBe('provisioning');
  });

  it('olusturulma zamanindan onceki bir arsivleme zamanini reddeder', () => {
    const tenant = tenantInStatus('active');
    const beforeCreation = new Date('2026-07-20T10:00:00.000Z');

    expect(() => { tenant.archive(beforeCreation); }).toThrow(InvalidArchivedAtError);
  });

  it('gecersiz arsivleme zamanini reddeder', () => {
    const tenant = tenantInStatus('active');

    expect(() => { tenant.archive(new Date('gecersiz')); }).toThrow(InvalidArchivedAtError);
  });

  it('arsivleme reddedildiginde durumu degistirmeden birakir', () => {
    const tenant = tenantInStatus('active');

    expect(() => { tenant.archive(new Date('gecersiz')); }).toThrow(InvalidArchivedAtError);
    expect(tenant.status).toBe('active');
    expect(tenant.archivedAt).toBeNull();
  });
});

describe('Tenant ad ve slug degisikligi', () => {
  it('aktif tenant.in adini degistirir', () => {
    const tenant = tenantInStatus('active');
    tenant.rename('Acme Holding');

    expect(tenant.name).toBe('Acme Holding');
  });

  it('yeni adin bosluklarini temizler', () => {
    const tenant = tenantInStatus('active');
    tenant.rename('  Acme Holding  ');

    expect(tenant.name).toBe('Acme Holding');
  });

  it('bos ada degistirmeyi reddeder', () => {
    const tenant = tenantInStatus('active');

    expect(() => { tenant.rename('  '); }).toThrow(InvalidTenantNameError);
    expect(tenant.name).toBe('Acme Ltd.');
  });

  it('aktif tenant.in slug.ini degistirir', () => {
    const tenant = tenantInStatus('active');
    tenant.changeSlug(TenantSlug.create('acme-holding'));

    expect(tenant.slug.value).toBe('acme-holding');
  });

  it('slug degisikligi tenant kimligini etkilemez', () => {
    // MULTI_TENANT_ARCHITECTURE 6.1: slug routing kimligidir, guvenlik
    // kimligi degildir. RLS anahtari olan id degismez.
    const tenant = tenantInStatus('active');
    const idBefore = tenant.id.value;

    tenant.changeSlug(TenantSlug.create('globex'));

    expect(tenant.id.value).toBe(idBefore);
  });

  it('arsivlenmis tenant.in adini degistirmeyi reddeder', () => {
    expect(() => { tenantInStatus('archived').rename('Yeni Ad'); }).toThrow(TenantNotModifiableError);
  });

  it('arsivlenmis tenant.in slug.ini degistirmeyi reddeder', () => {
    expect(() => { tenantInStatus('archived').changeSlug(TenantSlug.create('globex')); }).toThrow(
      TenantNotModifiableError,
    );
  });

  it('basarisiz tenant.in adini degistirmeyi reddeder', () => {
    expect(() => { tenantInStatus('failed').rename('Yeni Ad'); }).toThrow(TenantNotModifiableError);
  });

  it('provisioning durumundaki tenant.in adini degistirmeye izin verir', () => {
    const tenant = provisionTenant();
    tenant.rename('Acme Holding');

    expect(tenant.name).toBe('Acme Holding');
  });
});

describe('Tenant kapsulleme', () => {
  it('new ile yaratilmayi derleme zamaninda engeller', () => {
    // Bu test CALISMA zamaninda degil DERLEME zamaninda is gorur: constructor
    // private oldugu icin asagidaki satir derlenmemelidir. Bir gun constructor
    // yanlislikla public yapilirsa beklenen hata olusmaz ve @ts-expect-error
    // "kullanilmayan bastirma" olarak typecheck'i KIRAR.
    type PublicConstructor = new (...args: never[]) => Tenant;

    // @ts-expect-error — private constructor public bir construct imzasina atanamaz.
    const construct: PublicConstructor = Tenant;

    expect(construct).toBe(Tenant);
  });

  it('disaridan durum degistirilmesine izin vermez', () => {
    const tenant = provisionTenant();

    // #status private field: sinif disindan erisilemez. Tek degisim yolu
    // dogrulanmis gecis metotlaridir.
    expect(Object.keys(tenant)).not.toContain('status');
  });

  it('arsivleme zamaninin kopyasini dondurur', () => {
    // Date mutable'dir; referans dondurulurse cagiran taraf entity'nin ic
    // durumunu disaridan degistirebilir.
    const tenant = tenantInStatus('archived');
    const archivedAt = tenant.archivedAt;

    archivedAt?.setFullYear(2099);

    expect(tenant.archivedAt?.getFullYear()).toBe(LATER.getFullYear());
  });

  it('olusturulma zamani disaridan degistirilse bile ic durumu korur', () => {
    const mutableDate = new Date(CREATED_AT.getTime());
    const tenant = provisionTenant({ createdAt: mutableDate });

    mutableDate.setFullYear(2099);

    expect(tenant.createdAt.getFullYear()).toBe(CREATED_AT.getFullYear());
  });
});
