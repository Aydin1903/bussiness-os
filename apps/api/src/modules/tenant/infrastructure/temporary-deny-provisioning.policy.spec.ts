import { describe, expect, it } from 'vitest';

import { IdentityUnavailableError } from '../../../shared/current-user.port';
import { TenantProvisioningUnavailableError } from '../domain/tenant.error';
import { TemporaryDenyProvisioningPolicy } from './temporary-deny-provisioning.policy';
import { UnavailableCurrentUserProvider } from './unavailable-current-user.adapter';

/**
 * Bu testler bir DAVRANISI degil, bir KARARI sabitler: iki gecici saglayici
 * da acikca reddeder. Biri gunun birinde "gecici olarak izin verelim" diye
 * degistirilirse, test kirmizi yanar ve gerekceyi okur.
 */

describe('TemporaryDenyProvisioningPolicy', () => {
  it('her istegi reddeder', async () => {
    await expect(new TemporaryDenyProvisioningPolicy().assertCanProvision()).rejects.toThrow(
      TenantProvisioningUnavailableError,
    );
  });

  it('reddin gerekcesini tasir', async () => {
    // Sessiz bir red, hata ayiklanamaz bir reddir. Mesaj hangi onkosulun
    // dogrulanamadigini soyler.
    await expect(new TemporaryDenyProvisioningPolicy().assertCanProvision()).rejects.toThrow(
      /Identity modulu/,
    );
  });

  it('ADR-0016 nin onkosulunu ASLA saglanmis saymaz', async () => {
    // Ayni ornek uzerinden art arda cagrilarda da davranis degismez —
    // "ilk seferinde reddet, sonra izin ver" gibi bir durum yok.
    const policy = new TemporaryDenyProvisioningPolicy();

    await expect(policy.assertCanProvision()).rejects.toThrow();
    await expect(policy.assertCanProvision()).rejects.toThrow();
  });
});

describe('UnavailableCurrentUserProvider', () => {
  it('kullanici kimligi istendiginde hata firlatir', () => {
    expect(() => new UnavailableCurrentUserProvider().requireUserId()).toThrow(
      IdentityUnavailableError,
    );
  });

  it('asla bir kimlik degeri DONDURMEZ', () => {
    // Bos string, "anonymous" veya sabit bir UUID dondurmek, istemci kaynakli
    // kimlik kabul etmekle ayni sonucu verirdi: sahte bir kullanici.
    const provider = new UnavailableCurrentUserProvider();

    let returned: unknown = 'DONDU';
    try {
      returned = provider.requireUserId();
    } catch {
      returned = 'FIRLATTI';
    }

    expect(returned).toBe('FIRLATTI');
  });
});
