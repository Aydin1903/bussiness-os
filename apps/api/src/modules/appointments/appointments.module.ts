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
 * SLICE 1: BU MODUL BUGUN HICBIR SEYE BAGIMLI DEGIL
 * ============================================================================
 * `imports` BOS ve bu, dort modulluk desenin ise yaradiginin en somut olcusudur.
 * Karsilastirma:
 *
 *   CRM Slice 1      -> `imports: []`  (ama Faz 4'un platform kodunu TASIDI)
 *   Projeler Slice 1 -> `imports: []`
 *   Finans Slice 1   -> `imports: []`
 *   Randevu Slice 1  -> `imports: []`  ← ve TEK BIR PLATFORM DOSYASI DEGISMEDI
 *
 * ⚠️ UC BAGIMLILIK SONRAKI SLICE'LARDA GELIR ve ucu de ADR'de yazili:
 *
 *   Slice 2 -> `CrmModule` (`ContactDirectory` — cross-modul referans, §4)
 *   Slice 3 -> `AiObservabilityModule` + `EMBEDDING_PORT` + oran siniri (§3)
 *   Slice 4 -> `ContextModule` (iki `RetrievalContributor`, §6)
 *
 * ⚠️ SLICE 2'DE ACILACAK KENAR `Randevu -> CRM`TIR ve grafik DAG kalir:
 *
 *     Projeler ──► CRM
 *     Finans   ──► CRM
 *     Finans   ──► Projeler
 *     Randevu  ──► CRM          (Slice 2)
 *
 * Ters yon (CRM'in kisi detayinda o kisinin randevularini gostermesi) bir modul
 * dongusu kurar; cozum `forwardRef` DEGIL UCUNCU BIR MODULDUR — projede bir kez
 * yasandi (Tenant <-> Identity) ve cozumu `platform/session` oldu.
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
  controllers: [AppointmentController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: APPOINTMENT_REPOSITORY, useClass: DrizzleAppointmentRepository },

    {
      provide: AppointmentUseCases,
      inject: [APPOINTMENT_REPOSITORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: AppointmentRepository,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): AppointmentUseCases =>
        new AppointmentUseCases({ repository, transactionManager, idGenerator, clock }),
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
