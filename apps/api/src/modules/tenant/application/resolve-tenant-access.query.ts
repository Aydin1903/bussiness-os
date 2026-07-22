import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { InvalidTenantIdError } from '../domain/tenant.error';
import { TenantId } from '../domain/tenant-id.value-object';
import { UserId } from '../../../shared/user-id.value-object';
import {
  type ResolveMemberAccessInput,
  type TenantAccessQuery,
  type TenantAccessResult,
} from '../tenant.public';
import { type MembershipRepository } from './membership.repository.port';
import { type TenantRepository } from './tenant.repository.port';

/**
 * `TenantAccessQuery`'nin implementasyonu — switch-tenant'in erisim cozumu
 * (MULTI_TENANT_ARCHITECTURE 7.4, 8.2 MEM+TST adimlari).
 *
 * Use case'lerle ayni desen: saf TypeScript, @Injectable() TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `tenant.module.ts` factory ile verir.
 *
 * ============================================================================
 * NEDEN TENANT CONTEXT'LI TRANSACTION
 * ============================================================================
 * Bu sorgu tam da tenant context'inin HENUZ KURULMADIGI yerde calisir: seciligi
 * yapacak olan dogrulamanin kendisidir (8.2). `platform.memberships` standart
 * RLS'e tabidir (12.4) — context olmadan `SELECT` hicbir satir donduremez.
 * Bu yuzden okumalar, hedef tenant'in id'siyle acilan bir
 * `runInTenantTransaction` icinde yapilir; RLS o tenant'in satirlarina daralir.
 *
 * Context'i istemcinin talep ettigi `tenantId` ile kurmak bir sizinti DEGILDIR:
 * RLS okumalari yine o tek tenant'a daraltir ve sonuc yalnizca "erisebilir mi"
 * cevabidir. Ayni yaklasim cozum zincirinde de kullanilir (8.2).
 * ============================================================================
 */
export interface ResolveTenantAccessDependencies {
  readonly tenantRepository: TenantRepository;
  readonly membershipRepository: MembershipRepository;
  readonly transactionManager: TransactionManager;
}

export class ResolveTenantAccessQuery implements TenantAccessQuery {
  constructor(private readonly deps: ResolveTenantAccessDependencies) {}

  async resolveMemberAccess(input: ResolveMemberAccessInput): Promise<TenantAccessResult> {
    // Kimlikler transaction'dan ONCE cozulur: gecersizse baglanti bos yere
    // tutulmaz (provisioning use case'iyle ayni ilke).
    //
    // ASIMETRI BILINCLIDIR:
    // - `tenantId` ISTEMCIDEN gelir (switch-tenant talebi). Bicimsel olarak
    //   bozuksa "yok" ile ayni: uniform `403`, olmayan tenant'i var olandan
    //   ayirt ettirmemek icin sessizce reddedilir (fail closed).
    // - `userId` bizim DOGRULANMIS token'imizdan gelir. Bozuk olmasi bir sunucu
    //   hatasidir; yutulmaz, yukari firlar (500) — cunku bu bir GUVENLIK
    //   invariant ihlalidir, kullanici girdisi degil.
    let tenantId: TenantId;
    try {
      tenantId = TenantId.create(input.tenantId);
    } catch (error) {
      if (error instanceof InvalidTenantIdError) {
        return { granted: false, reason: 'no-membership' };
      }
      throw error;
    }
    const userId = UserId.create(input.userId);

    // Okumalar hedef tenant'in context'i altinda yapilir (bkz. sinif yorumu).
    return this.deps.transactionManager.runInTenantTransaction(tenantId.value, () =>
      this.#resolveWithinContext(tenantId, userId),
    );
  }

  async #resolveWithinContext(tenantId: TenantId, userId: UserId): Promise<TenantAccessResult> {
    const membership = await this.deps.membershipRepository.findByTenantAndUser(tenantId, userId);
    if (membership === null) {
      return { granted: false, reason: 'no-membership' };
    }
    if (!membership.grantsAccess) {
      return { granted: false, reason: 'membership-inactive' };
    }

    // Uyelik rolu tasir ama tenant'in durumunu tasimaz; erisim icin tenant da
    // AKTIF olmali (8.2 TST adimi). Kayit yoksa uyelikle tutarsiz bir durumdur;
    // fail closed geregi erisim verilmez.
    const tenant = await this.deps.tenantRepository.findById(tenantId);
    if (!tenant?.isOperational) {
      return { granted: false, reason: 'tenant-inactive' };
    }

    return { granted: true, tenantId: tenantId.value, role: membership.role.value };
  }
}
