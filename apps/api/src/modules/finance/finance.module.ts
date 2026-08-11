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
import { CrmModule } from '../crm/crm.module';
import { CRM_COMPANY_DIRECTORY, type CompanyDirectory } from '../crm/crm.public';
import { ProjectsModule } from '../projects/projects.module';
import { PROJECTS_PROJECT_DIRECTORY, type ProjectDirectory } from '../projects/projects.public';
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
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from './application/category.repository.port';
import { CategoryUseCases } from './application/category.use-cases';
import { CashflowUseCases } from './application/cashflow.use-cases';
import {
  COMMENTARY_REPOSITORY,
  type CommentaryRepository,
} from './application/commentary.repository.port';
import { CommentaryUseCases } from './application/commentary.use-cases';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from './application/transaction.repository.port';
import { TransactionUseCases } from './application/transaction.use-cases';
import { DrizzleCategoryRepository } from './infrastructure/drizzle-category.repository';
import { DrizzleCommentaryRepository } from './infrastructure/drizzle-commentary.repository';
import { FinanceCashflowContributor } from './infrastructure/finance-cashflow.contributor';
import { FinanceCommentariesContributor } from './infrastructure/finance-commentaries.contributor';
import { DrizzleTransactionRepository } from './infrastructure/drizzle-transaction.repository';
import { CashflowController } from './presentation/cashflow.controller';
import { CommentaryController } from './presentation/commentary.controller';
import { CategoryController } from './presentation/category.controller';
import { TransactionController } from './presentation/transaction.controller';
import { FINANCE_PERMISSIONS } from './finance.permissions';

/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const FINANCE_CALLER = 'finance';

/**
 * Finans modulu — Faz 5'in UCUNCU is modulu (ADR-0034).
 *
 * ============================================================================
 * SLICE 5: MODUL ILK KEZ AI'A DOKUNUYOR
 * ============================================================================
 * `EMBEDDING_PORT` artik SAGLANIYOR ve `commentaries` yazma yolunda cagriliyor;
 * her cagri `event: "ai.call"` satiri birakiyor (`AiObservabilityModule`). Oran
 * siniri `platform.rate_limits` uzerinde tek kalem deklare ediyor — DORDUNCU
 * modulde de DORDUNCU bir sayac tablosu ACILMIYOR (ADR-0031 §4.2'nin ise
 * yaradiginin olcusu).
 *
 * ⚠️ GOMULEN SEY YORUMLARDIR, ISLEM ACIKLAMALARI DEGIL (ADR-0034 §6.1). Bu,
 * Finans'in degil `POST /ask`in karari: binlerce neredeyse ozdes kisa vektor,
 * DORT kaynagin paylastigi sekiz yuvali havuzu kirletir ve DIGER UC MODULUN en
 * iyi parcalarini disari iter.
 *
 * ✅ Filtreye `RateLimitExceededError` + `EmbeddingFailedError` ONCEDEN eklendi
 * (Product Owner talimati). CRM'de bu ders DORT KEZ, her seferinde bir testin
 * kirmizi yanmasiyla ogrenilmisti.
 *
 * ⚠️ `LLM_PORT` SAGLANMIYOR ve bu bugun DOGRU: Finans completion cagirmaz
 * (ADR-0034 §10 — modul ici AI yuzeyi v1'de yok). CRM'in ayni satiri Katman
 * 2'de YANLISLANDI, o yuzden tetikleyici acikca yaziliyor: bir "donem ozeti"
 * eklendigi gun hem `LLM_PORT` hem `CompletionFailedError` (filtreye) gerekir.
 *
 * ============================================================================
 * SLICE 6: IKI KATKICI KAYDEDILDI — VE IZIN FILTRESI TETIKCISINI BULDU
 * ============================================================================
 * `POST /ask` artik Finans icerigini de gorebiliyor: anlamsal
 * (`finance-commentaries`) + yapisal (`finance-cashflow`). CLAUDE.md'nin CEO
 * ornegi ("CRM'deki musteri hareketleri, FINANS'TAKI NAKIT AKISI, Projeler'deki
 * teslim performansi") ile TAMAMLANDI.
 *
 * ⚠️ YAPISAL KATKICI RISKE GORE SKOR VERIR (0.95/0.90/0.75). Artik UC yapisal
 * katkici ayni sekiz yuvali havuzu paylasiyor (3+5+3 = 11 > 8); sabit yuksek
 * skor, DORT anlamsal kaynagin hicbirini iceri birakmazdi.
 *
 * ⚠️ VE BU SLICE, ADR-0031 §5.3'un izin filtresinin ILK GERCEK TETIKCISIDIR:
 * `member` rolu `context:ask` TASIR ama `cashflow:read` / `commentary:read`
 * TASIMAZ. Bugune kadar boyle bir rol YOKTU — `context-contributors`
 * entegrasyon testi bunu acikca kaydediyordu ("KATKICI SEVIYESINDEKI eleme
 * HTTP'den sinanamaz"). Artik sinanabiliyor.
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
  imports: [AiObservabilityModule, ContextModule, CrmModule, ProjectsModule],
  // ⚠️ SIRA BURADA DOGRULUK KOSULU DEGIL — ve bu, `projects.module.ts`ten
  // FARKLI oldugu icin acikca yaziliyor. Orada `ProjectController`in `GET :id`
  // rotasi kardeslerini golgeliyordu; burada iki controller da SABIT onek
  // tasiyor (`finance/categories`, `finance/transactions`) ve hicbiri
  // `finance/:id` gibi bir yakalayici tanimlamiyor.
  //
  // ⚠️ Bir gun `finance/:id` eklenirse o controller listenin SONUNA yazilmali.
  controllers: [
    CategoryController,
    TransactionController,
    CashflowController,
    CommentaryController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
    { provide: TRANSACTION_REPOSITORY, useClass: DrizzleTransactionRepository },
    { provide: COMMENTARY_REPOSITORY, useClass: DrizzleCommentaryRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini
    // gosterir (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, FINANCE_CALLER),
    },

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
    {
      provide: CommentaryUseCases,
      inject: [
        COMMENTARY_REPOSITORY,
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
        repository: CommentaryRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): CommentaryUseCases =>
        new CommentaryUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.finance.commentariesRateLimit,
          reindexBatchSize: config.finance.reindexBatchSize,
        }),
    },
    // --- Kurumsal hafizaya IKI KATKI (ADR-0034 §6) ---------------------------
    // Anlamsal: finansal yorum parcalari. Yapisal: para birimi basina nakit
    // akisi anlik goruntusu. Ikisi de KENDI semasindan okur; birlestirmeyi
    // platform yapar.
    {
      provide: FinanceCommentariesContributor,
      inject: [COMMENTARY_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: CommentaryRepository,
        transactionManager: TransactionManager,
      ): FinanceCommentariesContributor =>
        new FinanceCommentariesContributor(repository, transactionManager),
    },
    {
      // ⚠️ Repository DEGIL, USE CASE aliyor: ozetin nasil hesaplandigi TEK
      // yerde yasamali. Iki yerde hesaplansaydi `GET /finance/summary`in
      // gosterdigi rakam ile AI'in soyledigi rakam SESSIZCE ayrisabilirdi.
      provide: FinanceCashflowContributor,
      inject: [CashflowUseCases, CLOCK],
      useFactory: (cashflow: CashflowUseCases, clock: Clock): FinanceCashflowContributor =>
        new FinanceCashflowContributor(cashflow, clock),
    },
  ],
})
export class FinanceModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    commentariesContributor: FinanceCommentariesContributor,
    cashflowContributor: FinanceCashflowContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    permissions.register(FINANCE_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ Bu iki satirla CLAUDE.md'nin CEO ornegi TAMAMLANIYOR: "CRM'deki
    // musteri hareketleri, FINANS'TAKI NAKIT AKISI, Projeler'deki teslim
    // performansi" — uc kaynagin ucu de yerinde. `POST /ask` artik ALTI
    // katkiciyi birlestiriyor.
    //
    // ⚠️ Ve ayni iki satir, `POST /ask` izin filtresinin ILK GERCEK
    // TETIKCISIDIR: `member` rolu `context:ask` TASIR ama `cashflow:read` /
    // `commentary:read` TASIMAZ, dolayisiyla bu iki katkici onun sorusunda HIC
    // CAGRILMAZ. Bugune kadar boyle bir rol YOKTU (ADR-0031 §5.3'un kapisi
    // "tetikcisiz" duruyordu).
    contributors.register(commentariesContributor);
    contributors.register(cashflowContributor);
  }
}
