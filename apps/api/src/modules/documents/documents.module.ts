import { Inject, Module } from '@nestjs/common';

import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { createStoragePort } from '../../infrastructure/storage/storage.factory';
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
import { STORAGE_PORT, type StoragePort } from '../../shared/storage.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { CrmModule } from '../crm/crm.module';
import { CRM_CONTACT_DIRECTORY, type ContactDirectory } from '../crm/crm.public';
import { ProjectsModule } from '../projects/projects.module';
import { PROJECTS_PROJECT_DIRECTORY, type ProjectDirectory } from '../projects/projects.public';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
} from './application/document.repository.port';
import { DocumentUseCases } from './application/document.use-cases';
import { TEXT_EXTRACTOR_PORT, type TextExtractorPort } from './application/text-extractor.port';
import { DOCUMENTS_PERMISSIONS } from './documents.permissions';
import { DocumentsContributor } from './infrastructure/documents.contributor';
import { DrizzleDocumentRepository } from './infrastructure/drizzle-document.repository';
import { PdfDocxTextExtractorAdapter } from './infrastructure/pdf-docx-text-extractor.adapter';
import { DocumentController } from './presentation/document.controller';

/**
 * Belge / Sozlesme Yonetimi — Faz 5'in BESINCI is modulu (ADR-0037).
 *
 * ============================================================================
 * ⚠️ PROJEDE ILK KEZ: VERITABANI DISINDA KALICI DURUM
 * ============================================================================
 * `STORAGE_PORT` saglaniyor. Bugune kadar her modulun tum durumu
 * PostgreSQL'deydi ve bir transaction hepsini kapsiyordu; burada dosya R2'de,
 * metadata veritabaninda ve aralarinda ATOMIK ISLEM YOK. Karar: her zaman
 * YETIM NESNE tarafinda kalinir, NESNESIZ KAYIT asla (ADR-0037 §5.3).
 *
 * ⚠️ Port YENI DEGIL — ADR-0009 onu 2026-07-20'de karara bagladi ve saglayici
 * secimini ACIK biraktı. ADR-0037 o kosulu cekti: **Cloudflare R2**. Bu modul
 * portun ILK TUKETICISIDIR.
 *
 * ⚠️ NESNE DEPOSUNDA RLS YOKTUR. Tenant izolasyonun oradaki tek mekanik
 * dayanagi anahtar duzenidir (`tenants/<tenantId>/documents/...`) ve bir okuma
 * yolu anahtari HER ZAMAN veritabanindan alir.
 *
 * ============================================================================
 * ⚠️ CROSS-MODUL: IKI KENAR EKLENDI, HICBIR MODUL DEGISMEDI
 * ============================================================================
 * `CrmModule` ve `ProjectsModule` IMPORT EDILIYOR — ama bu modul onlara TEK
 * SATIR EKLETMEDI. Ihtiyac duydugu iki arayuz de ZATEN YAZILMISTI:
 * `ContactDirectory`yi Randevu (ADR-0035 §4), `ProjectDirectory`yi Finans
 * (ADR-0034 §4) yazdi.
 *
 * ADR-0035 §4.2'nin netlestirdigi kural ILK KEZ *TALIP* TARAFINDAN sinaniyor:
 *   - yeni bir TALIP        -> hedef modulun public dosyasi DEGISMEZ,
 *   - yeni bir KAYNAK TURU  -> sahibi modul kendi dizinini yazar.
 *
 * ⚠️ Olculebilir sonucu: cross-modul referans icin AYRI BIR SLICE GEREKMEDI
 * (ADR-0033 ve ADR-0035 onu Mutlak Kural 1-2 geregi ayirmisti; burada
 * ayrilacak bir is yok).
 *
 * ⚠️ BAGIMLILIK GRAFIGINDE BESINCI VE ALTINCI KENAR — ve DAG kaliyor:
 *
 *     katman 0:  CRM
 *     katman 1:  Projeler          (-> CRM)
 *     katman 2:  Finans, Randevu, Belge
 *
 *     Projeler -> CRM
 *     Finans   -> CRM
 *     Finans   -> Projeler
 *     Randevu  -> CRM
 *     Belge    -> CRM         <- bu is
 *     Belge    -> Projeler    <- bu is
 *
 * Her kenar yuksek katmandan dusuk katmana gider; geriye giden tek bir kenar
 * yoktur, dolayisiyla dongu de yoktur. ⚠️ TERS YON YASAK (CRM'in kisi
 * detayinda belgeleri gostermesi): cozum `forwardRef` DEGIL UCUNCU BIR
 * MODULDUR.
 *
 * ============================================================================
 * ⚠️ TEK KATKICI — ALTINCI ANLAMSAL KAYNAK, YAPISAL OLAN YOK
 * ============================================================================
 * Onceki dort modulun dordu de ikinci bir YAPISAL katkici kaydetmisti. Bir
 * belgenin turetilebilir bir DURUMU yoktur (§8) ve ADR-0036 sonrasi "yapisal"
 * etiketi bir IMTIYAZDIR: uydurma bir ozeti yapisal ilan etmek, taban
 * kisitindan haksiz bir yuva calmak olurdu.
 *
 * ⚠️ ADR-0036'NIN TABAN KISITI BURADA ILK GERCEK YUKUNU TASIYOR: taban 3
 * KALIR (yapisal kaynak sayisi degismedi), degisen tek sey serbest bes yuvanin
 * artik ALTI anlamsal kaynak arasinda paylasilmasi. Canli dagilim olcumu
 * kapanis denetiminin ZORUNLU maddesidir.
 *
 * ============================================================================
 * ⚠️ FILTREYE DORT HATA TIPI BASTAN YAZILDI (§9)
 * ============================================================================
 * `EmbeddingFailedError` · `StorageFailedError` · `RateLimitExceededError` ·
 * `CompletionFailedError`. `LLM_PORT` SAGLANMIYOR ve bu dogru — modul
 * completion cagirmaz; dorduncu satir bilincli OLU KODDUR (asimetrik bedel,
 * ADR-0035 §8).
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const DOCUMENTS_CALLER = 'documents';

@Module({
  imports: [AiObservabilityModule, ContextModule, CrmModule, ProjectsModule],
  controllers: [DocumentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: DOCUMENT_REPOSITORY, useClass: DrizzleDocumentRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // ⚠️ Metin cikarimi MODULUN KENDI portudur, `shared/`da DEGIL (§6.2):
    // bugun yalnizca bu modulun isi. `StoragePort`un tam tersi karar ve ayrim
    // bilincli — ikinci bir tuketici cikarsa ADR-0031'in yaptigi tasima
    // yapilir.
    { provide: TEXT_EXTRACTOR_PORT, useClass: PdfDocxTextExtractorAdapter },

    // Nesne deposu: saglayici secimi TEK YERDE (ADR-0009). Production R2,
    // lokal/CI MinIO — ikisi de `s3`tir ve ayrimi `endpoint` tasir.
    {
      provide: STORAGE_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): StoragePort => createStoragePort(config),
    },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini
    // gosterir (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, DOCUMENTS_CALLER),
    },

    {
      provide: DocumentUseCases,
      inject: [
        DOCUMENT_REPOSITORY,
        STORAGE_PORT,
        TEXT_EXTRACTOR_PORT,
        // ⚠️ CRM ve Projeler'in PUBLIC yuzeyleri — repository DEGIL. Izin
        // kapilari (`contact:read` / `project:read`) dizinlerin ICINDEDIR; bu
        // modul onlari bilmez ve bilmemelidir (ADR-0037 §4).
        CRM_CONTACT_DIRECTORY,
        PROJECTS_PROJECT_DIRECTORY,
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
        repository: DocumentRepository,
        storagePort: StoragePort,
        textExtractor: TextExtractorPort,
        contactDirectory: ContactDirectory,
        projectDirectory: ProjectDirectory,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): DocumentUseCases =>
        new DocumentUseCases({
          repository,
          storagePort,
          textExtractor,
          contactDirectory,
          projectDirectory,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.documents.embeddingRateLimit,
          reindexBatchSize: config.documents.reindexBatchSize,
          maxFileBytes: config.documents.maxFileBytes,
          maxChunks: config.documents.maxChunks,
        }),
    },

    {
      provide: DocumentsContributor,
      inject: [DOCUMENT_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: DocumentRepository,
        transactionManager: TransactionManager,
      ): DocumentsContributor => new DocumentsContributor(repository, transactionManager),
    },
  ],
})
export class DocumentsModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    documentsContributor: DocumentsContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Katalog GENISTIR (dort rol de okur) — ve asil gerekce TERSTEN gelir:
    // dar katalog bu modulde YANLIS BIR GUVENLIK HISSI verirdi, cunku
    // hassasiyet BELGE BASINADIR ve rol seviyesinde ifade edilemez. Gerekce ve
    // ondan dogan URUN KISITI `documents.permissions.ts`te.
    permissions.register(DOCUMENTS_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ TEK katkici — ve bu, bir eksiklik degil bir karardir (§8).
    contributors.register(documentsContributor);
  }
}
