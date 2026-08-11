import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { CrmModule } from '../crm/crm.module';
import { CRM_COMPANY_DIRECTORY, type CompanyDirectory } from '../crm/crm.public';
import { ProjectsModule } from '../projects/projects.module';
import { PROJECTS_PROJECT_DIRECTORY, type ProjectDirectory } from '../projects/projects.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from './application/category.repository.port';
import { CategoryUseCases } from './application/category.use-cases';
import { CashflowUseCases } from './application/cashflow.use-cases';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from './application/transaction.repository.port';
import { TransactionUseCases } from './application/transaction.use-cases';
import { DrizzleCategoryRepository } from './infrastructure/drizzle-category.repository';
import { DrizzleTransactionRepository } from './infrastructure/drizzle-transaction.repository';
import { CashflowController } from './presentation/cashflow.controller';
import { CategoryController } from './presentation/category.controller';
import { TransactionController } from './presentation/transaction.controller';
import { FINANCE_PERMISSIONS } from './finance.permissions';

/**
 * Finans modulu — Faz 5'in UCUNCU is modulu (ADR-0034).
 *
 * ============================================================================
 * SLICE 1: SEMA + KATEGORILER. AI YOK, CROSS-MODUL BAGIMLILIK YOK.
 * ============================================================================
 * CRM ve Projeler'le ayni sira: once sema + RLS + RBAC zinciri AI karmasikligi
 * OLMADAN kurulur, sonra uzerine eklenir.
 *
 * Bu modul bugun DORT sey saglamiyor ve dordu de bilincli:
 *
 *   - `EMBEDDING_PORT` — yorumlar Slice 4'te gelir; bugun para harcayan bir
 *     yazma yolu YOK, dolayisiyla oran siniri da yok.
 *   - `LLM_PORT` — modul ici AI yuzeyi v1'de YOK (ADR-0034 §10). ⚠️ CRM'in
 *     ayni satiri Katman 2'de YANLISLANDI, o yuzden tetikleyici acikca
 *     yaziliyor: bir "donem ozeti" eklendigi gun hem `LLM_PORT` hem
 *     `CompletionFailedError` (filtreye) gerekir.
 *   - `ContextModule` — katkicilar Slice 6'da kaydedilir.
 *
 * ============================================================================
 * SLICE 4: MODUL ILK KEZ BASKA IS MODULLERINI OKUYOR — VE IKI TANE
 * ============================================================================
 * `CrmModule` ve `ProjectsModule` IMPORT EDILIYOR. Yuzeyler iki public
 * interface'in birer kalemidir (`CompanyDirectory`, `ProjectDirectory`); her
 * iki modulun `domain/`, `application/`, `infrastructure/` katmanlari
 * `import/no-restricted-paths` ile ZATEN kapali.
 *
 * ⚠️ BAGIMLILIK GRAFIGI ILK KEZ DALLANDI ve bir DAG olarak kaldi:
 *
 *     Projeler ──► CRM
 *     Finans   ──► CRM
 *     Finans   ──► Projeler
 *
 * Uc kenar, dongu YOK. CRM hicbirini bilmez; Projeler Finans'i bilmez.
 *
 * ⚠️ KALAN DOKUZ MODULU BAGLAYAN KURAL: yeni bir kenar eklenmeden ONCE dongu
 * kontrol edilir. Ters yon isteniyorsa (proje detayinda o projenin
 * masraflarini gostermek) cozum `forwardRef` DEGIL UCUNCU BIR MODULDUR —
 * projede bir kez yasandi (Tenant <-> Identity) ve cozumu `platform/session`
 * oldu.
 *
 * ⚠️ GENELLESTIRME REDDEDILDI (ADR-0034 §4.1): iki dizin birbirinin
 * kopyasidir ve OYLE KALIYOR. Ortak bir yardimci, izin kapisini kaynagin
 * sahibinden alirdi — gerekce `projects.public.ts`in bas yorumunda.
 * ============================================================================
 */
@Module({
  imports: [CrmModule, ProjectsModule],
  // ⚠️ SIRA BURADA DOGRULUK KOSULU DEGIL — ve bu, `projects.module.ts`ten
  // FARKLI oldugu icin acikca yaziliyor. Orada `ProjectController`in `GET :id`
  // rotasi kardeslerini golgeliyordu; burada iki controller da SABIT onek
  // tasiyor (`finance/categories`, `finance/transactions`) ve hicbiri
  // `finance/:id` gibi bir yakalayici tanimlamiyor.
  //
  // ⚠️ Bir gun `finance/:id` eklenirse o controller listenin SONUNA yazilmali.
  controllers: [CategoryController, TransactionController, CashflowController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
    { provide: TRANSACTION_REPOSITORY, useClass: DrizzleTransactionRepository },

    {
      provide: CategoryUseCases,
      inject: [CATEGORY_REPOSITORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: CategoryRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): CategoryUseCases =>
        new CategoryUseCases({ repository, transactionManager, idGenerator, clock }),
    },
    {
      provide: TransactionUseCases,
      // ⚠️ `CATEGORY_REPOSITORY`ye BAGIMLI — ters degil. Bir islem bir
      // kategoriye baglanirken kategorinin VARLIGI, ARSIV durumu ve YONU
      // dogrulanir (ADR-0034 §3c). Yon tek ve dongusuzdur: kategori tarafi
      // islemleri hic bilmez.
      inject: [
        TRANSACTION_REPOSITORY,
        CATEGORY_REPOSITORY,
        CRM_COMPANY_DIRECTORY,
        PROJECTS_PROJECT_DIRECTORY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: TransactionRepository,
        categoryRepository: CategoryRepository,
        companyDirectory: CompanyDirectory,
        projectDirectory: ProjectDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): TransactionUseCases =>
        new TransactionUseCases({
          repository,
          categoryRepository,
          companyDirectory,
          projectDirectory,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
    {
      provide: CashflowUseCases,
      // ⚠️ Ozetin KENDI repository'si YOK: veri `finance.transactions`tadir ve
      // ayni tabloya ikinci bir kapi acmak, ayni RLS/filtre kurallarinin iki
      // yerde yasamasi demekti. `DrizzleProjectRepository`nin yapisal katki
      // sorgularini kendi icinde tutmasiyla ayni karar.
      inject: [TRANSACTION_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: TransactionRepository,
        transactionManager: TransactionManager,
      ): CashflowUseCases => new CashflowUseCases({ repository, transactionManager }),
    },
  ],
})
export class FinanceModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    permissions.register(FINANCE_PERMISSIONS);
  }
}
