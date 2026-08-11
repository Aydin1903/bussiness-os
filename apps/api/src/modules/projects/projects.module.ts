import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import {
  PERMISSION_CHECKER,
  PERMISSION_REGISTRY,
  type PermissionChecker,
  type PermissionRegistry,
} from '../../platform/authz/authz.public';
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
import { ContextModule } from '../../platform/context/context.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
import { CrmModule } from '../crm/crm.module';
import { CRM_COMPANY_DIRECTORY, type CompanyDirectory } from '../crm/crm.public';
import { TenantModule } from '../tenant/tenant.module';
import { TENANT_ACCESS_QUERY, type TenantAccessQuery } from '../tenant/tenant.public';
import {
  PROGRESS_NOTE_REPOSITORY,
  type ProgressNoteRepository,
} from './application/progress-note.repository.port';
import { ProgressNoteUseCases } from './application/progress-note.use-cases';
import { ProjectDirectoryQuery } from './application/project-directory.query';
import { PROJECT_REPOSITORY, type ProjectRepository } from './application/project.repository.port';
import { ProjectUseCases } from './application/project.use-cases';
import { PROJECTS_PROJECT_DIRECTORY } from './projects.public';
import { TASK_REPOSITORY, type TaskRepository } from './application/task.repository.port';
import { TaskUseCases } from './application/task.use-cases';
import { DrizzleProgressNoteRepository } from './infrastructure/drizzle-progress-note.repository';
import { DrizzleProjectRepository } from './infrastructure/drizzle-project.repository';
import { DrizzleTaskRepository } from './infrastructure/drizzle-task.repository';
import { ProjectNotesContributor } from './infrastructure/project-notes.contributor';
import { ProjectStatusContributor } from './infrastructure/project-status.contributor';
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
 * ============================================================================
 * SLICE 4: IKI KATKICI KAYDEDILDI, VE MODUL ILK KEZ BASKA BIR IS MODULUNU
 * OKUYOR
 * ============================================================================
 * `POST /ask` artik Projeler icerigini de gorebiliyor: anlamsal
 * (`project-notes`) + yapisal (`project-status`). CLAUDE.md'nin CEO ornegi
 * ("CRM'deki musteri hareketleri, Finans'taki nakit akisi, PROJELER'deki
 * teslim performansi") ucte ikisi tamamlandi.
 *
 * ⚠️ `CrmModule` IMPORT EDILIYOR — projede bir IS MODULUNUN baska bir IS
 * MODULUNU import ettigi ILK yer (ADR-0033 §2). Yuzey `crm.public.ts`in tek
 * kalemidir (`CompanyDirectory`); CRM'in `domain/`, `application/`,
 * `infrastructure/` katmanlari `import/no-restricted-paths` ile ZATEN kapali.
 *
 * ⚠️ YON TEK: CRM Projeler'i BILMEZ ve import ETMEZ. Tersi bir modul dongusu
 * kurardi — projede bir kez yasandi (Tenant <-> Identity) ve cozumu
 * `forwardRef` degil UCUNCU BIR MODUL oldu.
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
  imports: [AiObservabilityModule, ContextModule, CrmModule, TenantModule],
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
      inject: [PROJECT_REPOSITORY, CRM_COMPANY_DIRECTORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda.
      // eslint-disable-next-line max-params
      useFactory: (
        repository: ProjectRepository,
        companyDirectory: CompanyDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): ProjectUseCases =>
        new ProjectUseCases({
          repository,
          companyDirectory,
          transactionManager,
          idGenerator,
          clock,
        }),
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
    // --- Projeler'in DISA ACIK yuzeyi (ADR-0034 §4) --------------------------
    // Finans bir gelir/gider kaydini opsiyonel olarak bir projeye baglar ve adi
    // BURADAN okur. Yon TEK YONLU: Projeler Finans'i BILMEZ.
    //
    // ⚠️ Bu modul artik hem TUKETICI (CRM'in `CompanyDirectory`si) hem
    // SAGLAYICI (kendi `ProjectDirectory`si). Grafik dallandi ama DAG kaldi:
    // `Projeler -> CRM`, `Finans -> CRM`, `Finans -> Projeler`.
    {
      provide: PROJECTS_PROJECT_DIRECTORY,
      inject: [PROJECT_REPOSITORY, PERMISSION_CHECKER, TRANSACTION_MANAGER],
      useFactory: (
        repository: ProjectRepository,
        permissionChecker: PermissionChecker,
        transactionManager: TransactionManager,
      ): ProjectDirectoryQuery =>
        new ProjectDirectoryQuery({ repository, permissionChecker, transactionManager }),
    },
    // --- Kurumsal hafizaya IKI KATKI (ADR-0033 §6) ---------------------------
    // Anlamsal: ilerleme notu parcalari. Yapisal: riskli proje + gecikmis gorev
    // anlik goruntusu. Ikisi de KENDI semasindan okur; birlestirmeyi platform
    // yapar.
    {
      provide: ProjectNotesContributor,
      inject: [PROGRESS_NOTE_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: ProgressNoteRepository,
        transactionManager: TransactionManager,
      ): ProjectNotesContributor => new ProjectNotesContributor(repository, transactionManager),
    },
    {
      provide: ProjectStatusContributor,
      inject: [PROJECT_REPOSITORY, TASK_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        projectRepository: ProjectRepository,
        taskRepository: TaskRepository,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): ProjectStatusContributor =>
        new ProjectStatusContributor(
          projectRepository,
          taskRepository,
          transactionManager,
          clock,
          config.projects.staleDays,
        ),
    },
  ],
  exports: [PROJECTS_PROJECT_DIRECTORY],
})
export class ProjectsModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    notesContributor: ProjectNotesContributor,
    statusContributor: ProjectStatusContributor,
  ) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    permissions.register(PROJECTS_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER.
    // Bu iki satirla `POST /ask` ilk kez Projeler icerigi dondurebilir —
    // yani CLAUDE.md'nin CEO ornegi ("CRM + Finans + PROJELER birlikte")
    // ucte ikisi tamamlanmis olur.
    contributors.register(notesContributor);
    contributors.register(statusContributor);
  }
}
