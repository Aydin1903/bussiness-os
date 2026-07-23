import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { getCorrelationId } from '../../../infrastructure/logging/request-context';
import { runWithTenantContext } from '../../../infrastructure/tenant/tenant-context';
import {
  TENANT_ACCESS_QUERY,
  type TenantAccessQuery,
} from '../../../modules/tenant/tenant.public';

/**
 * Tenant-scoped access token'i TENANT CONTEXT'ine cevirir
 * (MULTI_TENANT_ARCHITECTURE 8.2 adim 4-5-6, §11.3).
 *
 * ============================================================================
 * MIDDLEWARE `SET LOCAL` YAPMAZ — VE YAPMAMALIDIR
 * ============================================================================
 * `SET LOCAL` transaction-scoped'dir; burada uygulanabilmesi icin istegin
 * TAMAMI boyunca bir havuz baglantisinin acik tutulmasi gerekirdi. Bu, havuzu
 * tuketir ve transaction sinirinin use case'te olmasi kuralini (13.3 kural 2)
 * ihlal eder.
 *
 * Bu yuzden gorev bolusumu §11.3'teki gibidir:
 *   middleware -> context'i ALS'e KURAR
 *   use case   -> transaction acar
 *   TX manager -> context'i OKUR ve `SET LOCAL` uygular
 * ============================================================================
 *
 * ============================================================================
 * UYELIK HER ISTEKTE YENIDEN DOGRULANIR
 * ============================================================================
 * Token'a guvenip gecmek CAZIP ama YANLIS olurdu (§14.1 T4: "bayat izin =
 * guvenlik acigi"). Uyeligi iptal edilen kullanici, elindeki access token
 * dolana kadar (15 dk) iceride kalirdi.
 *
 * Ustelik §11.2 context'te `role` ister ve rol TOKEN'DA YOKTUR (AUTH §10.3, P3
 * — bilerek): rolu ogrenmenin tek yolu zaten membership sorgusudur. Yani
 * "her istekte bir sorgu" bedeli, dogru davranisin zorunlu sonucudur.
 * Onbellekleme (ADR-0010) ileride; bugun dogruluk pahasina hiz alinmaz.
 * ============================================================================
 *
 * ============================================================================
 * ⚠️ EKSIK: §8.2 ADIM 3 (host ipucu <-> claim capraz kontrolu)
 * ============================================================================
 * Host basligindan cikan ipucu bir SLUG, claim ise bir UUID'dir; karsilastirmak
 * icin `tenant.public.ts`'te bulunmayan bir slug -> id cozumu gerekir. Ayrica
 * subdomain/custom domain hatti henuz devrede degildir. Dogrulanamayan bir
 * kontrolu yazmak, calisiyormus gibi gorunen sahte bir guvenlik halkasi olurdu;
 * bu yuzden ACIKCA eksik birakildi (MT §8.2 notu).
 * ============================================================================
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(TENANT_ACCESS_QUERY) private readonly tenantAccess: TenantAccessQuery,
  ) {}

  // `_request` bugun KULLANILMIYOR: §8.2 adim 3 (host ipucu <-> claim capraz
  // kontrolu) ertelendigi icin istek nesnesine ihtiyac yok. Imza NestMiddleware
  // sozlesmesi geregi durur ve adim 3 geldiginde ipucu buradan okunacaktir.
  async use(_request: Request, _response: Response, next: NextFunction): Promise<void> {
    const principal = getPrincipal();

    // Tenant claim'i YOKSA context KURULMAZ ve istek normal devam eder:
    // anonim istekler (kayit/giris) ve kimlik token'i tasiyan istekler
    // (switch-tenant, logout) tanimi geregi tenant'sizdir. Burada 401/403
    // vermek onlari kullanilamaz kilardi.
    if (principal?.tenantId == null) {
      next();
      return;
    }

    let role: string;

    try {
      role = await this.#resolveRole(principal.userId, principal.tenantId);
    } catch (error) {
      // Async middleware'de firlatilan hata Express'e `next` ile verilmelidir;
      // aksi halde istek yanitsiz asili kalir.
      next(error);
      return;
    }

    runWithTenantContext(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        role,
        correlationId: getCorrelationId() ?? 'unknown',
        source: 'http',
      },
      () => {
        next();
      },
    );
  }

  /**
   * §8.2 adim 4-5: uyelik aktif mi, tenant aktif mi. Karari Tenant verir.
   *
   * Reddin sebebi (uyelik yok / pasif / tenant pasif) istemciye SIZDIRILMAZ —
   * hepsi ayni 403. Token gecerli olsa bile erisim ANLIK olarak kaybedilebilir;
   * bu, iptalin gercekten islemesi demektir.
   */
  async #resolveRole(userId: string, tenantId: string): Promise<string> {
    const access = await this.tenantAccess.resolveMemberAccess({ userId, tenantId });

    if (!access.granted) {
      throw new ForbiddenException('Bu tenant a erisiminiz yok.');
    }

    return access.role;
  }
}
