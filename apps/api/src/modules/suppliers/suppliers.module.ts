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
  SUPPLIER_REPOSITORY,
  type SupplierRepository,
} from './application/supplier.repository.port';
import { SupplierUseCases } from './application/supplier.use-cases';
import { DrizzleSupplierRepository } from './infrastructure/drizzle-supplier.repository';
import { SupplierInteractionsContributor } from './infrastructure/supplier-interactions.contributor';
import { SupplierController } from './presentation/supplier.controller';
import { SUPPLIERS_PERMISSIONS } from './suppliers.permissions';

/**
 * Tedarikci Yonetimi — Faz 5'in YEDINCI is modulu (ADR-0040).
 *
 * ROADMAP §3.5: _"CRM deseninin UCUZ TEKRARI — ayni sekil, ters yon (satin
 * alma)."_
 *
 * ============================================================================
 * ⚠️ CIKAN KENARI OLMAYAN IKINCI IS MODULU — AMA SEBEBI FARKLI
 * ============================================================================
 * `imports` listesinde BASKA BIR IS MODULU YOKTUR (ADR-0040 §4). Stok'ta da
 * boyleydi, ama fark KAYDEDILMEYE DEGER:
 *
 *   Stok'ta      -> hedef sema MEVCUT DEGILDI (tedarikci tablosu yoktu).
 *                   Dogrulanamayan bir isaretciyi kabul etmek ADR-0033
 *                   Slice 1'in ogrettigi hata olurdu.
 *   Burada       -> hedef sema CANLI (`inventory`), ROADMAP §3.6 kenari acikca
 *                   sayiyor ("Tedarikci → Stok") ve ADR-0039 §9.1 dizini KIMIN
 *                   YAZACAGINI bile yazmis durumda. YINE DE eklenmiyor.
 *
 * Yani bu bir BOSLUK degil, BIR HAYIRDIR (§4.1): (a) baglantinin bir FIILI yok
 * — "bu tedarikci su kalemi saglar" bir OLGU degil bir KATALOGDUR ve olgu ancak
 * bir SIPARISLE dogar; (b) sekil bugune kadarki cross-modul deseninin sekli
 * DEGIL — tek nullable kolon degil bir N:N ARA TABLOSU, ve sarkan isaretciyi
 * CATALLAR; (c) gercek talep 8. modulden gelecek.
 *
 * Bagimlilik grafigi ALTI KENARDA kaliyor ve hala DAG:
 *
 *     katman 0: CRM · INVENTORY · SUPPLIERS  ← yeni, cikan kenari YOK
 *     katman 1: Projeler ──► CRM
 *     katman 2: Finans ──► CRM, Projeler
 *               Randevu ──► CRM
 *               Belge   ──► CRM, Projeler
 *
 * ⚠️ O gun geldiginde `inventory.public.ts`i YAZAN modul STOK olacaktir
 * (ADR-0039 §9.1) — talip degil SAHIP yazar. Ve `suppliers.public.ts` de BU
 * SLICE'TA YAZILMAZ: bugun bir tedarikciyi gostermek isteyen HICBIR MODUL YOK.
 *
 * ============================================================================
 * ⚠️ TEK KATKICI — VE BU, ADR-0036'NIN ESIGINE DOKUNMAMA KARARIDIR
 * ============================================================================
 * `POST /ask` artik tedarikci gorusmelerini de gorebiliyor: anlamsal
 * (`supplier-interactions`). YANINDA BIR YAPISAL KATKICI YOKTUR.
 *
 * ADR-0039 §7.2 bu module acikca soru birakmisti:
 *
 *     "⚠️ 7. modul (Tedarikci Yonetimi) bir YAPISAL katkici eklerse esik ASILIR
 *      ve ADR-0036 yeniden acilmak ZORUNDADIR."
 *
 * Satir okundu ve uc aday tek tek degerlendirilip reddedildi (gerekce
 * `supplier-interactions.contributor.ts`te). Sayilar:
 *
 *     anlamsal kaynak   7 -> 8   (`supplier-interactions`)
 *     YAPISAL kaynak    5 -> 5   ⚠️ DEGISMIYOR
 *     ADR-0036 esigi      6      ⚠️ ASILMIYOR
 *     fan-out          12 -> 13
 *     global top-K         8     (degismedi)
 *     yapisal taban        3     (`ceil(K/3)` — degismedi)
 *
 * ⚠️ Anlamsal tarafta baski ARTIYOR: BES serbest yuva icin artik SEKIZ kaynak
 * yarisiyor. Uc kaynagin sifir almasi ADR-0036'nin YAZILI BEKLENTISIDIR, bir
 * kusuru degil — anlamsal kaynaklar arasinda TABAN YOKTUR, eleme LIYAKATTIR.
 *
 * ============================================================================
 * ✅ FILTREYE AI HATA TIPLERI ONCEDEN EKLENDI
 * ============================================================================
 * `EmbeddingFailedError` + `RateLimitExceededError` + `CompletionFailedError`
 * — Product Owner'in KALICI STANDARDI (CLAUDE.md "Kalici ders:
 * DisclosableProblem"). ⚠️ `LLM_PORT` SAGLANMIYOR ve bu bugun DOGRU: Tedarikci
 * completion cagirmaz, modul ici AI yuzeyi v1'de yok. Filtre yine de
 * `CompletionFailedError`i yakaliyor — bedeller SIMETRIK DEGIL (bir satirlik
 * olu kod ile islenmemis bir 500).
 *
 * ⚠️ `StorageFailedError` EKLENMEDI ve bu celiski DEGIL: kural AI hata tipleri
 * icindir; tedarikciyle ilgili bir sozlesmenin yeri BELGE moduludur.
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const SUPPLIERS_CALLER = 'suppliers';

@Module({
  imports: [AiObservabilityModule, ContextModule],
  controllers: [SupplierController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: SUPPLIER_REPOSITORY, useClass: DrizzleSupplierRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini gosterir
    // (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, SUPPLIERS_CALLER),
    },

    {
      provide: SupplierUseCases,
      inject: [
        SUPPLIER_REPOSITORY,
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
        repository: SupplierRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): SupplierUseCases =>
        new SupplierUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.suppliers.embeddingRateLimit,
          reindexBatchSize: config.suppliers.reindexBatchSize,
        }),
    },

    // --- Kurumsal hafizaya TEK KATKI (ADR-0040 §3) ---------------------------
    // Anlamsal: gorusme vektorleri. Kendi semasindan okur; birlestirmeyi
    // platform yapar.
    //
    // ⚠️ Yaninda bir yapisal katkici ARANMASIN — gerekce sinif yorumunda ve
    // katkicinin kendi dosyasinda.
    {
      provide: SupplierInteractionsContributor,
      inject: [SUPPLIER_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: SupplierRepository,
        transactionManager: TransactionManager,
      ): SupplierInteractionsContributor =>
        new SupplierInteractionsContributor(repository, transactionManager),
    },
  ],
})
export class SuppliersModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    interactionsContributor: SupplierInteractionsContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Adlar NITELENMIS (`supplier_contact`, `supplier_interaction`) ve bu kez
    // cakisma ONGORU DEGIL GERCEK: `contact:read` ve `interaction:read` CRM
    // tarafindan ZATEN kullaniliyor (ADR-0031 §6). Paylasmak SESSIZ BIR YETKI
    // GENISLEMESI, CRM'i yeniden adlandirmak BREAKING CHANGE olurdu.
    //
    // ⚠️ `supplier_interaction:write` ve `:delete` LISTEDE YOK: gunluk
    // EKLEME-YALNIZDIR (§1).
    permissions.register(SUPPLIERS_PERMISSIONS);

    // Ayni desen: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ TEK SATIR — ve bu satirin TEK olmasi ADR-0040'in merkezi karari.
    contributors.register(interactionsContributor);
  }
}
