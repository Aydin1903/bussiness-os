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
import { COMPANY_REPOSITORY, type CompanyRepository } from './application/company.repository.port';
import { CompanyUseCases } from './application/company.use-cases';
import { CONTACT_REPOSITORY, type ContactRepository } from './application/contact.repository.port';
import { ContactUseCases } from './application/contact.use-cases';
import { CRM_PERMISSIONS } from './crm.permissions';
import { DrizzleCompanyRepository } from './infrastructure/drizzle-company.repository';
import { DrizzleContactRepository } from './infrastructure/drizzle-contact.repository';
import { CompanyController } from './presentation/company.controller';
import { ContactController } from './presentation/contact.controller';

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
@Module({
  controllers: [CompanyController, ContactController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: COMPANY_REPOSITORY, useClass: DrizzleCompanyRepository },
    { provide: CONTACT_REPOSITORY, useClass: DrizzleContactRepository },

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
  ],
})
export class CrmModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    permissions.register(CRM_PERMISSIONS);
  }
}
