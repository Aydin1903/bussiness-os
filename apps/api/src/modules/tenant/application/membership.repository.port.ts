import type { Membership } from '../domain/membership.entity';
import type { MembershipId } from '../domain/membership-id.value-object';
import type { TenantId } from '../domain/tenant-id.value-object';
import type { UserId } from '../domain/user-id.value-object';

/**
 * Uyelik kaliciligi icin application port'u.
 *
 * ============================================================================
 * §13.1 ISTISNASI — `TenantRepository` ile AYNI GEREKCE, FARKLI RLS DURUMU
 * ============================================================================
 *
 * MULTI_TENANT_ARCHITECTURE 13.1: repository imzalari `tenantId` almaz.
 * `findByTenantAndUser` bu kurala uyamaz, cunku tenant resolution'in 6.
 * adiminda calisir (8.2) — context'i KURACAK olan dogrulamanin kendisidir.
 * Kendisini mumkun kilan seye dayanamaz.
 *
 * ONEMLI FARK: `platform.tenants` standart RLS'in DISINDADIR, ama
 * `platform.memberships` `tenant_id` tasir ve STANDART RLS'E TABIDIR (12.4).
 *
 * Pratik sonuc:
 * - Context KURULDUKTAN sonraki cagrilar RLS tarafindan zaten filtrelenir;
 *   `tenantId` parametresi orada gereksiz bir tekrardir ama zararsizdir.
 * - Context'in HENUZ olmadigi cagrilar (resolution, provisioning) adapter
 *   tarafinda `TransactionManager.runInTenantTransaction` ile calistirilmali
 *   ve DEVELOPMENT_RULES 4.4 geregi acikca isaretlenmelidir.
 *
 * LISTELEME METODU YOK. Uye listeleme gercek bir ihtiyactir ama henuz bir use
 * case'i yoktur; eklendiginde SAYFALAMA sozlesmesiyle birlikte gelmelidir
 * (DEVELOPMENT_RULES 7.1: sinirsiz liste yasak).
 * ============================================================================
 */
export interface MembershipRepository {
  findById(id: MembershipId): Promise<Membership | null>;

  /**
   * Bir kullanicinin belirli bir tenant'taki uyeligini getirir; yoksa `null`.
   *
   * Tenant resolution'in erisim kararini veren sorgudur (8.2 adim 6). Donen
   * uyeligin `grantsAccess` degeri `false` ise istek 403 alir.
   *
   * `(tenant_id, user_id)` tekildir; bu yuzden en fazla bir kayit doner.
   * Tekillik garantisi veritabani unique index'indedir, uygulamada degil.
   */
  findByTenantAndUser(tenantId: TenantId, userId: UserId): Promise<Membership | null>;

  /**
   * Uyeligi kalici hale getirir.
   *
   * Insert/update ayrimi yapmaz ve transaction ACMAZ — transaction siniri use
   * case'tedir (13.3 kural 2).
   */
  save(membership: Membership): Promise<void>;
}
