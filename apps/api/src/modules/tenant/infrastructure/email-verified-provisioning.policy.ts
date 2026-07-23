import type { TenantProvisioningPolicy } from '../application/tenant-provisioning-policy.port';
import type { UserId } from '../../../shared/user-id.value-object';
import type { IdentityUserQuery } from '../../identity/identity.public';
import { TenantProvisioningNotAllowedError } from '../domain/tenant.error';

/**
 * ADR-0016 onkosulu: tenant yalnizca E-POSTASI DOGRULANMIS bir kullanici acabilir.
 *
 * ============================================================================
 * MODUL SINIRI
 * ============================================================================
 * `emailVerified` Identity'nindir. Bu adapter ona Identity'nin PUBLIC
 * INTERFACE'i (`identity.public.ts`) uzerinden ulasir — tablolarina DOKUNMAZ
 * (AUTH_ARCHITECTURE §17, ARCHITECTURE 6.1).
 *
 * Faz 2'deki `TemporaryDenyProvisioningPolicy` bu sinifla DEGISTIRILDI
 * (genisletilmedi): o adapter'in yazili "silinme kosulu" — Identity'nin
 * `emailVerified` bilgisini public interface uzerinden sunmasi — gerceklesti.
 * ============================================================================
 *
 * FAIL CLOSED: kullanici bulunamazsa da reddedilir. Dogrulanmis bir token'in
 * isaret ettigi kullanicinin bulunmamasi beklenmez; beklenmeyen durumda izin
 * vermek yerine reddetmek dogru yondur.
 */
export class EmailVerifiedProvisioningPolicy implements TenantProvisioningPolicy {
  constructor(private readonly users: IdentityUserQuery) {}

  async assertCanProvision(userId: UserId): Promise<void> {
    const user = await this.users.findById(userId.value);

    if (user === null) {
      throw new TenantProvisioningNotAllowedError('kullanici bulunamadi');
    }

    if (!user.emailVerified) {
      throw new TenantProvisioningNotAllowedError('e-posta adresi dogrulanmamis');
    }
  }
}
