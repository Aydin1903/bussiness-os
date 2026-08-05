import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { PERMISSION_METADATA_KEY, type Permission } from '../authz.public';
import { PolicyEngine } from '../application/policy-engine';

/**
 * `@RequirePermission` ile isaretlenmis endpoint'lerde yetki kontrolunu ZORLAR
 * (ADR-0025, ARCHITECTURE 5/10.1).
 *
 * ============================================================================
 * KARAR TEK YERDE — controller'da dagitik `if` YOK
 * ============================================================================
 * §5 request lifecycle yetki kontrolunu handler'dan ONCE, merkezi bir noktada
 * konumlandirir. Guard tam oradadir: endpoint yalnizca GEREKSINIMI deklare eder
 * (`@RequirePermission('member:read')`), karari burasi verir.
 *
 * APP_GUARD olarak baglidir, yani HER route'tan gecer; ama isaretsiz route'a
 * DOKUNMAZ. Bu, "deny-by-default"i dogru okur: koruma bir kaynak islemi icindir;
 * kayit/giris gibi kaynak-disi uc noktalar kapsamda degildir.
 * ============================================================================
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyEngine: PolicyEngine,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<Permission | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );

    // Isaretsiz endpoint: bu guard'in isi degil.
    if (required === undefined) {
      return true;
    }

    // ========================================================================
    // 401 ILE 403 AYRI SEYLERDIR
    // ========================================================================
    // Once bu guard her iki durumda da 403 donuyordu: kimliksiz istek de,
    // kimligi olan ama tenant secmemis istek de. Sonuc, ayni API'nin iki
    // modulunun AYNI duruma farkli cevap vermesiydi — `/me/memberships`
    // kimliksiz istege 401 donerken `/knowledge/*` 403 donuyordu.
    //
    // RFC 9110: 401 "kim oldugunu kanitlamadin", 403 "kim oldugunu biliyorum
    // ama bu sana kapali". Istemci acisindan fark islevseldir: 401 tazeleme ya
    // da yeniden giris tetikler, 403 tetiklememeli — tekrar giris yapmak
    // yetkiyi degistirmez.
    //
    // Faz 4 kapanis denetiminde tespit edildi ve Faz 5 yeni modulleri bu
    // deseni kopyalamadan ONCE duzeltildi (Product Owner onayi, 2026-08-05).
    // Uretime cikilmadigi icin sozlesme degisikliginin bedeli yok.
    // ========================================================================

    const tenantContext = getTenantContext();

    if (tenantContext === undefined) {
      // Ayrim YALNIZCA burada yapilir. Tenant context VARSA kimlik zaten
      // kanitlanmistir: onu kuran middleware auth'tan SONRA calisir ve
      // membership dogrulamasindan gecer (MT §11.2). Yani principal'i her
      // istekte ayrica sormak gereksiz bir okuma olurdu.
      if (getPrincipal() === undefined) {
        throw new UnauthorizedException('Bu islem icin kimlik dogrulamasi gerekiyor.');
      }

      // Kimlik VAR ama tenant secilmemis: kim oldugu biliniyor, bu kaynak ona
      // kapali. Deny-by-default: yetki KANITLANANA kadar reddedilir.
      throw new ForbiddenException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
    }

    if (!this.policyEngine.can(tenantContext.role, required)) {
      // Sebep (hangi rol, hangi permission) istemciye SIZDIRILMAZ; hepsi 403.
      throw new ForbiddenException('Bu islem icin yetkiniz yok.');
    }

    return true;
  }
}
