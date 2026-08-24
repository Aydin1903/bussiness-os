import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { AUDIT_RECORDER } from '../../shared/audit.port';
import { CLOCK } from '../../shared/clock.port';
import { ID_GENERATOR } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../authz/authz.public';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from './application/audit-log.repository.port';
import { ListAuditEntriesUseCase } from './application/list-audit-entries.use-case';
import { AUDIT_PERMISSIONS } from './audit.permissions';
import { DrizzleAuditLogRepository } from './infrastructure/drizzle-audit-log.repository';
import { DrizzleAuditRecorder } from './infrastructure/drizzle-audit-recorder';
import { AuditController } from './presentation/audit.controller';

/**
 * Audit — ARCHITECTURE §6.2'nin platform zincirinin DORDUNCU halkasi
 * (Tenant -> Identity -> Authorization -> AUDIT). ADR-0043 §6, kalem A.
 *
 * ============================================================================
 * ⚠️ UC KEZ ERTELENMIS BIR BORCUN KAPANISI
 * ============================================================================
 * ADR-0034 §8 (Finans) borcu GERCEK yapti ve tetikleyiciyi 8. module yazdi;
 * ADR-0039 ve ADR-0040 kendi paylarini acik biraktilar; ADR-0041 §8 borcu
 * KUCULTEREK erteledi ve son cumlesini yazdi:
 *
 *     "⚠️ Ucuncu kez ertelenirse borc artik bir erteleme degil, BIR KARAR olur."
 *
 * IK modulunde borc yalnizca teknik degil HUKUKIDIR (KVKK hesap verebilirlik),
 * bu yuzden ertelenmedi.
 *
 * ⚠️ Ama borcun EN HASSAS kismi burada DEGIL cozuluyor: _"maasi kim, ne zaman
 * degistirdi"_ sorusunu `hr.compensation_records` ekleme-yalniz defterinin
 * KENDISI cevapliyor (ADR-0043 §6.2) — ADR-0039'un dersi: bir seyi
 * DEGISTIRILEMEZ yapmak, "kim degistirdi"yi CEVAPLAMAKTAN ucuzdur.
 * Bu modul, o defterle kapanmayan kismi (mutable `hr.employees`) ustlenir.
 *
 * ============================================================================
 * PLATFORM MEKANIZMAYI SAHIPLENIR, MODUL DEKLARE EDER — UCUNCU KEZ
 * ============================================================================
 * ADR-0025'in `PermissionRegistry`si ve ADR-0031'in `RetrievalContributor`u ile
 * ayni disiplin: platform, `hr.employee` ya da `finance.transaction`in NE
 * OLDUGUNU bilmez — yalnizca "hangi kaynak, hangi fiil, hangi alan adi"
 * uclusunu saklar. Bu modul HICBIR is modulunu import etmez.
 *
 * ============================================================================
 * ⚠️ YAZMA YETENEGI MODUL UZERINDEN VERILIR, SINIF DAGITILARAK DEGIL
 * ============================================================================
 * `AUDIT_RECORDER` burada `exports`tadir; tuketen modul `imports: [AuditModule]`
 * yazar. Bu, `SystemClock`/`UuidV7IdGenerator` gibi adapter SINIFLARININ her
 * modulde ayri ayri saglanmasi deseninden BILINCLI bir sapmadir:
 *
 *   * `SystemClock` SAF bir adapter'dir — kendi tablosu yoktur, kim ornek
 *     olusturursa olustursun sonuc aynidir.
 *   * ⚠️ `DrizzleAuditRecorder` BIR TABLONUN TEK YAZARIDIR. Sinifi dagitmak,
 *     `platform.audit_log`a yazan yollarin sayisini gorunmez kilardi.
 *
 * Emsal `ContextModule`dur: o da registry'sini modul uzerinden acar. Yan
 * fayda: modul izolasyonu lint'i (`import/no-restricted-paths`) is
 * modullerinin `platform/audit/infrastructure/**` altina uzanmasini ZATEN
 * reddeder — yani tek mesru yol budur.
 *
 * ⚠️ Bu, IK icin bir kenar uretir (`hr -> platform/audit`) ama IS MODULU
 * kenari DEGILDIR: ADR-0033'un `task.use-cases.ts`te yazdigi ayrim gecerlidir
 * — platform zinciri zaten her modulun altinda durur. Is modulleri arasindaki
 * kenar sayisi YEDIDE kalir.
 * ============================================================================
 */
@Module({
  controllers: [AuditController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: AUDIT_LOG_REPOSITORY, useClass: DrizzleAuditLogRepository },
    { provide: AUDIT_RECORDER, useClass: DrizzleAuditRecorder },
    {
      provide: ListAuditEntriesUseCase,
      inject: [AUDIT_LOG_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: AuditLogRepository,
        transactionManager: TransactionManager,
      ): ListAuditEntriesUseCase => new ListAuditEntriesUseCase({ repository, transactionManager }),
    },
  ],
  exports: [AUDIT_RECORDER],
})
export class AuditModule {
  constructor(@Inject(PERMISSION_REGISTRY) registry: PermissionRegistry) {
    registry.register(AUDIT_PERMISSIONS);
  }
}
