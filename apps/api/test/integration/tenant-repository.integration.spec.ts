import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { DrizzleMembershipRepository } from '../../src/modules/tenant/infrastructure/drizzle-membership.repository';
import { DrizzleTenantRepository } from '../../src/modules/tenant/infrastructure/drizzle-tenant.repository';
import { MembershipId } from '../../src/modules/tenant/domain/membership-id.value-object';
import { MembershipRole } from '../../src/modules/tenant/domain/membership-role.value-object';
import { Membership } from '../../src/modules/tenant/domain/membership.entity';
import { Tenant } from '../../src/modules/tenant/domain/tenant.entity';
import { TenantId } from '../../src/modules/tenant/domain/tenant-id.value-object';
import { TenantSlug } from '../../src/modules/tenant/domain/tenant-slug.value-object';
import { TenantSlugAlreadyTakenError } from '../../src/modules/tenant/domain/tenant.error';
import { UserId } from '../../src/shared/user-id.value-object';
import {
  startTestDatabase,
  truncateTenantTables,
  type TestDatabase,
} from './support/test-database';

/**
 * Repository adapter'larinin GERCEK PostgreSQL'e ve GERCEK RLS'e karsi
 * dogrulanmasi.
 *
 * Birim testleri adapter'lari kapsayamaz: test etmek istedigimiz sey tam
 * olarak veritabaninin davranisidir — politikalar, kisitlar, transaction
 * semantigi. Mock bir veritabani bunlarin hicbirini calistirmaz.
 */

const TENANT_A_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B_ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B_ID = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';
const CREATED_AT = new Date('2026-07-21T10:00:00.000Z');

describe('tenant repository adapter (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let transactionManager: DrizzleTransactionManager;
  let tenantRepository: DrizzleTenantRepository;
  let membershipRepository: DrizzleMembershipRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    transactionManager = new DrizzleTransactionManager(database.appPool);
    tenantRepository = new DrizzleTenantRepository();
    membershipRepository = new DrizzleMembershipRepository();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await truncateTenantTables(database.ownerPool);
  });

  function tenantFor(id: string, slug: string, ownerId: string): Tenant {
    return Tenant.provision({
      id: TenantId.create(id),
      slug: TenantSlug.create(slug),
      name: `Tenant ${slug}`,
      ownerUserId: UserId.create(ownerId),
      createdAt: CREATED_AT,
    });
  }

  async function seedTenant(id: string, slug: string, ownerId: string): Promise<Tenant> {
    const tenant = tenantFor(id, slug, ownerId);
    await transactionManager.runInTenantTransaction(id, async () => {
      await tenantRepository.save(tenant);
    });
    return tenant;
  }

  // --- Transaction zorunlulugu -------------------------------------------

  it('transaction disinda cagrilan repository hata verir', async () => {
    // Fail closed: SET LOCAL'siz bir baglantida calisan sorgu ya RLS'e takilir
    // ya da filtresiz calisir. Ikincisi tum veritabanini acar, bu yuzden
    // havuza DUSULMEZ (11.4 kural 2).
    await expect(tenantRepository.findById(TenantId.create(TENANT_A_ID))).rejects.toThrow(
      /Aktif transaction yok/,
    );
  });

  it('ic ice transaction acmayi reddeder', async () => {
    // PostgreSQL ic ice BEGIN'i sessizce yok sayar; dis transaction geri
    // alinirsa "basarili" sanilan ic is de geri gider.
    await expect(
      transactionManager.runInTransaction(async () => {
        await transactionManager.runInTransaction(() => Promise.resolve());
      }),
    ).rejects.toThrow(/Ic ice transaction/);
  });

  // --- Kaydet / oku turu --------------------------------------------------

  it('tenant i kaydeder ve ayni haliyle geri okur', async () => {
    const saved = await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.findById(saved.id),
    );

    expect(loaded?.id.value).toBe(TENANT_A_ID);
    expect(loaded?.slug.value).toBe('acme');
    expect(loaded?.name).toBe('Tenant acme');
    expect(loaded?.status).toBe('provisioning');
    expect(loaded?.ownerUserId.value).toBe(USER_A_ID);
    expect(loaded?.createdAt).toEqual(CREATED_AT);
    expect(loaded?.archivedAt).toBeNull();
  });

  it('var olmayan tenant icin null doner', async () => {
    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.findById(TenantId.create(TENANT_A_ID)),
    );

    // Bulunamamak bir HATA degildir; cagiran taraf bunu domain kararina cevirir.
    expect(loaded).toBeNull();
  });

  it('durum degisikligini kalici hale getirir', async () => {
    const tenant = await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    tenant.markProvisioned();
    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await tenantRepository.save(tenant);
    });

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.findById(tenant.id),
    );
    expect(loaded?.status).toBe('active');
  });

  it('arsivleme zamanini kalici hale getirir', async () => {
    const tenant = await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);
    const archivedAt = new Date('2026-08-21T10:00:00.000Z');

    tenant.markProvisioned();
    tenant.archive(archivedAt);
    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await tenantRepository.save(tenant);
    });

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.findById(tenant.id),
    );
    expect(loaded?.status).toBe('archived');
    expect(loaded?.archivedAt).toEqual(archivedAt);
  });

  // --- RLS altinda izolasyon ---------------------------------------------

  it('baska bir tenant in kaydini okuyamaz', async () => {
    await seedTenant(TENANT_B_ID, 'globex', USER_B_ID);

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.findById(TenantId.create(TENANT_B_ID)),
    );

    // RLS filtreledi. Repository'de tek bir `WHERE tenant_id` satiri YOK.
    expect(loaded).toBeNull();
  });

  // --- Slug cozumleme -----------------------------------------------------

  it('slug u tenant kimligine cevirir (context olmadan)', async () => {
    await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    // Context YOK — resolution'in calisabilmesinin sarti (12.4.1).
    const ref = await transactionManager.runInTransaction(() =>
      tenantRepository.resolveBySlug(TenantSlug.create('acme')),
    );

    expect(ref?.id.value).toBe(TENANT_A_ID);
    expect(ref?.status).toBe('provisioning');
  });

  it('bilinmeyen slug icin null doner', async () => {
    const ref = await transactionManager.runInTransaction(() =>
      tenantRepository.resolveBySlug(TenantSlug.create('yok-boyle')),
    );

    expect(ref).toBeNull();
  });

  it('baska bir tenant in slug unu da cozebilir', async () => {
    // Cozumleme tenant sinirindan BAGIMSIZDIR — olmasi gereken de budur:
    // henuz hangi tenant oldugunu BILMIYORUZ. Guvenlik, donen alanlarin
    // darligindan gelir (yalnizca id ve status).
    await seedTenant(TENANT_B_ID, 'globex', USER_B_ID);

    const ref = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      tenantRepository.resolveBySlug(TenantSlug.create('globex')),
    );

    expect(ref?.id.value).toBe(TENANT_B_ID);
  });

  it('kullanimdaki slug u bildirir', async () => {
    await seedTenant(TENANT_B_ID, 'globex', USER_B_ID);

    const taken = await transactionManager.runInTransaction(() =>
      tenantRepository.existsBySlug(TenantSlug.create('globex')),
    );
    const free = await transactionManager.runInTransaction(() =>
      tenantRepository.existsBySlug(TenantSlug.create('bos-slug')),
    );

    // KRITIK: existsBySlug tabloyu dogrudan sorgusaydi RLS yuzunden BASKA bir
    // tenant'in slug'ini goremez ve daima "bos" derdi.
    expect(taken).toBe(true);
    expect(free).toBe(false);
  });

  // --- Kisit ihlallerinin domain hatasina cevrilmesi ----------------------

  it('alinmis slug ile kayit denemesini domain hatasina cevirir', async () => {
    await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    const duplicate = tenantFor(TENANT_B_ID, 'acme', USER_B_ID);

    // Yaris kosulunun kaybeden tarafi: existsBySlug'i gecip unique index'e
    // takilan istek. Ham PostgreSQL hatasi yukari SIZMAZ.
    await expect(
      transactionManager.runInTenantTransaction(TENANT_B_ID, async () => {
        await tenantRepository.save(duplicate);
      }),
    ).rejects.toThrow(TenantSlugAlreadyTakenError);
  });

  // --- Transaction geri alma ---------------------------------------------

  it('transaction geri alinirsa hicbir sey kalmaz', async () => {
    await expect(
      transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
        await tenantRepository.save(tenantFor(TENANT_A_ID, 'acme', USER_A_ID));
        throw new Error('use case patladi');
      }),
    ).rejects.toThrow('use case patladi');

    const rows = await database.ownerPool.query('SELECT id FROM platform.tenants');
    expect(rows.rowCount).toBe(0);
  });

  // --- Membership repository ---------------------------------------------

  it('uyeligi kaydeder ve tenant + kullanici ile geri okur', async () => {
    await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    const membership = Membership.createOwner({
      id: MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-000000000001'),
      tenantId: TenantId.create(TENANT_A_ID),
      userId: UserId.create(USER_A_ID),
      joinedAt: CREATED_AT,
    });

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await membershipRepository.save(membership);
    });

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      membershipRepository.findByTenantAndUser(
        TenantId.create(TENANT_A_ID),
        UserId.create(USER_A_ID),
      ),
    );

    expect(loaded?.role).toBe(MembershipRole.OWNER);
    expect(loaded?.status).toBe('active');
    expect(loaded?.grantsAccess).toBe(true);
    expect(loaded?.joinedAt).toEqual(CREATED_AT);
  });

  it('baska bir tenant in uyeligini okuyamaz', async () => {
    await seedTenant(TENANT_B_ID, 'globex', USER_B_ID);

    await transactionManager.runInTenantTransaction(TENANT_B_ID, async () => {
      await membershipRepository.save(
        Membership.createOwner({
          id: MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-000000000002'),
          tenantId: TenantId.create(TENANT_B_ID),
          userId: UserId.create(USER_B_ID),
          joinedAt: CREATED_AT,
        }),
      );
    });

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      membershipRepository.findByTenantAndUser(
        TenantId.create(TENANT_B_ID),
        UserId.create(USER_B_ID),
      ),
    );

    expect(loaded).toBeNull();
  });

  it('uyelik rol degisikligini kalici hale getirir', async () => {
    await seedTenant(TENANT_A_ID, 'acme', USER_A_ID);

    const membership = Membership.invite({
      id: MembershipId.create('018f3a2b-7c4d-7e1f-8a2b-000000000003'),
      tenantId: TenantId.create(TENANT_A_ID),
      userId: UserId.create(USER_B_ID),
      role: MembershipRole.VIEWER,
    });

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await membershipRepository.save(membership);
    });

    membership.acceptInvitation(CREATED_AT);
    membership.changeRole(MembershipRole.ADMIN);

    await transactionManager.runInTenantTransaction(TENANT_A_ID, async () => {
      await membershipRepository.save(membership);
    });

    const loaded = await transactionManager.runInTenantTransaction(TENANT_A_ID, () =>
      membershipRepository.findById(membership.id),
    );

    expect(loaded?.role).toBe(MembershipRole.ADMIN);
    expect(loaded?.status).toBe('active');
  });
});
