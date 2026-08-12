import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { AiObservabilityModule } from '../../infrastructure/ai/ai-observability.module';
import { createEmbeddingPort } from '../../infrastructure/ai/ai-provider.factory';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleRateLimitRepository } from '../../infrastructure/rate-limit/drizzle-rate-limit.repository';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
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
 * ⚠️ KALAN BAGIMLILIK:
 *
 *   Slice 4 -> `ContextModule` (iki `RetrievalContributor`, §6)
 */
/** AI maliyet kaydinda bu modulun etiketi (ROADMAP §8.1). */
const APPOINTMENTS_CALLER = 'appointments';

@Module({
  imports: [AiObservabilityModule, CrmModule],
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
  ],
})
export class AppointmentsModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Katalog GENISTIR (dort rol de okur) — Finans'in dar katalogundan
    // bilincli sapma. Gerekce `appointments.permissions.ts`'te: bir randevu
    // takvimi PAYLASILAN bir is gercegidir.
    permissions.register(APPOINTMENTS_PERMISSIONS);
  }
}
