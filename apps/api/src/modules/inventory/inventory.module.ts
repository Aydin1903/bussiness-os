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
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from './application/inventory.repository.port';
import { InventoryUseCases } from './application/inventory.use-cases';
import { DrizzleInventoryRepository } from './infrastructure/drizzle-inventory.repository';
import { InventoryNotesContributor } from './infrastructure/inventory-notes.contributor';
import { InventoryStockContributor } from './infrastructure/inventory-stock.contributor';
import { INVENTORY_PERMISSIONS } from './inventory.permissions';
import { InventoryController } from './presentation/inventory.controller';

/**
 * Stok / Envanter modulu — Faz 5'in ALTINCI is modulu (ADR-0039).
 *
 * ============================================================================
 * ⚠️ CRM'DEN BU YANA CIKAN KENARI OLMAYAN ILK IS MODULU
 * ============================================================================
 * `imports` listesinde BASKA BIR IS MODULU YOKTUR (ADR-0039 §9). Projeler,
 * Finans, Randevu ve Belge'nin hepsi en az bir `*Module` import ediyordu;
 * burada YOK.
 *
 * Bagimlilik grafigi ALTI KENARDA kaliyor ve hala DAG:
 *
 *     katman 0: CRM · INVENTORY  ← yeni, cikan kenari YOK
 *     katman 1: Projeler ──► CRM
 *     katman 2: Finans ──► CRM, Projeler
 *               Randevu ──► CRM
 *               Belge   ──► CRM, Projeler
 *
 * ⚠️ 7. MODUL (Tedarikci) BIR KALEME ISARET ETMEK ISTEDIGI GUN
 * `inventory.public.ts`I YAZAN MODUL BU MODULDUR — talip degil SAHIP yazar
 * (ADR-0037 §4.1'in kurali, ADR-0039 §9.1'de ileri not olarak kayitli).
 *
 * ============================================================================
 * ⚠️ BU MODULUN MERKEZI KARARI BIR KOLONUN YOKLUGUDUR (§2)
 * ============================================================================
 * Miktar `inventory.items`te SAKLANMAZ; `movements`tan HER OKUMADA turetilir.
 * Projede dokuzuncu kez ayni karar — ama ilk kez GERCEK BIR BEDELLE, cunku
 * turetme sinirsiz buyuyen bir defteri tarar.
 *
 * ⚠️ Bunun bu dosyadaki izi: `InventoryUseCases`in HICBIR bagimliligi bir
 * "miktar guncelleyici" DEGILDIR. Miktari degistirmenin tek yolu bir HAREKET
 * yazmaktir.
 *
 * ============================================================================
 * IKI KATKICI — VE YAPISAL KAYNAK SAYISI 4'TEN 5'E CIKIYOR
 * ============================================================================
 * `POST /ask` artik stok durumunu da gorebiliyor: yapisal (`inventory-stock`) +
 * anlamsal (`inventory-notes`).
 *
 * ⚠️ ADR-0036'NIN YENIDEN GOZDEN GECIRME ESIGINE BIR KALDI. O ADR
 * _"yapisal kaynak sayisi tabanin IKI KATINI gectiginde (bugun 4, esik 6)"_
 * demisti; bu modul sayiyi 5 yapiyor. 7. modul bir yapisal katkici eklerse
 * ADR-0036 YENIDEN ACILMAK ZORUNDADIR.
 *
 * ⚠️ Anlamsal kaynak sayisi YEDIYE cikti ve serbest yuva hala BES: bir anlamsal
 * kaynagin sifir almasi ADR-0036'nin YAZILI BEKLENTISIDIR, bir kusuru degil.
 *
 * ============================================================================
 * ✅ FILTREYE BES HATA TIPI ONCEDEN EKLENDI
 * ============================================================================
 * `EmbeddingFailedError` + `RateLimitExceededError` + `CompletionFailedError`
 * (+ iki domain tipi) — Product Owner'in KALICI STANDARDI (CLAUDE.md
 * "Kalici ders: DisclosableProblem"). ⚠️ `LLM_PORT` SAGLANMIYOR ve bu bugun
 * DOGRU: Stok completion cagirmaz, modul ici AI yuzeyi v1'de yok. Filtre yine de
 * `CompletionFailedError`i yakaliyor — bedeller simetrik degil (bir satirlik olu
 * kod ile islenmemis bir 500).
 *
 * ⚠️ `StorageFailedError` EKLENMEDI ve bu celiski DEGIL: kural AI hata tipleri
 * icindir; bu modul `StoragePort`u kullanmiyor ve kullanmayacak (gerekce
 * `inventory-domain-exception.filter.ts`te).
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const INVENTORY_CALLER = 'inventory';

@Module({
  imports: [AiObservabilityModule, ContextModule],
  controllers: [InventoryController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: INVENTORY_REPOSITORY, useClass: DrizzleInventoryRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini gosterir
    // (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, INVENTORY_CALLER),
    },

    {
      provide: InventoryUseCases,
      inject: [
        INVENTORY_REPOSITORY,
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
        repository: InventoryRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): InventoryUseCases =>
        new InventoryUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.inventory.embeddingRateLimit,
          reindexBatchSize: config.inventory.reindexBatchSize,
        }),
    },

    // --- Kurumsal hafizaya IKI KATKI (ADR-0039 §6) ---------------------------
    // Yapisal: esik alti / negatif kalemler + donem ozeti. Anlamsal: kalem notu
    // vektorleri. Ikisi de KENDI semasindan okur; birlestirmeyi platform yapar.
    {
      provide: InventoryStockContributor,
      inject: [INVENTORY_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        repository: InventoryRepository,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): InventoryStockContributor =>
        new InventoryStockContributor(
          repository,
          transactionManager,
          clock,
          config.inventory.nearThresholdRatio,
        ),
    },
    {
      provide: InventoryNotesContributor,
      inject: [INVENTORY_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: InventoryRepository,
        transactionManager: TransactionManager,
      ): InventoryNotesContributor => new InventoryNotesContributor(repository, transactionManager),
    },
  ],
})
export class InventoryModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    stockContributor: InventoryStockContributor,
    notesContributor: InventoryNotesContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Adlar NITELENMIS (`stock_item`, `stock_movement`): 8. modul
    // (Teklif/Fatura) LINE ITEM kavramini getirecek ve `item:read` o gun ya
    // breaking change ile degisirdi ya da iki modul tek kelimeyi paylasirdi
    // (gerekce `inventory.permissions.ts`te).
    //
    // ⚠️ `stock_movement:delete` LISTEDE YOK ve acilmayacak — defter
    // DEGISTIRILEMEZ (ADR-0039 §3.3).
    permissions.register(INVENTORY_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ Bu iki satirla `POST /ask` ilk kez bir TOPLAMI okuyabiliyor: onceki
    // dort yapisal katkici kolonlari OKUYORDU (durum, asama, tarih), bu
    // TOPLUYOR. "Neyimiz bitiyor" sorusunun cevabi bugune kadar hicbir modulde
    // yoktu.
    contributors.register(stockContributor);
    contributors.register(notesContributor);
  }
}
