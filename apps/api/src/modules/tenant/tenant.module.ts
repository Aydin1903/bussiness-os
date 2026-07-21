import { Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { OutboxEventPublisher } from '../../infrastructure/events/outbox-event-publisher.adapter';
import { CURRENT_USER_PROVIDER } from '../../shared/current-user.port';
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
import { TemporaryDenyProvisioningPolicy } from './infrastructure/temporary-deny-provisioning.policy';
import { UnavailableCurrentUserProvider } from './infrastructure/unavailable-current-user.adapter';
import { TenantController } from './presentation/tenant.controller';

/**
 * Tenant modulu — platform cekirdeginin ilk halkasi (ARCHITECTURE 6.2).
 *
 * Modul artik app.module.ts'e BAGLIDIR ve POST /api/v1/tenants uc noktasini
 * sunar. Ancak uc nokta BUGUN HER ISTEGE 503 doner:
 *
 *   - CurrentUserProvider: kullanici kimligi yalnizca dogrulanmis token'dan
 *     gelebilir (ADR-0004); Identity modulu Faz 3.
 *   - TenantProvisioningPolicy: ADR-0016'nin emailVerified onkosulu ayni
 *     modulu bekliyor.
 *
 * Ikisi de ACIKCA reddeder. "Her zaman izin ver" diyen sahte implementasyonlar
 * KONMADI: konsaydi her sey saglikli GORUNUR, ADR-0016'nin onkosulu sessizce
 * devre disi kalir ve dogrulanmamis e-postayla tenant acilabilirdi. Kapali
 * oldugunu soyleyen bir ozellik, sessizce yanlis calisan bir ozellikten iyidir.
 *
 * Bu iki saglayici Identity geldiginde DEGISTIRILECEK — genisletilmeyecek.
 */
@Module({
  controllers: [TenantController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: DrizzleMembershipRepository },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxEventPublisher },

    // GECICI saglayicilar — ikisi de acikca REDDEDER, sessizce izin VERMEZ.
    // Identity modulu (Faz 3) geldiginde gercekleriyle DEGISTIRILECEKLER.
    { provide: TENANT_PROVISIONING_POLICY, useClass: TemporaryDenyProvisioningPolicy },
    { provide: CURRENT_USER_PROVIDER, useClass: UnavailableCurrentUserProvider },
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
