import { Inject, Logger, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import { AskKnowledgeUseCase } from './application/ask-knowledge.use-case';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from './application/conversation.repository.port';
import { CreateNoteUseCase } from './application/create-note.use-case';
import {
  DAILY_REPORT_RUN_REPOSITORY,
  type DailyReportRunRepository,
} from './application/daily-report-run.repository.port';
import { EMBEDDING_PORT, type EmbeddingPort } from './application/embedding.port';
import { LLM_PORT, type LLMPort } from './application/llm.port';
import {
  NOTE_CHUNK_SEARCH,
  type NoteChunkSearch,
} from './application/note-chunk-search.port';
import {
  NOTE_CHUNK_REPOSITORY,
  type NoteChunkRepository,
} from './application/note-chunk.repository.port';
import { NOTE_REPOSITORY, type NoteRepository } from './application/note.repository.port';
import { DeepSeekLlmAdapter } from './infrastructure/deepseek-llm.adapter';
import { DrizzleConversationRepository } from './infrastructure/drizzle-conversation.repository';
import { DrizzleDailyReportRunRepository } from './infrastructure/drizzle-daily-report-run.repository';
import { DrizzleNoteChunkSearchRepository } from './infrastructure/drizzle-note-chunk-search.repository';
import { DrizzleNoteChunkRepository } from './infrastructure/drizzle-note-chunk.repository';
import { DrizzleNoteRepository } from './infrastructure/drizzle-note.repository';
import { FakeEmbeddingAdapter } from './infrastructure/fake-embedding.adapter';
import { FakeLlmAdapter } from './infrastructure/fake-llm.adapter';
import { OpenAiEmbeddingAdapter } from './infrastructure/openai-embedding.adapter';
import { KNOWLEDGE_PERMISSIONS } from './knowledge.permissions';
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
@Module({
  controllers: [NoteController],
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
    { provide: CONVERSATION_REPOSITORY, useClass: DrizzleConversationRepository },

    // --- Embedding saglayicisi ------------------------------------------------
    {
      // SAGLAYICI SECIMI TEK BIR YERDE (EmailModule ile ayni desen): hicbir use
      // case somut saglayiciyi bilmez. ADR-0007'nin kabul testi budur.
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmbeddingPort => {
        if (config.embedding.provider === 'openai') {
          return new OpenAiEmbeddingAdapter({
            apiKey: config.embedding.openAiApiKey,
            model: config.embedding.model,
          });
        }

        // Uretimde bu dala HIC girilmez: env semasi `fake`'i orada reddeder
        // ve surec baslamaz. Uyari dev/CI icindir — sahte embedding ile
        // calistigini unutan gelistirici, "arama neden sacmaliyor" sorusunun
        // cevabini burada bulur.
        new Logger(KnowledgeModule.name).warn(
          'EMBEDDING_PROVIDER=fake — embedding ler SAHTE, anlamsal arama calismaz.',
        );
        return new FakeEmbeddingAdapter();
      },
    },

    // --- Sohbet/completion saglayicisi ---------------------------------------
    {
      // Embedding'den AYRI cozulur: iki port GERCEKTEN iki farkli saglayiciya
      // gidiyor (DeepSeek chat, OpenAI embedding) — ADR-0030 §1.3'un bolunme
      // gerekcesinin somut karsiligi.
      provide: LLM_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): LLMPort => {
        if (config.llm.provider === 'deepseek') {
          return new DeepSeekLlmAdapter({
            apiKey: config.llm.deepSeekApiKey,
            model: config.llm.model,
          });
        }

        // Uretimde bu dala HIC girilmez (env semasi reddeder); uyari dev/CI icin.
        new Logger(KnowledgeModule.name).warn(
          'LLM_PROVIDER=fake — cevaplar SAHTE, soru-cevap anlamli calismaz.',
        );
        return new FakeLlmAdapter();
      },
    },

    // --- Use case -------------------------------------------------------------
    {
      provide: CreateNoteUseCase,
      inject: [
        NOTE_REPOSITORY,
        NOTE_CHUNK_REPOSITORY,
        DAILY_REPORT_RUN_REPOSITORY,
        EMBEDDING_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle BIREBIR eslesmek
      // zorundadir; use case'in KENDI imzasi tek parametrelidir
      // (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        noteRepository: NoteRepository,
        noteChunkRepository: NoteChunkRepository,
        dailyReportRunRepository: DailyReportRunRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): CreateNoteUseCase =>
        new CreateNoteUseCase({
          noteRepository,
          noteChunkRepository,
          dailyReportRunRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: AskKnowledgeUseCase,
      inject: [
        NOTE_CHUNK_SEARCH,
        CONVERSATION_REPOSITORY,
        EMBEDDING_PORT,
        LLM_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        APP_CONFIG,
      ],
      // eslint-disable-next-line max-params
      useFactory: (
        noteChunkSearch: NoteChunkSearch,
        conversationRepository: ConversationRepository,
        embeddingPort: EmbeddingPort,
        llmPort: LLMPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        config: AppConfig,
      ): AskKnowledgeUseCase =>
        new AskKnowledgeUseCase({
          noteChunkSearch,
          conversationRepository,
          embeddingPort,
          llmPort,
          transactionManager,
          idGenerator,
          // ADR-0030 §1.2: bu sayilar ADR'de SABITLENMEZ, config'ten gelir.
          retrievalLimit: config.knowledge.retrievalLimit,
          historyMessages: config.knowledge.historyMessages,
        }),
    },
  ],
})
export class KnowledgeModule {
  constructor(@Inject(PERMISSION_REGISTRY) private readonly permissions: PermissionRegistry) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    // Kayit constructor'da yapilir — modul instantiate edilirken, ilk istekten
    // ONCE tamamlanir (TenantModule ile ayni desen).
    this.permissions.register(KNOWLEDGE_PERMISSIONS);
  }
}
