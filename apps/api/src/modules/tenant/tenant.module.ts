import { Inject, Module } from '@nestjs/common';

import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
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
import { ListUserMembershipsQuery } from './application/list-user-memberships.query';
import { ProvisionTenantUseCase } from './application/provision-tenant.use-case';
import { ResolveTenantAccessQuery } from './application/resolve-tenant-access.query';
import {
  TENANT_PROVISIONING_POLICY,
  type TenantProvisioningPolicy,
} from './application/tenant-provisioning-policy.port';
import { TENANT_REPOSITORY, type TenantRepository } from './application/tenant.repository.port';
import { ListMembershipsUseCase } from './application/list-memberships.use-case';
import {
  TENANT_ACCESS_QUERY,
  USER_MEMBERSHIPS_QUERY,
  type TenantAccessQuery,
  type UserMembershipsQuery,
} from './tenant.public';
import { TENANT_PERMISSIONS } from './tenant.permissions';
import { tenantOutboxProviders } from './tenant-outbox.providers';
import { DrizzleMembershipRepository } from './infrastructure/drizzle-membership.repository';
import { DrizzleTenantRepository } from './infrastructure/drizzle-tenant.repository';
import { ContextCurrentUserProvider } from '../../infrastructure/auth/context-current-user.adapter';
import { EmailVerifiedProvisioningPolicy } from './infrastructure/email-verified-provisioning.policy';
import { IdentityModule } from '../identity/identity.module';
import { IDENTITY_USER_QUERY, type IdentityUserQuery } from '../identity/identity.public';
import { MembershipController } from './presentation/membership.controller';
import { TenantController } from './presentation/tenant.controller';

/**
 * Tenant modulu — platform cekirdeginin ilk halkasi (ARCHITECTURE 6.2).
 *
 * `POST /api/v1/tenants` ARTIK CALISIR: Faz 2'nin iki gecici "reddet" kapisi
 * Identity ile degistirildi (genisletilmedi):
 *
 *   - `CurrentUserProvider` -> `ContextCurrentUserProvider`: kimlik, auth
 *     middleware'inin dogruladigi token'dan gelen istek baglamindan okunur.
 *   - `TenantProvisioningPolicy` -> `EmailVerifiedProvisioningPolicy`:
 *     ADR-0016'nin `emailVerified` onkosulu Identity'nin public interface'i
 *     uzerinden dogrulanir.
 *
 * O kapilar bilincli olarak "sessizce izin veren" sahte implementasyonlar
 * DEGILDI; ikisi de acikca reddediyordu ve yazili silinme kosullari gerceklesti.
 */
@Module({
  // Tenant -> Identity bagimliligi yalnizca ADR-0016 onkosulu (emailVerified)
  // icindir. switch-tenant'in ters yonde (Identity -> Tenant) bir kenar YARATIP
  // dongu olusturma riski, o akisi Identity'ye DEGIL ucuncu bir module
  // (`platform/session`) koyarak cozuldu: Session hem Identity hem Tenant'i
  // PUBLIC arayuzlerinden tuketir, ikisi de digerini import etmez. Graf DAG
  // kalir; `forwardRef` gerekmedi. Dolayisiyla bu binding YERINDE kaliyor.
  imports: [IdentityModule],
  controllers: [TenantController, MembershipController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: MEMBERSHIP_REPOSITORY, useClass: DrizzleMembershipRepository },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxEventPublisher },

    // Faz 2'nin iki GECICI "reddet" kapisi Identity ile DEGISTIRILDI.
    //
    // Kimlik artik dogrulanmis token'dan gelir (istek baglami uzerinden), onkosul
    // ise Identity'nin public interface'i uzerinden dogrulanir. Ikisi de
    // genisletilmedi, YERINE KONDU.
    { provide: CURRENT_USER_PROVIDER, useClass: ContextCurrentUserProvider },
    {
      provide: TENANT_PROVISIONING_POLICY,
      inject: [IDENTITY_USER_QUERY],
      useFactory: (users: IdentityUserQuery): TenantProvisioningPolicy =>
        new EmailVerifiedProvisioningPolicy(users),
    },
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
    {
      // Tenant modulunun Identity'ye actigi erisim sorgusu (tenant.public.ts).
      // ProvisionTenantUseCase ile ayni desen: saf TypeScript, bagimliliklari
      // burada factory ile verilir (ARCHITECTURE 4).
      provide: TENANT_ACCESS_QUERY,
      inject: [TENANT_REPOSITORY, MEMBERSHIP_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        tenantRepository: TenantRepository,
        membershipRepository: MembershipRepository,
        transactionManager: TransactionManager,
      ): TenantAccessQuery =>
        new ResolveTenantAccessQuery({
          tenantRepository,
          membershipRepository,
          transactionManager,
        }),
    },
    {
      // Ilk RBAC korumali uc noktanin use case'i (ADR-0025). Saf TypeScript.
      provide: ListMembershipsUseCase,
      inject: [MEMBERSHIP_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        membershipRepository: MembershipRepository,
        transactionManager: TransactionManager,
      ): ListMembershipsUseCase =>
        new ListMembershipsUseCase({ membershipRepository, transactionManager }),
    },
    {
      // "Hangi tenant'lara uyeyim" sorgusu (ADR-0028). Session modulu bunu
      // token ile enjekte eder (GET /me/memberships). Saf TypeScript.
      provide: USER_MEMBERSHIPS_QUERY,
      inject: [MEMBERSHIP_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        membershipRepository: MembershipRepository,
        transactionManager: TransactionManager,
      ): UserMembershipsQuery =>
        new ListUserMembershipsQuery({ membershipRepository, transactionManager }),
    },

    // --- Outbox tuketim yolu ve zamanlayicisi (ADR-0006) --------------------
    // Ayri dosyada: burasi HTTP istegine hizmet eden bagimliliklari tutar,
    // orasi arka plan surecininkileri (Identity ile ayni ayrim).
    ...tenantOutboxProviders,
  ],
  // TENANT_ACCESS_QUERY disa acilir: Identity modulu (Faz 3) bunu token ile
  // enjekte eder. Somut sinif DEGIL, token export edilir — tuketen taraf
  // tenant.public.ts'teki arayuze baglanir, implementasyona degil.
  exports: [
    ProvisionTenantUseCase,
    TENANT_REPOSITORY,
    MEMBERSHIP_REPOSITORY,
    TENANT_ACCESS_QUERY,
    USER_MEMBERSHIPS_QUERY,
  ],
})
export class TenantModule {
  constructor(@Inject(PERMISSION_REGISTRY) private readonly permissions: PermissionRegistry) {
    // §10.1: modul kendi permission'larini Authorization'a DEKLARE eder.
    // Kayit constructor'da yapilir — modul instantiate edilirken, ilk istekten
    // ONCE tamamlanir. `AuthzModule` global oldugu icin registry burada
    // Tenant'in Authorization'i import etmesine gerek kalmadan erisilebilir.
    this.permissions.register(TENANT_PERMISSIONS);
  }
}
