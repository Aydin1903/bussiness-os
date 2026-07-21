import { Injectable } from '@nestjs/common';

import type { TenantProvisioningPolicy } from '../application/tenant-provisioning-policy.port';
import { TenantProvisioningUnavailableError } from '../domain/tenant.error';

/**
 * GECICI politika: her istegi REDDEDER.
 *
 * ============================================================================
 * NEDEN "HER ZAMAN IZIN VER" DEGIL
 * ============================================================================
 * ADR-0016'nin onkosulu `User.emailVerified === true` ve bu bilgi Identity
 * modulundedir (Faz 3). Bugun dogrulanamiyor.
 *
 * Sessizce izin veren bir sahte implementasyon konsaydi:
 *   - Modul ayaga kalkar, endpoint calisir, her sey saglikli GORUNURDU.
 *   - ADR-0016'nin onkosulu SESSIZCE devre disi kalirdi.
 *   - Dogrulanmamis e-postayla tenant acilabilirdi ve bunu fark ettirecek
 *     HICBIR SEY olmazdi.
 *   - Identity geldiginde bu satiri degistirmeyi hatirlamak gerekirdi; ve
 *     "sonra duzeltiriz" varsayimi tam olarak bu tur satirlarda unutulur.
 *
 * Dogrulanamayan bir onkosul KARSILANMIS SAYILMAZ. Bu adapter o kurali
 * calistirilabilir hale getirir: ozellik, guvenli sekilde dogrulanabilene
 * kadar KAPALIDIR ve kapali oldugu her cagrida acikca soylenir.
 *
 * SILINME KOSULU: Identity modulu `emailVerified` bilgisini public interface
 * uzerinden sundugunda, bu sinif gercek politikayla DEGISTIRILIR — genisletilmez.
 * ============================================================================
 */
@Injectable()
export class TemporaryDenyProvisioningPolicy implements TenantProvisioningPolicy {
  assertCanProvision(): Promise<void> {
    return Promise.reject(
      new TenantProvisioningUnavailableError(
        'e-posta dogrulama onkosulu Identity modulu olmadan kontrol edilemiyor (ADR-0016)',
      ),
    );
  }
}
