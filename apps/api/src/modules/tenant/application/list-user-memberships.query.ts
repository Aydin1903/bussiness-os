import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { MembershipRole } from '../domain/membership-role.value-object';
import {
  type ListUserMembershipsInput,
  type UserMembershipsPage,
  type UserMembershipsQuery,
  type UserMembershipView,
} from '../tenant.public';
import { type MembershipRepository, type UserMembershipRow } from './membership.repository.port';

/**
 * `UserMembershipsQuery`'nin implementasyonu — "hangi tenant'lara uyeyim"
 * (ADR-0028, `GET /me/memberships`).
 *
 * Use case'lerle ayni desen: saf TypeScript, @Injectable() TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `tenant.module.ts` factory ile verir.
 *
 * ============================================================================
 * NEDEN `runInTransaction` — TENANT CONTEXT'SIZ
 * ============================================================================
 * Bu sorgu tenant context'inin HENUZ olmadigi yerde calisir (login sonrasi,
 * tenant secilmeden). Okuma, kontrollu SECURITY DEFINER fonksiyonu
 * `platform.list_user_memberships` uzerinden yapilir; fonksiyon FORCE-RLS'i
 * kendi (BYPASSRLS) sahibiyle asar (ADR-0028). Dolayisiyla `runInTenantTransaction`
 * DEGIL, duz `runInTransaction` yeterlidir — `SET LOCAL app.current_tenant_id`
 * gerekmez, cunku fonksiyon ona dayanmaz.
 * ============================================================================
 */
export interface ListUserMembershipsDependencies {
  readonly membershipRepository: MembershipRepository;
  readonly transactionManager: TransactionManager;
}

export class ListUserMembershipsQuery implements UserMembershipsQuery {
  constructor(private readonly deps: ListUserMembershipsDependencies) {}

  async listForUser(input: ListUserMembershipsInput): Promise<UserMembershipsPage> {
    // `userId` dogrulanmis token'dan gelir; bicimsel olarak bozuksa bu bir
    // SUNUCU hatasidir (kullanici girdisi degil) — yutulmaz, yukari firlar.
    const userId = UserId.create(input.userId);

    const page = await this.deps.transactionManager.runInTransaction(() =>
      this.deps.membershipRepository.listUserMemberships(userId, input.limit, input.offset),
    );

    return {
      items: page.items.map(toView),
      total: page.total,
    };
  }
}

/**
 * Ham satiri dis goruntuye cevirir. `role`, domain value object'iyle DOGRULANIR
 * (assertion degil): DB CHECK zaten kumeyi sinirlar ama sinirda string gecer;
 * VO ile parse etmek hem tipi verir hem beklenmeyen bir degeri fail-closed reddeder.
 */
function toView(row: UserMembershipRow): UserMembershipView {
  return {
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    role: MembershipRole.create(row.role).value,
    status: row.status,
  };
}
