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
import { PROJECT_REPOSITORY, type ProjectRepository } from './application/project.repository.port';
import { ProjectUseCases } from './application/project.use-cases';
import { DrizzleProjectRepository } from './infrastructure/drizzle-project.repository';
import { ProjectController } from './presentation/project.controller';
import { PROJECTS_PERMISSIONS } from './projects.permissions';

/**
 * Projeler modulu — Faz 5'in IKINCI is modulu (ADR-0033).
 *
 * ============================================================================
 * BU SLICE'TA AI YOK — ve bu bilincli
 * ============================================================================
 * `EmbeddingPort` bu modulde HIC cagrilmaz, `LLMPort` saglanmaz, oran siniri
 * YOKTUR ve `RetrievalContributor` KAYDEDILMEZ. Amac, sema + RLS + RBAC
 * zincirini AI karmasikligi OLMADAN kurmaktir — CRM'in Slice 4'te izledigi
 * ayni sira.
 *
 * Slice 3 `progress_notes` + `progress_note_chunks` ile embedding'i, Slice 4
 * iki katkiciyi (anlamsal + yapisal) getirecek. O gun bu modul
 * `AiObservabilityModule` ve `ContextModule`'u import edecek — bugun ikisi de
 * YOK.
 *
 * ⚠️ O gun ikinci bir sey daha gerekecek ve CRM'de DORT KEZ unutuldu:
 * `RateLimitExceededError` / `EmbeddingFailedError`,
 * `ProjectsDomainExceptionFilter`in `@Catch(...)` listesine EKLENMELIDIR.
 * Eklenmezse saglayici cokmesi 502 yerine islenmemis 500 doner.
 * ============================================================================
 */
@Module({
  controllers: [ProjectController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

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
  ],
})
export class ProjectsModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    permissions.register(PROJECTS_PERMISSIONS);
  }
}
