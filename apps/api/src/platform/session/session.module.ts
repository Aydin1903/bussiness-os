import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import {
  TENANT_ACCESS_TOKEN_ISSUER,
  type TenantAccessTokenIssuer,
} from '../../modules/identity/identity.public';
import { IdentityModule } from '../../modules/identity/identity.module';
import { TENANT_ACCESS_QUERY, type TenantAccessQuery } from '../../modules/tenant/tenant.public';
import { TenantModule } from '../../modules/tenant/tenant.module';
import { SwitchTenantUseCase } from './application/switch-tenant.use-case';
import { SwitchTenantController } from './presentation/switch-tenant.controller';
import { TenantContextMiddleware } from './presentation/tenant-context.middleware';

/**
 * Session modulu — kimlik oturumunun tenant'a scope edildigi kompozisyon noktasi
 * (MT §7.4 asama 2).
 *
 * ============================================================================
 * NEDEN AYRI MODUL — DONGUYU BU YAPI ONLER
 * ============================================================================
 * switch-tenant iki modulu birlestirir: Tenant (erisim karari,
 * `TENANT_ACCESS_QUERY`) ve Identity (token basimi, `TENANT_ACCESS_TOKEN_ISSUER`).
 * Bu akisi Identity'ye koymak Identity -> Tenant kenarini yaratir; Tenant zaten
 * Identity'yi import ettigi icin sonuc bir DONGU olurdu.
 *
 * Bunun yerine ikisini de PUBLIC arayuzlerinden tuketen UCUNCU bir modul:
 *   Session -> { Identity, Tenant },  Tenant -> Identity,  Identity -> (yok)
 * Bu bir DAG'dir; `forwardRef` gerekmez. Not (tenant.module.ts) tam da bu riski
 * isaret ediyordu — ters kenari hic yaratmayarak cozuldu.
 * ============================================================================
 */
@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [SwitchTenantController],
  providers: [
    {
      // Use case saf TypeScript'tir — @Injectable() TASIMAZ ve NestJS'i bilmez.
      provide: SwitchTenantUseCase,
      inject: [TENANT_ACCESS_QUERY, TENANT_ACCESS_TOKEN_ISSUER],
      useFactory: (
        tenantAccessQuery: TenantAccessQuery,
        accessTokenIssuer: TenantAccessTokenIssuer,
      ): SwitchTenantUseCase =>
        new SwitchTenantUseCase({ tenantAccessQuery, accessTokenIssuer }),
    },
    TenantContextMiddleware,
  ],
})
export class SessionModule implements NestModule {
  /**
   * Tenant context middleware'i TUM rotalara uygulanir.
   *
   * Her rotaya baglanmasi bilinclidir: "hangi endpoint tenant ister" listesi
   * elle tutulsaydi, yeni bir tenant-scoped endpoint eklendiginde birinin onu
   * listeye yazmayi unutmasi context'siz — yani RLS'siz — bir yol acardi.
   * Middleware'in kendisi zaten tenant claim'i YOKSA hicbir sey yapmaz.
   *
   * SIRA: auth middleware (IdentityModule) ONCE calisip principal'i kurmali;
   * NestJS middleware'leri modul import sirasina gore uygular ve `SessionModule`
   * `AppModule`'de `IdentityModule`'den SONRA gelir.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
