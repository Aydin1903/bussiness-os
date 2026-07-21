import { Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { OutboxEventPublisher } from '../../infrastructure/events/outbox-event-publisher.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../shared/domain-event-publisher.port';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from './application/membership.repository.port';
import { ProvisionTenantUseCase } from './application/provision-tenant.use-case';
import {
  TENANT_PROVISIONING_POLICY,
  type TenantProvisioningPolicy,
} from './application/tenant-provisioning-policy.port';
import { TENANT_REPOSITORY, type TenantRepository } from './application/tenant.repository.port';
import { DrizzleMembershipRepository } from './infrastructure/drizzle-membership.repository';
import { DrizzleTenantRepository } from './infrastructure/drizzle-tenant.repository';

/**
 * Tenant modulu — platform cekirdeginin ilk halkasi (ARCHITECTURE 6.2).
 *
 * ============================================================================
 * BU MODUL HENUZ app.module.ts'e BAGLI DEGILDIR — BILINCLI
 * ============================================================================
 * HTTP yuzeyi (controller, DTO, Zod semalari) ve tenant context middleware'i
 * henuz yazilmadi. Modulu simdiden koke baglamak hicbir sey kazandirmaz ama
 * baglanamayan bir provider varsa uygulama acilisini dusurur. Baglama, ilk
 * dikey dilimle (POST /api/v1/tenants) birlikte yapilacaktir.
 *
 * Modul yine de BUGUN yazildi: wiring'in dogru oldugunu entegrasyon testleri
 * kaniti ile bilmek, controller yazarken tahmin etmekten iyidir.
 * ============================================================================
 *
 * EKSIK TEK SAGLAYICI: TenantProvisioningPolicy — ADR-0016'nin emailVerified
 * onkosulu Identity modulunu (Faz 3) gerektirir. O gelene kadar bu modul TEK
 * BASINA ayaga kalkmaz.
 *
 * "Her zaman izin ver" diyen bir sahte implementasyon KONMADI. Konsaydi modul
 * ayaga kalkar ama ADR-0016'nin onkosulu SESSIZCE devre disi kalirdi —
 * dogrulanmamis e-postayla tenant acilabilirdi ve bunu fark ettirecek hicbir
 * sey olmazdi. Ayaga kalkmayan bir modul, sessizce yanlis calisan bir modulden
 * iyidir.
 */
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: DrizzleMembershipRepository },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxEventPublisher },
    {
      provide: ProvisionTenantUseCase,
      // Use case saf TypeScript'tir — @Injectable() TASIMAZ ve NestJS'i bilmez
      // (ARCHITECTURE 4). Bagimliliklari burada, factory ile verilir; boylece
      // application katmani framework'e bagimli hale gelmez.
      inject: [
        TENANT_REPOSITORY,
        MEMBERSHIP_REPOSITORY,
        TENANT_PROVISIONING_POLICY,
        DOMAIN_EVENT_PUBLISHER,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle BIREBIR eslesmek
      // zorundadir; bagimliliklari tek bir objede toplamak framework
      // sozlesmesi geregi mumkun degil. Use case'in KENDI imzasi zaten tek
      // parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        tenantRepository: TenantRepository,
        membershipRepository: MembershipRepository,
        provisioningPolicy: TenantProvisioningPolicy,
        eventPublisher: DomainEventPublisher,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): ProvisionTenantUseCase =>
        new ProvisionTenantUseCase({
          tenantRepository,
          membershipRepository,
          provisioningPolicy,
          eventPublisher,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
  ],
  exports: [ProvisionTenantUseCase, TENANT_REPOSITORY, MEMBERSHIP_REPOSITORY],
})
export class TenantModule {}
