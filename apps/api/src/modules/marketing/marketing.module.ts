import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { ContextModule } from '../../platform/context/context.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
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
import { CrmModule } from '../crm/crm.module';
import { CRM_COMPANY_DIRECTORY, type CompanyDirectory } from '../crm/crm.public';
import {
  MARKETING_REPOSITORY,
  type MarketingRepository,
} from './application/marketing.repository.port';
import { MarketingUseCases } from './application/marketing.use-cases';
import { CampaignGapContributor } from './infrastructure/campaign-gap.contributor';
import { CampaignNotesContributor } from './infrastructure/campaign-notes.contributor';
import { DrizzleMarketingRepository } from './infrastructure/drizzle-marketing.repository';
import { MARKETING_PERMISSIONS } from './marketing.permissions';
import { MarketingController } from './presentation/marketing.controller';

const MARKETING_CALLER = 'marketing';

/**
 * Kampanya / Pazarlama Notlari — Faz 5'in ONBIRINCI is modulu (ADR-0047).
 *
 * ⚠️ `CrmModule` import edilir ama YON TEK YONLUDUR: CRM, Kampanya'yi BILMEZ
 * ve bilmemelidir. Bagimlilik grafiginde kenar SEKIZDEN DOKUZA cikar ve graf
 * hala DAG'dir — Kampanya bir YAPRAKTIR (`marketing.public.ts` ACILMAZ,
 * ADR-0047 §6.3).
 */
@Module({
  imports: [AiObservabilityModule, ContextModule, CrmModule],
  controllers: [MarketingController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: MARKETING_REPOSITORY, useClass: DrizzleMarketingRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, MARKETING_CALLER),
    },
    {
      provide: MarketingUseCases,
      inject: [
        MARKETING_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        CRM_COMPANY_DIRECTORY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      useFactory: (
        repository: MarketingRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        companyDirectory: CompanyDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): MarketingUseCases =>
        new MarketingUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          companyDirectory,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.marketing.embeddingRateLimit,
          reindexBatchSize: config.marketing.reindexBatchSize,
        }),
    },
    {
      provide: CampaignNotesContributor,
      inject: [MARKETING_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: MarketingRepository,
        transactionManager: TransactionManager,
      ): CampaignNotesContributor => new CampaignNotesContributor(repository, transactionManager),
    },
    {
      provide: CampaignGapContributor,
      inject: [MARKETING_REPOSITORY, TRANSACTION_MANAGER, CLOCK],
      useFactory: (
        repository: MarketingRepository,
        transactionManager: TransactionManager,
        clock: Clock,
      ): CampaignGapContributor =>
        new CampaignGapContributor(repository, transactionManager, clock),
    },
  ],
})
export class MarketingModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    notesContributor: CampaignNotesContributor,
    gapContributor: CampaignGapContributor,
  ) {
    permissions.register(MARKETING_PERMISSIONS);

    // ⚠️ IKI KATKICI — biri ANLAMSAL biri YAPISAL, ve ikisinin ORTUSME KUMESI
    // BOSTUR (ADR-0047 §3.3): `campaign-notes` yalnizca sonuc notu OLAN
    // kayitlari gorur, `campaign-gap` yalnizca sonuc notu OLMAYANLARI.
    //
    // ⚠️ `campaign-gap` T2'yi (`2K/3` = 6) ASAR ve bu BEKLENEN bir sonuctur:
    // yapisal kaynak sayisi 8'e cikar. ADR-0042'nin kendi maddesi geregi
    // eskiden sonra TABAN YENIDEN DEGERLENDIRILIR — o karar bu modulun degil
    // bir PLATFORM ADR'sinin isidir.
    contributors.register(notesContributor);
    contributors.register(gapContributor);
  }
}
