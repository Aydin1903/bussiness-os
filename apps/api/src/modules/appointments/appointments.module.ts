import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { ContextModule } from '../../platform/context/context.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
import { AI_USAGE_RECORDER, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../../shared/embedding.port';
import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitRepository,
} from '../../shared/rate-limit.repository.port';
import { CrmModule } from '../crm/crm.module';
import { CRM_CONTACT_DIRECTORY, type ContactDirectory } from '../crm/crm.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from './application/appointment.repository.port';
import { AppointmentUseCases } from './application/appointment.use-cases';
import { AppointmentNotesContributor } from './infrastructure/appointment-notes.contributor';
import { AppointmentScheduleContributor } from './infrastructure/appointment-schedule.contributor';
import { DrizzleAppointmentRepository } from './infrastructure/drizzle-appointment.repository';
import { AppointmentController } from './presentation/appointment.controller';
import { APPOINTMENTS_PERMISSIONS } from './appointments.permissions';

/**
 * Randevu / Rezervasyon modulu — Faz 5'in DORDUNCU is modulu (ADR-0035).
 *
 * ============================================================================
 * SLICE 2: MODUL ILK KEZ BASKA BIR IS MODULUNU OKUYOR
 * ============================================================================
 * `CrmModule` IMPORT EDILIYOR. Yuzey `crm.public.ts`in YENI kalemidir
 * (`ContactDirectory`); CRM'in `domain/`, `application/`, `infrastructure/`
 * katmanlari `import/no-restricted-paths` ile ZATEN kapali.
 *
 * ⚠️ BAGIMLILIK GRAFIGINDE DORDUNCU KENAR — ve DAG kaliyor:
 *
 *     Projeler ──► CRM
 *     Finans   ──► CRM
 *     Finans   ──► Projeler
 *     Randevu  ──► CRM          ← bu slice
 *
 * Dort kenar, dongu YOK. CRM hicbirini bilmez.
 *
 * ⚠️ TERS YON YASAK: CRM'in kisi detayinda o kisinin randevularini gostermesi
 * bir modul dongusu kurar; cozum `forwardRef` DEGIL UCUNCU BIR MODULDUR —
 * projede bir kez yasandi (Tenant <-> Identity) ve cozumu `platform/session`
 * oldu. Yeni bir kenar eklenmeden ONCE dongu kontrol edilir.
 *
 * ⚠️ BU MODULUN CRM'E EKLETTIGI SEY YENI BIR DIZINDIR, yeni bir TALIP degil.
 * ADR-0034 §4 "`crm.public.ts` bu iste TEK SATIR degismez" demisti ve o
 * DOGRUYDU — cunku Finans da SIRKETE baglaniyordu. Randevu KISIYE baglanir ve
 * kisi dizini hic yazilmamisti. Kural: yeni TALIP -> dosya degismez, yeni
 * KAYNAK TURU -> sahibi modul kendi dizinini yazar.
 *
 * ============================================================================
 * SLICE 3: MODUL ILK KEZ AI'A DOKUNUYOR
 * ============================================================================
 * `EMBEDDING_PORT` artik SAGLANIYOR ve `service_note` yazma yolunda cagriliyor;
 * her cagri `event: "ai.call"` satiri birakiyor (`AiObservabilityModule`). Oran
 * siniri `platform.rate_limits` uzerinde tek kalem deklare ediyor — BESINCI
 * modulde de BESINCI bir sayac tablosu ACILMIYOR.
 *
 * ⚠️ BU MODULDE KAYIT BASINA EN FAZLA BIR EMBEDDING CAGRISI VAR (ADR-0035 §3 —
 * chunking yok, vektor ayni satirda). Onceki dort modulde uzun bir metin
 * onlarca cagri uretebiliyordu.
 *
 * ⚠️ SAYAC RANDEVU DEGIL EMBEDDING SAYAR: notsuz randevu — ki bu modulde COK
 * YAYGINDIR — paydan HIC dusmez. Kalem adinin `create_appointment` degil
 * `appointment_embedding` olmasinin sebebi budur.
 *
 * ✅ Filtreye `EmbeddingFailedError` + `RateLimitExceededError` +
 * `CompletionFailedError` ONCEDEN eklendi (Product Owner talimati, ADR-0035
 * §8). CRM'de bu ders DORT KEZ, her seferinde bir testin kirmizi yanmasiyla
 * ogrenilmisti; burada HICBIR TEST KIRMIZI YANMADAN eklendi.
 *
 * ⚠️ `LLM_PORT` SAGLANMIYOR ve bu bugun DOGRU: Randevu completion cagirmaz
 * (ADR-0035 §7 — modul ici AI yuzeyi v1'de yok). Filtre yine de
 * `CompletionFailedError`i yakaliyor; bedeller simetrik degil (bir satirlik olu
 * kod ile islenmemis bir 500).
 *
 * ============================================================================
 * SLICE 4: IKI KATKICI KAYDEDILDI — VE BES ANLAMSAL KAYNAK ESIGI ASILDI
 * ============================================================================
 * `POST /ask` artik Randevu icerigini de gorebiliyor: yapisal
 * (`appointment-schedule`) + anlamsal (`appointment-notes`).
 *
 * ⚠️ YAPISAL KATKICI RISKE GORE SKOR VERIR (0.95/0.90/0.75). Artik DORT yapisal
 * katkici ayni sekiz yuvali havuzu paylasiyor (3+5+3+3 = 14 > 8); sabit yuksek
 * skor, BES anlamsal kaynagin hicbirini iceri birakmazdi.
 *
 * ⚠️ IKI KATKICI AYNI TABLOYU OKUR — projede ILK KEZ. Ayrim tabloda degil
 * SORUDADIR ve `source` etiketleri AYRIDIR (`degradedSources` ve atif buna
 * dayanir).
 *
 * ⚠️ ADR-0034'UN TETIKLEYICISI BURADA CEKILIYOR: anlamsal kaynak sayisi BESE
 * cikti (`knowledge` · `crm-interactions` · `project-notes` ·
 * `finance-commentaries` · `appointment-notes`). Rerank v1'e ALINMADI ama borc
 * "ertelendi" degil, kapanis denetiminde OLCULMESI ZORUNLU bir kalem
 * (ADR-0035 §6.3).
 *
 * ⚠️ BU MODUL `POST /ask` IZIN FILTRESINI TETIKLEMEZ: iki katkicinin da kapisi
 * `appointment:read` ve dort rol de onu tasiyor (§9). Tetikci HALA yalnizca
 * Finans'tir.
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const APPOINTMENTS_CALLER = 'appointments';

@Module({
  imports: [AiObservabilityModule, ContextModule, CrmModule],
  controllers: [AppointmentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: APPOINTMENT_REPOSITORY, useClass: DrizzleAppointmentRepository },
    { provide: RATE_LIMIT_REPOSITORY, useClass: DrizzleRateLimitRepository },

    // Adapter SINIFLARI paylasilir, ORNEK modul basinadir: `caller` kurulusta
    // sabitlenir, boylece `ai.call` satirlari hangi modulun harcadigini
    // gosterir (ADR-0031 Slice 0.5).
    {
      provide: EMBEDDING_PORT,
      inject: [APP_CONFIG, AI_USAGE_RECORDER],
      useFactory: (config: AppConfig, recorder: AiUsageRecorder): EmbeddingPort =>
        createEmbeddingPort(config, recorder, APPOINTMENTS_CALLER),
    },

    {
      provide: AppointmentUseCases,
      inject: [
        APPOINTMENT_REPOSITORY,
        // ⚠️ CRM'in PUBLIC yuzeyi — repository DEGIL. Izin kapisi
        // (`contact:read`) dizinin ICINDEDIR; bu modul onu bilmez ve
        // bilmemelidir (ADR-0035 §4).
        CRM_CONTACT_DIRECTORY,
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
        repository: AppointmentRepository,
        contactDirectory: ContactDirectory,
        rateLimitRepository: RateLimitRepository,
        embeddingPort: EmbeddingPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): AppointmentUseCases =>
        new AppointmentUseCases({
          repository,
          contactDirectory,
          rateLimitRepository,
          embeddingPort,
          transactionManager,
          idGenerator,
          clock,
          rateLimit: config.appointments.embeddingRateLimit,
          reindexBatchSize: config.appointments.reindexBatchSize,
        }),
    },
    // --- Kurumsal hafizaya IKI KATKI (ADR-0035 §6) ---------------------------
    // Yapisal: takvim + gelmedi orani anlik goruntusu. Anlamsal: servis notu
    // vektorleri. Ikisi de KENDI semasindan okur; birlestirmeyi platform yapar.
    {
      provide: AppointmentScheduleContributor,
      inject: [APPOINTMENT_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        repository: AppointmentRepository,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): AppointmentScheduleContributor =>
        new AppointmentScheduleContributor(
          repository,
          transactionManager,
          clock,
          config.appointments.noShowAlertRate,
        ),
    },
    {
      provide: AppointmentNotesContributor,
      inject: [APPOINTMENT_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: AppointmentRepository,
        transactionManager: TransactionManager,
      ): AppointmentNotesContributor =>
        new AppointmentNotesContributor(repository, transactionManager),
    },
  ],
})
export class AppointmentsModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    scheduleContributor: AppointmentScheduleContributor,
    notesContributor: AppointmentNotesContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Katalog GENISTIR (dort rol de okur) — Finans'in dar katalogundan
    // bilincli sapma. Gerekce `appointments.permissions.ts`'te: bir randevu
    // takvimi PAYLASILAN bir is gercegidir.
    permissions.register(APPOINTMENTS_PERMISSIONS);

    // Ayni desen, ikinci defter: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ Bu iki satirla `POST /ask` ilk kez ZAMANI GELECEGE DOGRU okuyabiliyor:
    // onceki dort modul gecmise bakiyordu (olan gorusme, yazilan not,
    // gerceklesen odeme). "Yarin kim geliyor" sorusunun cevabi bugune kadar
    // HICBIR modulde yoktu.
    contributors.register(scheduleContributor);
    contributors.register(notesContributor);
  }
}
