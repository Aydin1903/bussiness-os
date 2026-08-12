import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
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
 * ⚠️ KALAN IKI BAGIMLILIK SONRAKI SLICE'LARDA:
 *
 *   Slice 3 -> `AiObservabilityModule` + `EMBEDDING_PORT` + oran siniri (§3)
 *   Slice 4 -> `ContextModule` (iki `RetrievalContributor`, §6)
 *
 * ============================================================================
 * ⚠️ `EMBEDDING_PORT` SAGLANMIYOR VE FILTREDE AI HATASI YOK — bugun DOGRU
 * ============================================================================
 * Modul henuz hicbir port kullanmiyor; var olmayan bir bagimliligin hatasini
 * yakalamak yuzeyi gereksizce genisletirdi (Finans'in Slice 1-4 boyunca
 * uyguladigi ayni disiplin). TETIKLEYICI acikca yazildi:
 * `appointments-domain-exception.filter.ts` Slice 3'te eklenecek UC satiri
 * adiyla listeliyor.
 */
@Module({
  imports: [CrmModule],
  controllers: [AppointmentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: APPOINTMENT_REPOSITORY, useClass: DrizzleAppointmentRepository },

    {
      provide: AppointmentUseCases,
      inject: [
        APPOINTMENT_REPOSITORY,
        // ⚠️ CRM'in PUBLIC yuzeyi — repository DEGIL. Izin kapisi
        // (`contact:read`) dizinin ICINDEDIR; bu modul onu bilmez ve
        // bilmemelidir (ADR-0035 §4).
        CRM_CONTACT_DIRECTORY,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: AppointmentRepository,
        contactDirectory: ContactDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): AppointmentUseCases =>
        new AppointmentUseCases({
          repository,
          contactDirectory,
          transactionManager,
          idGenerator,
          clock,
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
