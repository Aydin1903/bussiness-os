import {
  type TenantAccessTokenIssuer,
  type IssueTenantAccessTokenInput,
} from '../../../modules/identity/identity.public';
import {
  type TenantAccessDenialReason,
  type TenantAccessQuery,
} from '../../../modules/tenant/tenant.public';

export interface SwitchTenantCommand {
  /** DOGRULANMIS kimlik token'indan gelir (istek govdesinden DEGIL). */
  readonly userId: string;
  /** Kimlik oturumunun (token ailesi) kimligi — `sid`. */
  readonly sessionId: string;
  /** Istemcinin girmek istedigi tenant. */
  readonly tenantId: string;
}

/**
 * Sonuc — ayrik birlik. `granted` ise access token GARANTILIDIR; degilse sebep.
 * Iki durumu ayni tipte tutmak, reddedilmis bir sonuctan token okunmasina kapi
 * acardi (tenant.public.ts `TenantAccessResult` ile ayni disiplin).
 */
export type SwitchTenantResult =
  | { readonly granted: true; readonly accessToken: string }
  | { readonly granted: false; readonly reason: TenantAccessDenialReason };

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir (burada 2). */
export interface SwitchTenantDependencies {
  readonly tenantAccessQuery: TenantAccessQuery;
  readonly accessTokenIssuer: TenantAccessTokenIssuer;
}

/**
 * Kanitlanmis bir kimlik oturumunu bir tenant'a scope eder (MT §7.4 asama 2).
 *
 * ============================================================================
 * IKI MODULUN ORKESTRASYONU — VE NEDEN HICBIRININ ICINDE DEGIL
 * ============================================================================
 * Giris yalnizca KIMLIK token'i uretir (tenant claim'i YOK). Bu use case, "hangi
 * tenant" secimini yapip tenant-scoped access token'i dogurur. Iki modulu
 * birlestirir:
 *   - Tenant: "bu kullanici bu tenant'a girebilir mi ve hangi rolle" (KARAR).
 *   - Identity: "kanitlanmis oturum + verilmis tenant" icin token bas (IMZA).
 *
 * Bu yuzden ne Identity'nin ne Tenant'in ICINDEDIR; `platform/session`'da yasar
 * ve ikisini de PUBLIC arayuzlerinden tuketir. Boylece Identity <-> Tenant
 * arasinda bir modul dongusu OLUSMAZ (Tenant zaten Identity'yi import ediyor;
 * ters kenar hic yaratilmaz — DAG korunur).
 * ============================================================================
 *
 * ============================================================================
 * KARARI TENANT VERIR, BU USE CASE YALNIZCA CEVIRIR
 * ============================================================================
 * Erisim kurali ("aktif uyelik + aktif tenant") Tenant yasam dongusune aittir
 * (MT §7.4/8.2) ve `resolveMemberAccess` icinde yasar. Bu use case sonucu yalniz
 * token'a veya redde cevirir; kurali BURADA tekrar etmek, iki dogruluk kaynagi
 * yaratirdi. FAIL CLOSED: karar `granted` degilse token URETILMEZ.
 *
 * §11.4 kontrollerinin (uyelik aktif mi, tenant aktif mi) yeri BURASIDIR ve her
 * access token basiminda yeniden calisir — refresh'te degil, cunku access token
 * refresh EDILMEZ, her seferinde buradan yeniden dogar (AUTH §11.5).
 * ============================================================================
 */
export class SwitchTenantUseCase {
  constructor(private readonly deps: SwitchTenantDependencies) {}

  async execute(command: SwitchTenantCommand): Promise<SwitchTenantResult> {
    const access = await this.deps.tenantAccessQuery.resolveMemberAccess({
      userId: command.userId,
      tenantId: command.tenantId,
    });

    if (!access.granted) {
      return { granted: false, reason: access.reason };
    }

    // Yeni oturum ACILMAZ: mevcut kimlik oturumunun `sid`'i tasinir; secim,
    // oturumu degil kapsamini degistirir.
    const issueInput: IssueTenantAccessTokenInput = {
      userId: command.userId,
      sessionId: command.sessionId,
      tenantId: access.tenantId,
    };
    const accessToken = await this.deps.accessTokenIssuer.issue(issueInput);

    return { granted: true, accessToken };
  }
}
