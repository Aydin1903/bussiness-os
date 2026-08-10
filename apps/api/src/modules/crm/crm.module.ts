import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort, createLlmPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import {
  PERMISSION_CHECKER,
  PERMISSION_REGISTRY,
  type PermissionChecker,
  type PermissionRegistry,
} from '../../platform/authz/authz.public';
import { ContextModule } from '../../platform/context/context.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
import { AI_USAGE_RECORDER, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../../shared/embedding.port';
import { LLM_PORT, type LLMPort } from '../../shared/llm.port';
import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitRepository,
} from '../../shared/rate-limit.repository.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import {
  COMPANY_SUMMARY_REPOSITORY,
  type CompanySummaryRepository,
} from './application/company-summary.repository.port';
import { CompanySummaryUseCases } from './application/company-summary.use-cases';
import { COMPANY_REPOSITORY, type CompanyRepository } from './application/company.repository.port';
import { CompanyDirectoryQuery } from './application/company-directory.query';
import { CompanyUseCases } from './application/company.use-cases';
import { CRM_COMPANY_DIRECTORY } from './crm.public';
import { CONTACT_REPOSITORY, type ContactRepository } from './application/contact.repository.port';
import { ContactUseCases } from './application/contact.use-cases';
import {
  OPPORTUNITY_REPOSITORY,
  type OpportunityRepository,
} from './application/opportunity.repository.port';
import {
  INTERACTION_REPOSITORY,
  type InteractionRepository,
} from './application/interaction.repository.port';
import { InteractionUseCases } from './application/interaction.use-cases';
import { OpportunityUseCases } from './application/opportunity.use-cases';
import { CRM_PERMISSIONS } from './crm.permissions';
import { DrizzleCompanySummaryRepository } from './infrastructure/drizzle-company-summary.repository';
import { DrizzleCompanyRepository } from './infrastructure/drizzle-company.repository';
import { DrizzleContactRepository } from './infrastructure/drizzle-contact.repository';
import { CrmInteractionsContributor } from './infrastructure/crm-interactions.contributor';
import { CrmPipelineContributor } from './infrastructure/crm-pipeline.contributor';
import { DrizzleInteractionRepository } from './infrastructure/drizzle-interaction.repository';
import { DrizzleOpportunityRepository } from './infrastructure/drizzle-opportunity.repository';
import { CompanySummaryController } from './presentation/company-summary.controller';
import { CompanyController } from './presentation/company.controller';
import { ContactController } from './presentation/contact.controller';
import { FollowUpController } from './presentation/follow-up.controller';
import { InteractionController } from './presentation/interaction.controller';
import { OpportunityController } from './presentation/opportunity.controller';

/**
 * CRM modulu — Faz 5'in ilk is modulu (ADR-0031).
 *
 * ============================================================================
 * BU SLICE'TA AI YOK — ve bu bilincli
 * ============================================================================
 * `EmbeddingPort` bu modulde HIC cagrilmaz, oran siniri YOKTUR ve
 * `RetrievalContributor` KAYDEDILMEZ. Amac, sema + RLS + RBAC zincirini AI
 * karmasikligi OLMADAN kanitlamaktir.
 *
 * Slice 6 `interactions` + `interaction_chunks` ile embedding'i, Slice 7 iki
 * katkiciyi (anlamsal + yapisal) getirecek. O gun bu modul
 * `AiObservabilityModule`'u import edecek ve kendini kurumsal hafizaya
 * kaydedecek — bugun ikisi de YOK.
 * ============================================================================
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1, Slice 1 karari). */
const CRM_CALLER = 'crm';

@Module({
  // CRM ILK KEZ AI'a dokunuyor (Slice 6): her saglayici cagrisi
  // `event: "ai.call"` satiri birakir.
  // ContextModule katkici defterini export eder; CRM kendini oraya kaydeder
  // (yon: modulden platforma — platform is modullerini import ETMEZ).
  imports: [AiObservabilityModule, ContextModule],
  controllers: [
    CompanyController,
    ContactController,
    OpportunityController,
    FollowUpController,
    InteractionController,
    // ⚠️ `CompanyController`DAN SONRA: ikisi de `crm/companies` altinda.
    // Nest rotalari kayit sirasina gore eslestirir; `:companyId/summary`
    // sabit bir alt yoldur ve `CompanyController`in `:id` rotalariyla
    // catismaz, ama sirayi bozmak ileride sessiz bir gölgeleme uretebilir.
    CompanySummaryController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: COMPANY_REPOSITORY, useClass: DrizzleCompanyRepository },
    { provide: COMPANY_SUMMARY_REPOSITORY, useClass: DrizzleCompanySummaryRepository },
    { provide: CONTACT_REPOSITORY, useClass: DrizzleContactRepository },
    { provide: OPPORTUNITY_REPOSITORY, useClass: DrizzleOpportunityRepository },
    { provide: INTERACTION_REPOSITORY, useClass: DrizzleInteractionRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir (ADR-0031 Slice 1).
    //
    // ⚠️ `LLM_PORT` KATMAN 2'DE EKLENDI (ADR-0032). Bu satirin eski hali
    // "LLM_PORT YOK — CRM completion cagirmaz" diyordu ve o gun dogruydu:
    // CRM yalnizca embedding uretiyordu. Musteri ozeti bunu degistirdi ve
    // degisikligin ikinci bir sonucu vardi — `CompletionFailedError`
    // `CrmDomainExceptionFilter`e eklenmek zorunda kaldi, yoksa saglayici
    // cokmesi 502 yerine islenmemis 500 donerdi.
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, CRM_CALLER),
    },
    {
      provide: LLM_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): LLMPort =>
        createLlmPort(config, recorder, CRM_CALLER),
    },

    {
      provide: CompanyUseCases,
      inject: [COMPANY_REPOSITORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      useFactory: (
        repository: CompanyRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): CompanyUseCases =>
        new CompanyUseCases({ repository, transactionManager, idGenerator, clock }),
    },
    {
      provide: ContactUseCases,
      inject: [CONTACT_REPOSITORY, COMPANY_REPOSITORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      useFactory: (
        repository: ContactRepository,
        companyRepository: CompanyRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): ContactUseCases =>
        new ContactUseCases({
          repository,
          companyRepository,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: OpportunityUseCases,
      inject: [
        OPPORTUNITY_REPOSITORY,
        COMPANY_REPOSITORY,
        CONTACT_REPOSITORY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: OpportunityRepository,
        companyRepository: CompanyRepository,
        contactRepository: ContactRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): OpportunityUseCases =>
        new OpportunityUseCases({
          repository,
          companyRepository,
          contactRepository,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: InteractionUseCases,
      inject: [
        INTERACTION_REPOSITORY,
        COMPANY_REPOSITORY,
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
        repository: InteractionRepository,
        companyRepository: CompanyRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): InteractionUseCases =>
        new InteractionUseCases({
          repository,
          companyRepository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.crm.interactionsRateLimit,
          reindexBatchSize: config.crm.reindexBatchSize,
        }),
    },
    {
      provide: CompanySummaryUseCases,
      inject: [
        COMPANY_SUMMARY_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        LLM_PORT,
        TRANSACTION_MANAGER,
        CLOCK,
        APP_CONFIG,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: CompanySummaryRepository,
        rateLimitRepository: RateLimitRepository,
        llmPort: LLMPort,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): CompanySummaryUseCases =>
        new CompanySummaryUseCases({
          repository,
          rateLimitRepository,
          llmPort,
          transactionManager,
          clock,
          rateLimit: config.crm.summaryRateLimit,
          contextInteractionLimit: config.crm.summaryContextInteractions,
          contextCharsPerInteraction: config.crm.summaryCharsPerInteraction,
        }),
    },
    // --- Kurumsal hafizaya IKI KATKI (ADR-0031 §5.1, §5.4) -------------------
    // Anlamsal: gorusme parcalari. Yapisal: acik firsat anlik goruntusu.
    // Ikisi de KENDI semasindan okur; birlestirmeyi platform yapar.
    {
      provide: CrmInteractionsContributor,
      inject: [INTERACTION_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: InteractionRepository,
        transactionManager: TransactionManager,
      ): CrmInteractionsContributor =>
        new CrmInteractionsContributor(repository, transactionManager),
    },
    // --- CRM'in DISA ACIK yuzeyi (ADR-0033 §2) -------------------------------
    // Projeler bir projeyi opsiyonel olarak bir sirkete baglar ve adi BURADAN
    // okur. Yon TEK YONLU: CRM Projeler'i bilmez.
    {
      provide: CRM_COMPANY_DIRECTORY,
      inject: [COMPANY_REPOSITORY, PERMISSION_CHECKER, TRANSACTION_MANAGER],
      useFactory: (
        repository: CompanyRepository,
        permissionChecker: PermissionChecker,
        transactionManager: TransactionManager,
      ): CompanyDirectoryQuery =>
        new CompanyDirectoryQuery({ repository, permissionChecker, transactionManager }),
    },
    {
      provide: CrmPipelineContributor,
      inject: [OPPORTUNITY_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      useFactory: (
        repository: OpportunityRepository,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): CrmPipelineContributor =>
        new CrmPipelineContributor(
          repository,
          transactionManager,
          clock,
          config.crm.staleStageDays,
        ),
    },
  ],
  // ⚠️ TEK KALEM ve oyle kalmali: `crm.public.ts` disinda hicbir sey disa
  // acilmaz. Repository, use case ve entity'ler CRM'in ic isidir ve
  // `import/no-restricted-paths` bunu derlemede zaten reddeder.
  exports: [CRM_COMPANY_DIRECTORY],
})
export class CrmModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    interactionsContributor: CrmInteractionsContributor,
    pipelineContributor: CrmPipelineContributor,
  ) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    permissions.register(CRM_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER
    // (ADR-0031 §5.1). Bu satirla `POST /ask` ilk kez CRM icerigi dondurebilir.
    contributors.register(interactionsContributor);
    contributors.register(pipelineContributor);
  }
}
