import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { AI_USAGE_RECORDER, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../../shared/embedding.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitRepository,
} from '../../shared/rate-limit.repository.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { TenantModule } from '../tenant/tenant.module';
import { TENANT_ACCESS_QUERY, type TenantAccessQuery } from '../tenant/tenant.public';
import {
  PROGRESS_NOTE_REPOSITORY,
  type ProgressNoteRepository,
} from './application/progress-note.repository.port';
import { ProgressNoteUseCases } from './application/progress-note.use-cases';
import { PROJECT_REPOSITORY, type ProjectRepository } from './application/project.repository.port';
import { ProjectUseCases } from './application/project.use-cases';
import { TASK_REPOSITORY, type TaskRepository } from './application/task.repository.port';
import { TaskUseCases } from './application/task.use-cases';
import { DrizzleProgressNoteRepository } from './infrastructure/drizzle-progress-note.repository';
import { DrizzleProjectRepository } from './infrastructure/drizzle-project.repository';
import { DrizzleTaskRepository } from './infrastructure/drizzle-task.repository';
import { ProgressNoteController } from './presentation/progress-note.controller';
import { ProjectController } from './presentation/project.controller';
import { TaskController } from './presentation/task.controller';
import { PROJECTS_PERMISSIONS } from './projects.permissions';

/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const PROJECTS_CALLER = 'projects';

/**
 * Projeler modulu — Faz 5'in IKINCI is modulu (ADR-0033).
 *
 * ============================================================================
 * SLICE 3: MODUL ILK KEZ AI'A DOKUNUYOR
 * ============================================================================
 * `EmbeddingPort` artik SAGLANIYOR ve `progress_notes` yazma yolunda
 * cagriliyor; her cagri `event: "ai.call"` satiri birakiyor
 * (`AiObservabilityModule`). Oran siniri `platform.rate_limits` uzerinde tek
 * kalem deklare ediyor — UCUNCU modulde de ucuncu bir sayac tablosu
 * ACILMIYOR (ADR-0031 §4.2'nin ise yaradiginin olcusu).
 *
 * ⚠️ `LLM_PORT` SAGLANMIYOR ve bu bugun DOGRU: Projeler completion cagirmaz
 * (ADR-0033 §10 — modul ici AI yuzeyi v1'de yok). CRM'in ayni satiri Katman
 * 2'de yanlislandi, o yuzden TETIKLEYICI acikca yaziliyor: bir "proje ozeti"
 * eklendigi gun hem `LLM_PORT` hem `CompletionFailedError`
 * (`ProjectsDomainExceptionFilter`) gerekir.
 *
 * ✅ Filtreye `RateLimitExceededError` + `EmbeddingFailedError` ONCEDEN
 * eklendi. CRM'de bu ders DORT KEZ, her seferinde bir testin kirmizi
 * yanmasiyla ogrenildi.
 *
 * `RetrievalContributor` HENUZ KAYDEDILMIYOR — Slice 4. Yani parcalar
 * uretiliyor ama `POST /ask` onlari HENUZ GORMUYOR; bu bilincli bir ara
 * durumdur, sessiz bir hata degil.
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
  imports: [AiObservabilityModule, TenantModule],
  controllers: [
    // ⚠️ SIRA DOGRULUK KOSULUDUR, uslup degil.
    //
    // `TaskController` (`projects/tasks`) ve `ProgressNoteController`
    // (`projects/notes`, `projects/reindex`) ile `ProjectController`in
    // `GET :id` rotasi CATISIR. NestJS rotalari KAYIT SIRASINA gore
    // eslestirir; `ProjectController` once gelseydi `GET /projects/tasks` ve
    // `GET /projects/notes` istekleri `:id` rotasina duser ve `tasks`/`notes`
    // birer UUID olmadigi icin 422 donerdi.
    //
    // ⚠️ YENI BIR ALT ROTA EKLEYEN HER CONTROLLER BU LISTEDE
    // `ProjectController`DAN ONCE DURMAK ZORUNDA. Entegrasyon testinde ikisi
    // icin de dogrudan iddia var.
    TaskController,
    ProgressNoteController,
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
    { provide: PROGRESS_NOTE_REPOSITORY, useClass: DrizzleProgressNoteRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini
    // gosterir (ADR-0031 Slice 1).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, PROJECTS_CALLER),
    },

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
    {
      provide: ProgressNoteUseCases,
      inject: [
        PROGRESS_NOTE_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: ProgressNoteRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): ProgressNoteUseCases =>
        new ProgressNoteUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.projects.notesRateLimit,
          reindexBatchSize: config.projects.reindexBatchSize,
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
