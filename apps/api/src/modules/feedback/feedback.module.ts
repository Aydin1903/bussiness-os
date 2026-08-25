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
import { CRM_CONTACT_DIRECTORY, type ContactDirectory } from '../crm/crm.public';
import {
  FEEDBACK_REPOSITORY,
  type FeedbackRepository,
} from './application/feedback.repository.port';
import { FeedbackUseCases } from './application/feedback.use-cases';
import { FEEDBACK_PERMISSIONS } from './feedback.permissions';
import { DrizzleFeedbackRepository } from './infrastructure/drizzle-feedback.repository';
import { FeedbackCommentsContributor } from './infrastructure/feedback-comments.contributor';
import { FeedbackController } from './presentation/feedback.controller';

/**
 * Musteri Geri Bildirimi / Anket — Faz 5'in ONUNCU is modulu (ADR-0045).
 *
 * ROADMAP §3.5: _"Yanit toplama"_.
 *
 * ============================================================================
 * ⚠️ TEK KENAR: `Geri Bildirim -> CRM` — VE `crm.public.ts` TEK SATIR DEGISMEZ
 * ============================================================================
 * Gereken dizin (`ContactDirectory.findNames(ids, role)`) ZATEN VAR: Randevu
 * yazdi (ADR-0035 §2), Belge ve Teklif/Fatura kullandi. ADR-0037 §4.1'in
 * kurali — _"yeni TALIP -> dosya degismez; yeni KAYNAK TURU -> sahibi modul
 * kendi dizinini yazar"_ — UCUNCU kez talip tarafindan dogrulaniyor.
 *
 * Olculebilir sonucu: cross-modul icin AYRI BIR SLICE GEREKMEDI.
 *
 * ⚠️ Bagimlilik grafigi YEDIDEN SEKIZE cikiyor ve HALA DAG. Dongusuzluk
 * IDDIA EDILMIYOR, GOSTERILIYOR:
 *
 *   - CRM bir KOK DUGUMDUR: `crm/` altinda baska hicbir IS MODULUNUN
 *     `public.ts`ine import YOKTUR (yalnizca `platform/authz` ve
 *     `platform/context` — ikisi de platform, is modulu degil).
 *   - ⚠️ Geri Bildirim bir YAPRAKTIR: `feedback.public.ts` ACILMAZ (ADR-0035'in
 *     kurali: TALIP YOKKEN DIZIN YAZILMAZ). Modulden CIKAN tek kenar CRM'edir,
 *     GIREN kenar YOKTUR.
 *   - Bir yaprak dugumden bir kok dugume cikan tek yonlu kenar DONGU KURAMAZ.
 *
 *     katman 0: CRM · INVENTORY · SUPPLIERS · HR   (kokler)
 *     katman 1: Projeler ──► CRM
 *     katman 2: Finans ──► CRM, Projeler · Randevu ──► CRM ·
 *               Belge ──► CRM, Projeler · Teklif/Fatura ──► CRM ·
 *               ⚠️ GERI BILDIRIM ──► CRM
 *
 * ⚠️ TERS YON (CRM -> Geri Bildirim) HICBIR KOSULDA yazilmaz — Tenant <->
 * Identity tuzagi (cozumu `forwardRef` degil UCUNCU BIR MODULDU).
 *
 * ============================================================================
 * ⚠️ TEK KATKICI — ANLAMSAL. YAPISAL ADAY LIYAKATLI AMA ASKIDA (§3)
 * ============================================================================
 * `POST /ask` artik musteri yorumlarini da gorebiliyor (`feedback-comments`).
 * ⚠️ Yaninda bir yapisal katkici YOKTUR — ve gerekce ADR-0040 / ADR-0043'ten
 * FARKLIDIR: orada adaylar LIYAKATSIZDI ("bakildi ve yoktu"), burada aday
 * LIYAKATLI ("bakildi, VAR, ve tek basina eklenemez").
 *
 * Sayilar:
 *
 *     anlamsal kaynak   8 -> 9   (`feedback-comments`)
 *     YAPISAL kaynak    6 -> 6   ⚠️ DEGISMIYOR
 *     ADR-0042 T2 esigi   6      ⚠️ GECILMIYOR (gecmek 7 gerektirir)
 *     fan-out          14 -> 15
 *     global top-K         8     (degismedi)
 *     yapisal taban        3     (`ceil(K/3)` — degismedi)
 *
 * ⚠️ Eklenmemesinin ASIL sebebi USULDUR: T2 KAYITLI kaynaklari degil SATIR
 * DONDURENLERI sayar ve o sayiyi uretecek arac BUGUN YOKTUR (ADR-0043'un
 * kapanis denetimi ADR-0042 §4'un protokolunu uygulayamadi). ADR-0042'nin
 * ilkesinin aynasi: _"bir esik, onu OLCECEK ARAC YOKKEN gecilmez."_
 *
 * ⚠️ Anlamsal tarafta baski ARTIYOR: BES serbest yuva icin artik DOKUZ kaynak
 * yarisiyor. Bazi kaynaklarin sifir almasi ADR-0036'nin YAZILI BEKLENTISIDIR —
 * anlamsal kaynaklar arasinda TABAN YOKTUR, eleme LIYAKATTIR.
 *
 * ============================================================================
 * ✅ FILTREYE AI HATA TIPLERI ONCEDEN EKLENDI
 * ============================================================================
 * `EmbeddingFailedError` + `RateLimitExceededError` + `CompletionFailedError`
 * — Product Owner'in KALICI STANDARDI, ONBIRINCI kez. ⚠️ Onceki iki modulden
 * (Teklif/Fatura, IK) farki: ILK IKISI GERCEKTEN TETIKLENEBILIR. `LLM_PORT`
 * SAGLANMIYOR ve bu bugun dogru — modul ici AI yuzeyi v1'de yok.
 *
 * ⚠️ `StorageFailedError` EKLENMEDI: kural AI hata tipleri icindir; bir geri
 * bildirime dosya eklemek diye bir kavram yoktur.
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const FEEDBACK_CALLER = 'feedback';

@Module({
  // ⚠️ `CrmModule` — bu modulun TEK is-modulu bagimliligi. `CRM_CONTACT_DIRECTORY`
  // token'i oradan gelir ve izin kapisi (`contact:read`) ARAYUZUN ICINDEDIR.
  imports: [AiObservabilityModule, ContextModule, CrmModule],
  controllers: [FeedbackController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: FEEDBACK_REPOSITORY, useClass: DrizzleFeedbackRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini gosterir
    // (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, FEEDBACK_CALLER),
    },

    {
      provide: FeedbackUseCases,
      inject: [
        FEEDBACK_REPOSITORY,
        RATE_LIMIT_REPOSITORY,
        EMBEDDING_PORT,
        CRM_CONTACT_DIRECTORY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: FeedbackRepository,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        contactDirectory: ContactDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): FeedbackUseCases =>
        new FeedbackUseCases({
          repository,
          rateLimitRepository,
          embeddingPort,
          contactDirectory,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.feedback.embeddingRateLimit,
          reindexBatchSize: config.feedback.reindexBatchSize,
        }),
    },

    // --- Kurumsal hafizaya TEK KATKI (ADR-0045 §3.1) -------------------------
    // Anlamsal: yorum vektorleri. Kendi semasindan okur; birlestirmeyi platform
    // yapar.
    //
    // ⚠️ Yaninda bir yapisal katkici ARANMASIN — gerekce sinif yorumunda ve
    // katkicinin kendi dosyasinda.
    {
      provide: FeedbackCommentsContributor,
      inject: [FEEDBACK_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: FeedbackRepository,
        transactionManager: TransactionManager,
      ): FeedbackCommentsContributor =>
        new FeedbackCommentsContributor(repository, transactionManager),
    },
  ],
})
export class FeedbackModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    commentsContributor: FeedbackCommentsContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ `feedback:write` LISTEDE YOK ve bu, §2'nin izin adinda gorunur
    // halidir: kayit GUNCELLENMEZ. Katalogda `create` ve `delete` var.
    //
    // ⚠️ `delete` VAR ve gerekcesi KVKK'dir (§2.2) — `supplier_interaction`da
    // YOKTU. Silme bir KOLAYLIK degil bir YUKUMLULUKTUR.
    permissions.register(FEEDBACK_PERMISSIONS);

    // Ayni desen: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ TEK SATIR — ve bu satirin TEK olmasi ADR-0045'in merkezi karari (§3.4).
    contributors.register(commentsContributor);
  }
}
