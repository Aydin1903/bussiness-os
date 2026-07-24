import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type MembershipRole } from '../domain/membership-role.value-object';
import { type MembershipStatus } from '../domain/membership-status.value-object';
import { type MembershipRepository } from './membership.repository.port';

export interface ListMembershipsQuery {
  readonly limit: number;
  readonly offset: number;
}

/** Bir uyeligin DIS goruntusu — roster satiri. Ic id'ler disari verilmez. */
export interface MembershipView {
  readonly userId: string;
  readonly role: MembershipRole['value'];
  readonly status: MembershipStatus;
  readonly joinedAt: Date | null;
}

export interface ListMembershipsResult {
  readonly items: readonly MembershipView[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ListMembershipsDependencies {
  readonly membershipRepository: MembershipRepository;
  readonly transactionManager: TransactionManager;
}

/**
 * Mevcut tenant'in uye listesini dondurur (ADR-0025 ilk RBAC ornegi).
 *
 * ============================================================================
 * TENANT CONTEXT'LI TRANSACTION — RLS BURADA DEVREYE GIRER
 * ============================================================================
 * `runInCurrentTenantTransaction`: sorgu istegin DOGRULANMIS tenant context'i
 * altinda calisir ve RLS listeyi o tenant'a daraltir (MT §11.3). Context yoksa
 * fail-closed hata firlatir — ama bu use case'e ancak yetki guard'indan GECMIS
 * bir istek ulasir, ki guard da tenant context'i zorunlu kilar.
 *
 * Yetki (`member:read`) BURADA kontrol EDILMEZ: o karar guard'da, handler'dan
 * once verilir (§10.1: dagitik `if` yasak). Use case yalnizca "erisebilen biri
 * geldi" varsayimiyla veriyi getirir.
 * ============================================================================
 */
export class ListMembershipsUseCase {
  constructor(private readonly deps: ListMembershipsDependencies) {}

  async execute(query: ListMembershipsQuery): Promise<ListMembershipsResult> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.membershipRepository.listByTenant({ limit: query.limit, offset: query.offset }),
    );

    return {
      items: page.items.map((membership) => ({
        userId: membership.userId.value,
        role: membership.role.value,
        status: membership.status,
        joinedAt: membership.joinedAt,
      })),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
