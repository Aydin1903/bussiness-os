import { Module } from '@nestjs/common';

import {
  TENANT_ACCESS_TOKEN_ISSUER,
  type TenantAccessTokenIssuer,
} from '../../modules/identity/identity.public';
import { IdentityModule } from '../../modules/identity/identity.module';
import {
  TENANT_ACCESS_QUERY,
  USER_MEMBERSHIPS_QUERY,
  type TenantAccessQuery,
  type UserMembershipsQuery,
} from '../../modules/tenant/tenant.public';
import { TenantModule } from '../../modules/tenant/tenant.module';
import { ListMyMembershipsUseCase } from './application/list-my-memberships.use-case';
import { SwitchTenantUseCase } from './application/switch-tenant.use-case';
import { MembershipsController } from './presentation/memberships.controller';
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
  controllers: [SwitchTenantController, MembershipsController],
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
    {
      // "Hangi tenant'lara uyeyim" (ADR-0028). Tenant'in public port'undan
      // (`USER_MEMBERSHIPS_QUERY`) beslenir; ic import yok. Saf TypeScript.
      provide: ListMyMembershipsUseCase,
      inject: [USER_MEMBERSHIPS_QUERY],
      useFactory: (userMembershipsQuery: UserMembershipsQuery): ListMyMembershipsUseCase =>
        new ListMyMembershipsUseCase({ userMembershipsQuery }),
    },
    TenantContextMiddleware,
  ],
  // Middleware EXPORT edilir: uygulanma sirasi (auth ONCE, tenant-context SONRA)
  // AppModule'de tek `apply(...)` cagrisiyla kesinlestirilir. Modullerarasi
  // middleware sirasi NestJS'te guvenilir DEGILDIR; bu yuzden sira kompozisyon
  // kokune tasindi (bkz. AppModule).
  exports: [TenantContextMiddleware],
})
export class SessionModule {}
