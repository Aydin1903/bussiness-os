import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { AI_USAGE_RECORDER, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../../shared/embedding.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { LLM_PORT, type LLMPort } from '../../shared/llm.port';
import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitRepository,
} from '../../shared/rate-limit.repository.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { createEmbeddingPort, createLlmPort } from '../../infrastructure/ai/ai-provider.factory';
import {
  PERMISSION_CHECKER,
  PERMISSION_REGISTRY,
  type PermissionChecker,
  type PermissionRegistry,
} from '../authz/authz.public';
import { AskUseCase } from './application/ask.use-case';
import {
  RETRIEVAL_SELECTION_RECORDER,
  type RetrievalSelectionRecorder,
} from './application/retrieval-selection-recorder.port';
import { LoggingRetrievalSelectionRecorder } from './infrastructure/logging-retrieval-selection-recorder';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from './application/conversation.repository.port';
import { InMemoryContributorRegistry } from './application/in-memory-contributor-registry';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from './application/retrieval-contributor.port';
import { CONTEXT_PERMISSIONS } from './context.permissions';
import { DrizzleConversationRepository } from './infrastructure/drizzle-conversation.repository';
import { AskController } from './presentation/ask.controller';

/** AI maliyet kaydinda bu bilesenin etiketi (ROADMAP §8.1). */
const CONTEXT_CALLER = 'context';

/**
 * AI Context Engine — PLATFORM bileseni, is modulu DEGIL (ADR-0031 §5).
 *
 * ============================================================================
 * NEDEN `platform/` ALTINDA
 * ============================================================================
 * `POST /api/v1/ask` hicbir modulun ucu degildir: cevabi kayitli TUM
 * katkicilarin katkisindan uretir. Knowledge icinde birakmak, CRM'in
 * gorusmelerinden gelen bir cevabi bir is modulunun yolundan dondurmek
 * olurdu — ve konusma tablolari da o modulun semasinda kalirdi (Mutlak
 * Kural 5).
 *
 * Platform, is modullerini IMPORT ETMEZ. Moduller kendi katkicilarini
 * `RETRIEVAL_CONTRIBUTOR_REGISTRY` uzerinden kaydeder; bu modul yalnizca
 * defteri ve birlestiriciyi saglar (ADR-0025'in `PermissionRegistry`
 * deseniyle birebir ayni).
 * ============================================================================
 */
@Module({
  imports: [AiObservabilityModule],
  controllers: [AskController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: CONVERSATION_REPOSITORY, useClass: DrizzleConversationRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Katkici defteri — is modulleri buraya kaydolur.
    InMemoryContributorRegistry,
    { provide: RETRIEVAL_CONTRIBUTOR_REGISTRY, useExisting: InMemoryContributorRegistry },

    // AI saglayicilari: adapter SINIFLARI paylasilir, ORNEK bu bilesenindir
    // (ADR-0031 Slice 1 karari — `caller` kurulusta sabitlenir).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, CONTEXT_CALLER),
    },
    {
      provide: LLM_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): LLMPort =>
        createLlmPort(config, recorder, CONTEXT_CALLER),
    },

    /**
     * ⚠️ SECIM GOZLEMLENEBILIRLIGI (ADR-0046) — `event: "retrieval.select"`.
     *
     * Iki kapanis denetimi (ADR-0043 IK, ADR-0045 Geri Bildirim) ADR-0042
     * §4'un olcum protokolunu UYGULAYAMADI cunku bu satir yoktu: her yapisal
     * kaynagin DONDURDUGU SATIR SAYISI ve giren/girmeyen parcalarin SKORU
     * hicbir yerde kaydedilmiyordu.
     *
     * ⚠️ TABLO DEGIL LOG — `ai.call` ile ayni sinif (ADR-0046 §2): bir tablo
     * retention listesine YIRMI DORDUNCU ve EN HIZLI BUYUYEN kalemi eklerdi
     * (her `/ask` × her katkici) ve cevap yoluna transaction sokardi.
     */
    { provide: RETRIEVAL_SELECTION_RECORDER, useClass: LoggingRetrievalSelectionRecorder },

    {
      provide: AskUseCase,
      inject: [
        RETRIEVAL_CONTRIBUTOR_REGISTRY,
        PERMISSION_CHECKER,
        CONVERSATION_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        LLM_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
        RETRIEVAL_SELECTION_RECORDER,
      ],
      useFactory: (
        contributors: RetrievalContributorRegistry,
        permissionChecker: PermissionChecker,
        conversationRepository: ConversationRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        llmPort: LLMPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
        selectionRecorder: RetrievalSelectionRecorder,
      ): AskUseCase =>
        new AskUseCase({
          contributors,
          permissionChecker,
          conversationRepository,
          rateLimitRepository,
          embeddingPort,
          llmPort,
          transactionManager,
          idGenerator,
          clock,
          retrievalLimit: config.knowledge.retrievalLimit,
          historyMessages: config.knowledge.historyMessages,
          rateLimit: config.knowledge.askRateLimit,
          // ⚠️ Gozlemlenebilirlik — ADR-0046. HICBIR KARARI ETKILEMEZ: secim
          // `selectFragments`te yapilir ve BITER; bu yalnizca olan biteni
          // kaydeder. `record` `void` doner ve asla firlatmaz.
          selectionRecorder,
        }),
    },
  ],
  exports: [RETRIEVAL_CONTRIBUTOR_REGISTRY],
})
export class ContextModule {
  constructor(@Inject(PERMISSION_REGISTRY) registry: PermissionRegistry) {
    registry.register(CONTEXT_PERMISSIONS);
  }
}
