import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { AuditModule } from '../../platform/audit/audit.module';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { AUDIT_RECORDER, type AuditRecorder } from '../../shared/audit.port';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { TenantModule } from '../tenant/tenant.module';
import { TENANT_ACCESS_QUERY, type TenantAccessQuery } from '../tenant/tenant.public';
import { HR_REPOSITORY, type HrRepository } from './application/hr.repository.port';
import { HrUseCases } from './application/hr.use-cases';
import { HR_PERMISSIONS } from './hr.permissions';
import { DrizzleHrRepository } from './infrastructure/drizzle-hr.repository';
import { HrController } from './presentation/hr.controller';

/**
 * IK / Personel — Faz 5'in DOKUZUNCU is modulu (ADR-0043).
 *
 * ============================================================================
 * ⚠️ `ContextModule` IMPORT EDILMIYOR — VE BU MODULUN EN ONEMLI OZELLIGI BU
 * ============================================================================
 * Sekiz is modulunun sekizi de `ContextModule`u import edip en az bir
 * `RetrievalContributor` kaydediyor. IK **SIFIR** kaydeder: `imports`
 * listesinde `ContextModule` YOKTUR ve olmayacaktir (§5).
 *
 * Uc gerekce ayni yere cikar:
 *   1. Anlatisal icerik YOK — serbest not alani bilincli olarak acilmadi
 *      (§1.1). `fullName` + `jobTitle` bir KAYITTIR, bir anlati degil.
 *   2. Bir ekip listesi KATALOGDUR, olgu degil (ADR-0040 §3'un olcutu):
 *      "12 aktif calisan" bir SAYIMDIR ve her cevapta bir taban yuvasi
 *      ISGAL EDERDI.
 *   3. ⚠️ Ve bu bir GUVENLIK katmanidir (§4.2 katman 3): maasin `/ask` yoluna
 *      sizmasi icin once BIR KATKICI YAZILMASI gerekir — yani hata SESSIZ
 *      OLAMAZ, bir dosya acilmasi gerekir. Bir entegrasyon testi
 *      (`context-contributors`) `hr` onekli hicbir kaynak olmadigini
 *      DOGRUDAN sorgular.
 *
 * ⚠️ ADR-0042 bunu ISMEN ongormustu ("9. modul IK bir yapisal katkici eklerse
 * T2 HEMEN atesler") ve ongoru TERS YONDE gerceklesti: eklenmedi, T2 kapali
 * kaldi ve yapisal kaynak sayisi 6'da durdu.
 *
 * ============================================================================
 * ⚠️ IKI PLATFORM BAGIMLILIGI — IKISI DE IS MODULU KENARI DEGIL
 * ============================================================================
 *   `TenantModule` -> `platform_user_id` dogrulamasi (`resolveMemberAccess`).
 *                     ADR-0033'un `task.use-cases.ts`te yazdigi ayrim:
 *                     Tenant PLATFORM ZINCIRININ ILK HALKASIDIR.
 *   `AuditModule`  -> ⚠️ Slice 1'de acilan mekanizmanin ILK TUKETICISI (§6).
 *
 * ⚠️ Bu yuzden IS MODULLERI arasindaki kenar sayisi YEDIDE KALIR ve grafik
 * hala DAG. IK, CRM ve Stok gibi bir KOK DUGUMDUR: hicbir is moduluna bakmaz.
 *
 * ⚠️ `AUDIT_RECORDER` sinif olarak DEGIL, MODUL uzerinden aliniyor: o adapter
 * `platform.audit_log`in TEK YAZARIDIR ve modul izolasyonu lint'i
 * (`import/no-restricted-paths`) zaten `platform/audit/infrastructure/**`
 * altina uzanmayi reddeder.
 *
 * ============================================================================
 * ⚠️ ORAN SINIRI YOK, EMBEDDING YOK
 * ============================================================================
 * `RATE_LIMIT_REPOSITORY` ve `EMBEDDING_PORT` saglanmiyor cunku bu modul
 * hicbir AI cagrisi yapmaz. ⚠️ Yine de exception filter uc AI hata tipini
 * BASTAN tasir (CLAUDE.md kalici standardi) — ADR-0041'den sonra IKINCI kez
 * tumuyle tetiklenemez bir modulde.
 */
@Module({
  imports: [TenantModule, AuditModule],
  controllers: [HrController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: HR_REPOSITORY, useClass: DrizzleHrRepository },
    {
      provide: HrUseCases,
      inject: [
        HR_REPOSITORY,
        TENANT_ACCESS_QUERY,
        AUDIT_RECORDER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        repository: HrRepository,
        tenantAccess: TenantAccessQuery,
        auditRecorder: AuditRecorder,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): HrUseCases =>
        new HrUseCases({
          repository,
          tenantAccess,
          auditRecorder,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
  ],
})
export class HrModule {
  constructor(@Inject(PERMISSION_REGISTRY) registry: PermissionRegistry) {
    registry.register(HR_PERMISSIONS);
  }
}
