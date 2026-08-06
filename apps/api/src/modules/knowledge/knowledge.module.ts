import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { ContextModule } from '../../platform/context/context.module';
import { createEmbeddingPort, createLlmPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { AI_USAGE_RECORDER, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { CheckNotesExistUseCase } from './application/check-notes-exist.use-case';
import { CountUnindexedNotesUseCase } from './application/count-unindexed-notes.use-case';
import { GenerateDailyReportsUseCase } from './application/generate-daily-reports.use-case';
import { ListNotesUseCase } from './application/list-notes.use-case';
import { ReindexNotesUseCase } from './application/reindex-notes.use-case';
import { GetLatestDailyReportUseCase } from './application/get-latest-daily-report.use-case';
import { CreateNoteUseCase } from './application/create-note.use-case';
import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitRepository,
} from '../../shared/rate-limit.repository.port';
import {
  DAILY_REPORT_RUN_REPOSITORY,
  type DailyReportRunRepository,
} from './application/daily-report-run.repository.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../../shared/embedding.port';
import { LLM_PORT, type LLMPort } from '../../shared/llm.port';
import { NOTE_CHUNK_SEARCH, type NoteChunkSearch } from './application/note-chunk-search.port';
import {
  NOTE_CHUNK_REPOSITORY,
  type NoteChunkRepository,
} from './application/note-chunk.repository.port';
import { NOTE_REPOSITORY, type NoteRepository } from './application/note.repository.port';
import { DailyReportWorker } from './infrastructure/daily-report-worker';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { DrizzleDailyReportRunRepository } from './infrastructure/drizzle-daily-report-run.repository';
import { DrizzleNoteChunkSearchRepository } from './infrastructure/drizzle-note-chunk-search.repository';
import { DrizzleNoteChunkRepository } from './infrastructure/drizzle-note-chunk.repository';
import { DrizzleNoteRepository } from './infrastructure/drizzle-note.repository';
import { KNOWLEDGE_PERMISSIONS } from './knowledge.permissions';
import { KnowledgeRetrievalContributor } from './infrastructure/knowledge-retrieval.contributor';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
import { getTenantContext } from '../../infrastructure/tenant/tenant-context';
import { ReindexController } from './presentation/reindex.controller';
import { DailyReportController } from './presentation/daily-report.controller';
import { NoteController } from './presentation/note.controller';

/**
 * Knowledge modulu — projenin ILK IS MODULU (ADR-0029, ADR-0030).
 *
 * ============================================================================
 * PLATFORM DEGIL, IS MODULU
 * ============================================================================
 * Faz 1-3 tumuyle platform cekirdegiydi (tenant, identity, authz, session).
 * Bu, `ARCHITECTURE.md` §6.2'nin "is modulleri" kumesinin ilk uyesi ve
 * `platform` disindaki ilk PostgreSQL semasinin sahibidir.
 *
 * CLAUDE.md'nin kurucu kisiti burada somutlasir: modul bir urun degil, AI icin
 * bir HAFIZADIR. `notes` kullanicinin yazdigini, `note_chunks` AI'in
 * okuyabildigini tutar.
 * ============================================================================
 */
/**
 * AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1).
 *
 * Adapter SINIFLARI `infrastructure/ai/` altinda paylasilir (ADR-0031 Slice 1)
 * ama ORNEK modul basinadir: her modul kendi etiketiyle kurar. CRM geldiginde
 * ayni deseni `caller: 'crm'` ile tekrarlar. Saglayici SECIMI Slice 3'te ortak
 * bir fabrikaya alindi (`infrastructure/ai/ai-provider.factory.ts`) — ikinci
 * tuketici (Context) gelince kopyalanmamasi icin.
 */
const KNOWLEDGE_CALLER = 'knowledge';

@Module({
  // AI cagrilarinin maliyet kaydi (ROADMAP §8.1) — her saglayici cagrisi
  // yapilandirilmis bir satir birakir.
  // ContextModule katkici defterini export eder; Knowledge kendini oraya
  // kaydeder (yon: modulden platforma).
  imports: [AiObservabilityModule, ContextModule],
  controllers: [NoteController, ReindexController, DailyReportController],
  providers: [
    // --- Paylasilan cekirdek port'lari ---------------------------------------
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    // --- Kalicilik ------------------------------------------------------------
    { provide: NOTE_REPOSITORY, useClass: DrizzleNoteRepository },
    { provide: NOTE_CHUNK_REPOSITORY, useClass: DrizzleNoteChunkRepository },
    { provide: DAILY_REPORT_RUN_REPOSITORY, useClass: DrizzleDailyReportRunRepository },
    { provide: NOTE_CHUNK_SEARCH, useClass: DrizzleNoteChunkSearchRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // --- Embedding saglayicisi ------------------------------------------------
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, KNOWLEDGE_CALLER),
    },
    {
      provide: LLM_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): LLMPort =>
        createLlmPort(config, recorder, KNOWLEDGE_CALLER),
    },

    // --- Use case -------------------------------------------------------------
    {
      provide: CreateNoteUseCase,
      inject: [
        NOTE_REPOSITORY,
        NOTE_CHUNK_REPOSITORY,
        DAILY_REPORT_RUN_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle BIREBIR eslesmek
      // zorundadir; use case'in KENDI imzasi tek parametrelidir
      // (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        noteRepository: NoteRepository,
        noteChunkRepository: NoteChunkRepository,
        dailyReportRunRepository: DailyReportRunRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): CreateNoteUseCase =>
        new CreateNoteUseCase({
          noteRepository,
          noteChunkRepository,
          dailyReportRunRepository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.knowledge.notesRateLimit,
        }),
    },
    {
      provide: CheckNotesExistUseCase,
      inject: [NOTE_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        noteRepository: NoteRepository,
        transactionManager: TransactionManager,
      ): CheckNotesExistUseCase =>
        new CheckNotesExistUseCase({ noteRepository, transactionManager }),
    },
    {
      provide: ListNotesUseCase,
      inject: [NOTE_REPOSITORY, TRANSACTION_MANAGER, APP_CONFIG],
      useFactory: (
        noteRepository: NoteRepository,
        transactionManager: TransactionManager,
        config: AppConfig,
      ): ListNotesUseCase =>
        new ListNotesUseCase({
          noteRepository,
          transactionManager,
          previewLength: config.knowledge.notePreviewLength,
        }),
    },
    {
      provide: CountUnindexedNotesUseCase,
      inject: [NOTE_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        noteRepository: NoteRepository,
        transactionManager: TransactionManager,
      ): CountUnindexedNotesUseCase =>
        new CountUnindexedNotesUseCase({ noteRepository, transactionManager }),
    },
    {
      provide: ReindexNotesUseCase,
      inject: [
        NOTE_REPOSITORY,
        NOTE_CHUNK_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      // eslint-disable-next-line max-params
      useFactory: (
        noteRepository: NoteRepository,
        noteChunkRepository: NoteChunkRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): ReindexNotesUseCase =>
        new ReindexNotesUseCase({
          noteRepository,
          noteChunkRepository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          batchSize: config.knowledge.reindexBatchSize,
          rateLimit: config.knowledge.notesRateLimit,
        }),
    },
    {
      provide: GetLatestDailyReportUseCase,
      inject: [DAILY_REPORT_RUN_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        reportRepository: DailyReportRunRepository,
        transactionManager: TransactionManager,
      ): GetLatestDailyReportUseCase =>
        new GetLatestDailyReportUseCase({ reportRepository, transactionManager }),
    },
    {
      provide: GenerateDailyReportsUseCase,
      inject: [DAILY_REPORT_RUN_REPOSITORY, LLM_PORT, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        reportRepository: DailyReportRunRepository,
        llmPort: LLMPort,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): GenerateDailyReportsUseCase =>
        new GenerateDailyReportsUseCase({
          reportRepository,
          llmPort,
          transactionManager,
          clock,
          batchSize: config.dailyReport.batchSize,
          hourUtc: config.dailyReport.hourUtc,
          windowHours: config.dailyReport.windowHours,
        }),
    },
    {
      // Zamanlayici: NE ZAMAN calisilacagini bilir, NE yapilacagini bilmez.
      provide: DailyReportWorker,
      inject: [GenerateDailyReportsUseCase, APP_CONFIG],
      useFactory: (
        generateReports: GenerateDailyReportsUseCase,
        config: AppConfig,
      ): DailyReportWorker =>
        new DailyReportWorker(generateReports, {
          enabled: config.dailyReport.enabled,
          intervalMs: config.dailyReport.intervalMs,
        }),
    },
    // --- Kurumsal hafizaya katki (ADR-0031 §5.1) -----------------------------
    // Modul KENDI semasindan katki verir; birlestirmeyi platform yapar.
    {
      provide: KnowledgeRetrievalContributor,
      inject: [NOTE_CHUNK_SEARCH, TRANSACTION_MANAGER],
      useFactory: (
        search: NoteChunkSearch,
        transactionManager: TransactionManager,
      ): KnowledgeRetrievalContributor =>
        new KnowledgeRetrievalContributor(search, transactionManager, () => {
          const context = getTenantContext();
          if (context === undefined) {
            // FAIL CLOSED: tenant context'siz bir retrieval, RLS'in
            // koruyamadigi bir yol acardi.
            throw new Error('Retrieval icin tenant context gerekiyor.');
          }
          return context.tenantId;
        }),
    },
  ],
})
export class KnowledgeModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    contributor: KnowledgeRetrievalContributor,
  ) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    // Kayit constructor'da yapilir — modul instantiate edilirken, ilk istekten
    // ONCE tamamlanir (TenantModule ile ayni desen).
    permissions.register(KNOWLEDGE_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER
    // (ADR-0031 §5.1). Platform is modullerini import ETMEZ; yon daima
    // modulden platforma dogrudur.
    contributors.register(contributor);
  }
}
