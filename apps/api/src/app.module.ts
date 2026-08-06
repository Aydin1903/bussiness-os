import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AppLoggerModule } from './infrastructure/logging/logger.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuthContextMiddleware } from './modules/identity/presentation/auth-context.middleware';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthzModule } from './platform/authz/authz.module';
import { HealthModule } from './platform/health/health.module';
import { ContextModule } from './platform/context/context.module';
import { SessionModule } from './platform/session/session.module';
import { TenantContextMiddleware } from './platform/session/presentation/tenant-context.middleware';

/**
 * Uygulamanin kok modulu.
 *
 * ARCHITECTURE 6.2: platform modulleri (Tenant -> Identity -> Authorization -> Audit)
 * Faz 2'den itibaren buraya sirayla eklenir. Is modulleri Faz 5+.
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    // Global: merkezi policy engine + permission guard (ADR-0025). Is
    // modullerinden ONCE gelir ki kataloglarini kaydedebilsinler.
    AuthzModule,
    HealthModule,
    TenantModule,
    IdentityModule,
    // switch-tenant: Identity + Tenant orkestrasyonu (MT §7.4 asama 2).
    SessionModule,
    // Ilk IS modulu (ADR-0029/0030). Platform cekirdeginden SONRA gelir:
    // permission katalogunu AuthzModule'e kaydeder ve tenant context'e dayanir.
    KnowledgeModule,
    // AI Context Engine — POST /api/v1/ask (ADR-0031 §5). Is modullerinden
    // SONRA gelir: katkicilarini onlar kaydeder.
    ContextModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * ============================================================================
   * CROSS-CUTTING MIDDLEWARE SIRASI KOMPOZISYON KOKUNDE KESINLESTIRILIR
   * ============================================================================
   * `TenantContextMiddleware`, `AuthContextMiddleware`'in istek baglamina
   * yazdigi principal'i OKUR — dolayisiyla auth ONCE calismak zorundadir.
   *
   * NestJS'te FARKLI modullerin middleware'leri arasindaki sira GUVENILIR
   * DEGILDIR (modul cozumleme sirasina baglidir, import sirasini takip etmez —
   * pratikte tenant-context auth'tan ONCE calisip principal'i goremedi). Ayni
   * `consumer.apply(A, B)` cagrisi icindeki sira ise KESINDIR.
   *
   * Bu yuzden ikisi de burada, tek cagriyla ve dogru sirayla uygulanir. Modul
   * dosyalari yalnizca middleware'leri EXPORT eder; sira karari koke aittir.
   * ============================================================================
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthContextMiddleware, TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
