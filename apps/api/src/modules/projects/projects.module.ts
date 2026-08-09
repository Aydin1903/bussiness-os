import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { TenantModule } from '../tenant/tenant.module';
import { TENANT_ACCESS_QUERY, type TenantAccessQuery } from '../tenant/tenant.public';
import { PROJECT_REPOSITORY, type ProjectRepository } from './application/project.repository.port';
import { ProjectUseCases } from './application/project.use-cases';
import { TASK_REPOSITORY, type TaskRepository } from './application/task.repository.port';
import { TaskUseCases } from './application/task.use-cases';
import { DrizzleProjectRepository } from './infrastructure/drizzle-project.repository';
import { DrizzleTaskRepository } from './infrastructure/drizzle-task.repository';
import { ProjectController } from './presentation/project.controller';
import { TaskController } from './presentation/task.controller';
import { PROJECTS_PERMISSIONS } from './projects.permissions';

/**
 * Projeler modulu — Faz 5'in IKINCI is modulu (ADR-0033).
 *
 * ============================================================================
 * BU SLICE'TA HALA AI YOK — ve bu bilincli
 * ============================================================================
 * `EmbeddingPort` cagrilmaz, `LLMPort` saglanmaz, oran siniri YOKTUR ve
 * `RetrievalContributor` KAYDEDILMEZ. Slice 3 `progress_notes` ile embedding'i,
 * Slice 4 iki katkiciyi getirecek.
 *
 * ⚠️ O gun ikinci bir sey daha gerekecek ve CRM'de DORT KEZ unutuldu:
 * `RateLimitExceededError` / `EmbeddingFailedError`,
 * `ProjectsDomainExceptionFilter`in `@Catch(...)` listesine EKLENMELIDIR.
 * Eklenmezse saglayici cokmesi 502 yerine islenmemis 500 doner.
 *
 * ============================================================================
 * NEDEN `TenantModule` IMPORT EDILIYOR
 * ============================================================================
 * Gorev atamasi dogrulanmak zorunda (ADR-0033 §4): atanan kisi, icinde
 * bulunulan tenant'in AKTIF uyesi olmali. `platform.memberships` baska bir
 * modulun tablosudur (Mutlak Kural 5), dolayisiyla okuma Tenant'in PUBLIC
 * yuzeyinden yapilir — Identity'nin switch-tenant'ta yaptiginin aynisi.
 *
 * Bu, Projeler'in CRM bagimliligiyla AYNI SINIFTA DEGILDIR: Tenant, platform
 * zincirinin ilk halkasidir (ARCHITECTURE §6.2) ve is modullerinin altinda
 * durur; CRM ise bir kardes is modulu.
 * ============================================================================
 */
@Module({
  imports: [TenantModule],
  controllers: [
    // ⚠️ SIRA DOGRULUK KOSULUDUR, uslup degil.
    //
    // `TaskController` `projects/tasks`, `ProjectController` ise `projects` ve
    // `GET :id` tasiyor. NestJS rotalari KAYIT SIRASINA gore eslestirir; ters
    // sirada `GET /projects/tasks` istegi `:id` rotasina duser ve `tasks` bir
    // UUID olmadigi icin 422 doner. Entegrasyon testinde bunun icin dogrudan
    // bir iddia var.
    TaskController,
    ProjectController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: TASK_REPOSITORY, useClass: DrizzleTaskRepository },
    // ⚠️ `TASK_REPOSITORY`DEN SONRA okunmali: proje listesi gorev sayaclarini
    // ondan alir (gerekce `DrizzleProjectRepository`nin kurucusunda). Yon tek
    // ve dongusuz.
    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },

    {
      provide: ProjectUseCases,
      inject: [PROJECT_REPOSITORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      useFactory: (
        repository: ProjectRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): ProjectUseCases =>
        new ProjectUseCases({ repository, transactionManager, idGenerator, clock }),
    },
    {
      provide: TaskUseCases,
      inject: [
        TASK_REPOSITORY,
        PROJECT_REPOSITORY,
        TENANT_ACCESS_QUERY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: TaskRepository,
        projectRepository: ProjectRepository,
        tenantAccess: TenantAccessQuery,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): TaskUseCases =>
        new TaskUseCases({
          repository,
          projectRepository,
          tenantAccess,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
  ],
})
export class ProjectsModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    permissions.register(PROJECTS_PERMISSIONS);
  }
}
