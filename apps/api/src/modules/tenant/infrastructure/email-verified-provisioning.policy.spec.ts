import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import type { IdentityUserQuery, IdentityUserSnapshot } from '../../identity/identity.public';
import { TenantProvisioningNotAllowedError } from '../domain/tenant.error';
import { EmailVerifiedProvisioningPolicy } from './email-verified-provisioning.policy';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');

/** Elle yazilmis fake — Identity'nin public interface'i taklit edilir. */
class FakeIdentityUserQuery implements IdentityUserQuery {
  constructor(private readonly snapshot: IdentityUserSnapshot | null) {}

  findById(): Promise<IdentityUserSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }
}

function policyFor(snapshot: IdentityUserSnapshot | null): EmailVerifiedProvisioningPolicy {
  return new EmailVerifiedProvisioningPolicy(new FakeIdentityUserQuery(snapshot));
}

describe('EmailVerifiedProvisioningPolicy', () => {
  it('e-postasi dogrulanmis kullaniciya izin verir', async () => {
    const policy = policyFor({ userId: USER_ID.value, emailVerified: true });

    await expect(policy.assertCanProvision(USER_ID)).resolves.toBeUndefined();
  });

  it('e-postasi dogrulanmamis kullaniciyi reddeder (ADR-0016 onkosulu)', async () => {
    const policy = policyFor({ userId: USER_ID.value, emailVerified: false });

    await expect(policy.assertCanProvision(USER_ID)).rejects.toThrow(
      TenantProvisioningNotAllowedError,
    );
  });

  it('kullanici bulunamazsa reddeder (fail closed)', async () => {
    // Dogrulanmis bir token'in isaret ettigi kullanicinin bulunmamasi beklenmez;
    // beklenmeyen durumda izin vermek yerine reddetmek dogru yondur.
    const policy = policyFor(null);

    await expect(policy.assertCanProvision(USER_ID)).rejects.toThrow(
      TenantProvisioningNotAllowedError,
    );
  });

  it('red sebebini hatada tasir (dogrulanmamis / bulunamadi ayrimi)', async () => {
    await expect(
      policyFor({ userId: USER_ID.value, emailVerified: false }).assertCanProvision(USER_ID),
    ).rejects.toThrow(/dogrulanmamis/);

    await expect(policyFor(null).assertCanProvision(USER_ID)).rejects.toThrow(/bulunamadi/);
  });
});
