import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AppLoggerModule } from './infrastructure/logging/logger.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuthContextMiddleware } from './modules/identity/presentation/auth-context.middleware';
import { CrmModule } from './modules/crm/crm.module';
import { FinanceModule } from './modules/finance/finance.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ProjectsModule } from './modules/projects/projects.module';
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
    // Faz 5'in ilk is modulu (ADR-0031). Bu slice'ta AI YOK: sema + RLS + RBAC
    // zinciri once AI karmasikligi olmadan kanitlanir.
    CrmModule,
    // Faz 5'in IKINCI is modulu (ADR-0033). CRM ile ayni sira: bu slice'ta AI
    // YOK, once sema + RLS + RBAC zinciri kurulur.
    ProjectsModule,
    // Faz 5'in UCUNCU is modulu (ADR-0034). Ayni sira, dorduncu kez: bu
    // slice'ta AI YOK, once sema + RLS + RBAC zinciri kurulur.
    //
    // ⚠️ Permission katalogu projedeki ILK DAR katalogdur: `member` ve `viewer`
    // finansi HIC gormez (ADR-0034 §7). Slice 5'te bu, `POST /ask`in izin
    // filtresinin ILK GERCEK tetikcisi olacak.
    FinanceModule,
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
