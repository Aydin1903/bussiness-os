import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

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

    const tenantContext = getTenantContext();

    // Tenant context YOK: istek tenant-scoped bir token tasimamaktadir (kimlik
    // token'i veya anonim). Tenant kaynagina erisim yetkisi yoktur -> 403.
    // Deny-by-default: yetki KANITLANANA kadar reddedilir.
    if (tenantContext === undefined) {
      throw new ForbiddenException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
    }

    if (!this.policyEngine.can(tenantContext.role, required)) {
      // Sebep (hangi rol, hangi permission) istemciye SIZDIRILMAZ; hepsi 403.
      throw new ForbiddenException('Bu islem icin yetkiniz yok.');
    }

    return true;
  }
}
