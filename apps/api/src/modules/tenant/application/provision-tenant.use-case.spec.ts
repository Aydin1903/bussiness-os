import { describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type DomainEvent } from '../../../shared/domain-event';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type MembershipId } from '../domain/membership-id.value-object';
import { type Membership } from '../domain/membership.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import { TenantSlug } from '../domain/tenant-slug.value-object';
import { TenantProvisioningRequested } from '../domain/tenant-provisioning-requested.event';
import { type Tenant } from '../domain/tenant.entity';
import { TenantSlugAlreadyTakenError } from '../domain/tenant.error';
import { UserId } from '../../../shared/user-id.value-object';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import {
  type MembershipRepository,
  type UserMembershipRowPage,
} from './membership.repository.port';
import {
  ProvisionTenantUseCase,
  type ProvisionTenantDependencies,
} from './provision-tenant.use-case';
import { type TenantProvisioningPolicy } from './tenant-provisioning-policy.port';
import { type TenantRef, type TenantRepository } from './tenant.repository.port';

/**
 * Bu testler MOCK KUTUPHANESI kullanmaz — elle yazilmis FAKE'ler kullanir.
 *
 * DEVELOPMENT_RULES 5.3 mock yasagini domain testleri icin koyar; use case
 * port'lara bagimlidir ve bir sahte implementasyona ihtiyac duyar. Fake'ler
 * gercek davranisi taklit eder (in-memory saklama, rollback), mock'lar gibi
 * "su cagrildi mi" iddiasi kurmaz — bu, testleri implementasyon detayina
 * degil DAVRANISA bagli tutar.
 */

const OWNER_USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const NOW = new Date('2026-07-21T10:00:00.000Z');
const CORRELATION_ID = 'corr-01J8X';

class FakeTenantRepository implements TenantRepository {
  readonly saved: Tenant[] = [];
  takenSlugs = new Set<string>();

  findById(): Promise<Tenant | null> {
    return Promise.resolve(null);
  }

  resolveBySlug(slug: TenantSlug): Promise<TenantRef | null> {
    return Promise.resolve(
      this.takenSlugs.has(slug.value)
        ? { id: TenantId.create('018f3a2b-7c4d-7e1f-8a2b-0000000000ff'), status: 'active' }
        : null,
    );
  }

  existsBySlug(slug: TenantSlug): Promise<boolean> {
    return Promise.resolve(this.takenSlugs.has(slug.value));
  }

  save(tenant: Tenant): Promise<void> {
    this.saved.push(tenant);
    return Promise.resolve();
  }
}

class FakeMembershipRepository implements MembershipRepository {
  readonly saved: Membership[] = [];
  failOnSave = false;

  findById(_id: MembershipId): Promise<Membership | null> {
    return Promise.resolve(null);
  }

  findByTenantAndUser(): Promise<Membership | null> {
    return Promise.resolve(null);
  }

  /** Provisioning listeleme yapmaz; sozlesme geregi bulunur. */
  listByTenant(): Promise<{ items: readonly Membership[]; total: number }> {
    return Promise.resolve({ items: [], total: 0 });
  }

  listUserMemberships(): Promise<UserMembershipRowPage> {
    return Promise.resolve({ items: [], total: 0 });
  }

  save(membership: Membership): Promise<void> {
    if (this.failOnSave) {
      return Promise.reject(new Error('veritabani hatasi'));
    }
    this.saved.push(membership);
    return Promise.resolve();
  }
}

class FakeEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

class FakeProvisioningPolicy implements TenantProvisioningPolicy {
  rejectionReason: Error | null = null;

  assertCanProvision(): Promise<void> {
    return this.rejectionReason === null
      ? Promise.resolve()
      : Promise.reject(this.rejectionReason);
  }
}

/**
 * Transaction davranisini gercekten taklit eder: `fn` hata firlatirsa, o
 * transaction icinde yapilan tum yazmalar GERI ALINIR.
 *
 * Bu, testin en degerli parcasi — "hata olursa hicbir sey kalmaz" iddiasini
 * gercekten dogrular, yalnizca metodun cagrildigini degil.
 */
class FakeTransactionManager implements TransactionManager {
  readonly tenantContexts: string[] = [];
  rolledBack = false;

  constructor(
    private readonly tenantRepository: FakeTenantRepository,
    private readonly membershipRepository: FakeMembershipRepository,
    private readonly eventPublisher: FakeEventPublisher,
  ) {}

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.#run(fn);
  }

  async runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    this.tenantContexts.push(tenantId);
    return this.#run(fn);
  }

  /**
   * Ambient context bu testlerde kullanilmaz; sozlesme geregi bulunur.
   * Fail-closed davranisi gercek adapter'in entegrasyon testinde dogrulanir.
   */
  runInCurrentTenantTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.runInTransaction(fn);
  }

  async #run<T>(fn: () => Promise<T>): Promise<T> {
    const tenantCount = this.tenantRepository.saved.length;
    const membershipCount = this.membershipRepository.saved.length;
    const eventCount = this.eventPublisher.published.length;

    try {
      return await fn();
    } catch (error) {
      this.tenantRepository.saved.length = tenantCount;
      this.membershipRepository.saved.length = membershipCount;
      this.eventPublisher.published.length = eventCount;
      this.rolledBack = true;
      throw error;
    }
  }
}

/** Sirali, ongorulebilir id'ler — testin ne bekledigi okunabilir kalir. */
class SequentialIdGenerator implements IdGenerator {
  #next = 1;

  nextId(): string {
    const suffix = String(this.#next).padStart(12, '0');
    this.#next += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-${suffix}`;
  }
}

class FixedClock implements Clock {
  constructor(private readonly value: Date) {}

  now(): Date {
    return new Date(this.value.getTime());
  }
}

interface Harness extends ProvisionTenantDependencies {
  readonly tenantRepository: FakeTenantRepository;
  readonly membershipRepository: FakeMembershipRepository;
  readonly provisioningPolicy: FakeProvisioningPolicy;
  readonly eventPublisher: FakeEventPublisher;
  readonly transactionManager: FakeTransactionManager;
  readonly useCase: ProvisionTenantUseCase;
}

function createHarness(): Harness {
  const tenantRepository = new FakeTenantRepository();
  const membershipRepository = new FakeMembershipRepository();
  const eventPublisher = new FakeEventPublisher();
  const provisioningPolicy = new FakeProvisioningPolicy();
  const transactionManager = new FakeTransactionManager(
    tenantRepository,
    membershipRepository,
    eventPublisher,
  );

  const deps: ProvisionTenantDependencies = {
    tenantRepository,
    membershipRepository,
    provisioningPolicy,
    eventPublisher,
    transactionManager,
    idGenerator: new SequentialIdGenerator(),
    clock: new FixedClock(NOW),
  };

  return {
    ...deps,
    tenantRepository,
    membershipRepository,
    provisioningPolicy,
    eventPublisher,
    transactionManager,
    useCase: new ProvisionTenantUseCase(deps),
  };
}

function command(overrides: Partial<Parameters<ProvisionTenantUseCase['execute']>[0]> = {}) {
  return {
    ownerUserId: OWNER_USER_ID,
    name: 'Acme Ltd.',
    slug: TenantSlug.create('acme'),
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('ProvisionTenantUseCase — mutlu yol', () => {
  it('tenant.i active durumunda olusturur (V1 senkron provisioning)', async () => {
    // ADR-0016 V1 notu: yapilacak gercek asenkron is olmadigindan provisioning
    // senkrondur; tenant ayni transaction'da `active` acilir.
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    expect(tenant.status).toBe('active');
    expect(tenant.slug.value).toBe('acme');
    expect(tenant.name).toBe('Acme Ltd.');
  });

  it('tenant.i kalici hale getirir', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.tenantRepository.saved).toHaveLength(1);
  });

  it('owner uyeligini aktif olarak olusturur', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const [membership] = harness.membershipRepository.saved;
    expect(membership?.role.isOwner).toBe(true);
    expect(membership?.status).toBe('active');
    expect(membership?.grantsAccess).toBe(true);
  });

  it('owner uyeligini tenant.i acan kullaniciya baglar', async () => {
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    const [membership] = harness.membershipRepository.saved;
    expect(membership?.userId.equals(tenant.ownerUserId)).toBe(true);
    expect(membership?.tenantId.equals(tenant.id)).toBe(true);
  });

  it('tenant ve uyelik icin FARKLI kimlikler uretir', async () => {
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    const [membership] = harness.membershipRepository.saved;
    expect(membership?.id.value).not.toBe(tenant.id.value);
  });

  it('tenant ve uyelige ayni zaman damgasini verir', async () => {
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    expect(tenant.createdAt).toEqual(NOW);
    expect(harness.membershipRepository.saved[0]?.joinedAt).toEqual(NOW);
  });

  it('TenantProvisioningRequested event.ini yayinlar', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    const [event] = harness.eventPublisher.published;
    expect(event?.eventType).toBe(TenantProvisioningRequested.TYPE);
    expect(event?.eventVersion).toBe(TenantProvisioningRequested.VERSION);
  });

  it('event.e tenant kimligini ve correlation id.yi tasir', async () => {
    // MULTI_TENANT_ARCHITECTURE 15.1: tenant'a atfedilemeyen event yayinlanamaz.
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    const [event] = harness.eventPublisher.published;
    expect(event?.tenantId).toBe(tenant.id.value);
    expect(event?.correlationId).toBe(CORRELATION_ID);
  });

  it('event payload.inda ilkel degerler tasir', async () => {
    // Event serilestirilip outbox'a yazilir; sozlesme bastan ilkel olmali.
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    expect(harness.eventPublisher.published[0]?.payload).toEqual({
      tenantId: tenant.id.value,
      slug: 'acme',
      name: 'Acme Ltd.',
      ownerUserId: OWNER_USER_ID.value,
    });
  });

  it('adin bosluklarini temizleyerek kaydeder', async () => {
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command({ name: '  Acme Ltd.  ' }));

    expect(tenant.name).toBe('Acme Ltd.');
    expect(harness.eventPublisher.published[0]?.payload).toMatchObject({ name: 'Acme Ltd.' });
  });
});

describe('ProvisionTenantUseCase — transaction sinirI', () => {
  it('yazmalari tenant context.i kurulmus tek transaction icinde yapar', async () => {
    // memberships standart RLS'e tabidir (12.4): context olmadan INSERT
    // RLS'e takilir. Transaction yeni tenant'in id'siyle acilmali.
    const harness = createHarness();

    const tenant = await harness.useCase.execute(command());

    expect(harness.transactionManager.tenantContexts).toEqual([tenant.id.value]);
  });

  it('tek transaction acar, ic ice transaction kullanmaz', async () => {
    const harness = createHarness();

    await harness.useCase.execute(command());

    expect(harness.transactionManager.tenantContexts).toHaveLength(1);
  });

  it('uyelik kaydedilemezse tenant.i da kaydetmez', async () => {
    // ADR-0016'nin cekirdek garantisi: SAHIPSIZ TENANT ASLA VAR OLAMAZ.
    const harness = createHarness();
    harness.membershipRepository.failOnSave = true;

    await expect(harness.useCase.execute(command())).rejects.toThrow('veritabani hatasi');

    expect(harness.tenantRepository.saved).toHaveLength(0);
    expect(harness.transactionManager.rolledBack).toBe(true);
  });

  it('uyelik kaydedilemezse event de yayinlanmaz', async () => {
    const harness = createHarness();
    harness.membershipRepository.failOnSave = true;

    await expect(harness.useCase.execute(command())).rejects.toThrow('veritabani hatasi');

    expect(harness.eventPublisher.published).toHaveLength(0);
  });
});

describe('ProvisionTenantUseCase — onkosullar', () => {
  it('politika reddederse politikanin hatasini yukseltir', async () => {
    const harness = createHarness();
    harness.provisioningPolicy.rejectionReason = new Error('Once e-postanizi dogrulayin');

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      'Once e-postanizi dogrulayin',
    );
  });

  it('politika reddederse hicbir sey kaydetmez', async () => {
    // ADR-0016: dogrulanmamis e-posta ile tenant OLUSTURULMAZ.
    const harness = createHarness();
    harness.provisioningPolicy.rejectionReason = new Error('Once e-postanizi dogrulayin');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    expect(harness.tenantRepository.saved).toHaveLength(0);
    expect(harness.membershipRepository.saved).toHaveLength(0);
    expect(harness.eventPublisher.published).toHaveLength(0);
  });

  it('politika reddederse transaction hic acmaz', async () => {
    const harness = createHarness();
    harness.provisioningPolicy.rejectionReason = new Error('reddedildi');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    expect(harness.transactionManager.tenantContexts).toHaveLength(0);
  });

  it('slug alinmissa TenantSlugAlreadyTakenError firlatir', async () => {
    const harness = createHarness();
    harness.tenantRepository.takenSlugs.add('acme');

    await expect(harness.useCase.execute(command())).rejects.toThrow(TenantSlugAlreadyTakenError);
  });

  it('slug alinmissa hicbir sey kaydetmez', async () => {
    const harness = createHarness();
    harness.tenantRepository.takenSlugs.add('acme');

    await expect(harness.useCase.execute(command())).rejects.toThrow();

    // Transaction ACILIR ama GERI ALINIR. Slug kontrolu transaction'in
    // ICINDEDIR cunku repository cagrilari aktif transaction gerektirir
    // (11.4 kural 2) — bu, entegrasyon testinin ortaya cikardigi bir
    // etkilesimdi: fake'ler transaction zorunlulugunu taklit etmiyordu.
    expect(harness.tenantRepository.saved).toHaveLength(0);
    expect(harness.membershipRepository.saved).toHaveLength(0);
    expect(harness.transactionManager.rolledBack).toBe(true);
  });

  it('onkosulu slug kontrolunden ONCE dogrular', async () => {
    // Yetkisiz kullaniciya slug'in alinip alinmadigi bilgisi sizdirilmamali.
    const harness = createHarness();
    harness.provisioningPolicy.rejectionReason = new Error('Once e-postanizi dogrulayin');
    harness.tenantRepository.takenSlugs.add('acme');

    await expect(harness.useCase.execute(command())).rejects.toThrow(
      'Once e-postanizi dogrulayin',
    );
  });
});
