import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { MembershipId } from '../domain/membership-id.value-object';
import { Membership } from '../domain/membership.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import { type TenantSlug } from '../domain/tenant-slug.value-object';
import { TenantProvisioningRequested } from '../domain/tenant-provisioning-requested.event';
import { Tenant } from '../domain/tenant.entity';
import { TenantSlugAlreadyTakenError } from '../domain/tenant.error';
import { type UserId } from '../domain/user-id.value-object';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type MembershipRepository } from './membership.repository.port';
import { type TenantProvisioningPolicy } from './tenant-provisioning-policy.port';
import { type TenantRepository } from './tenant.repository.port';

/**
 * Yeni bir tenant acar (ADR-0016, MULTI_TENANT_ARCHITECTURE 9).
 *
 * ============================================================================
 * BU USE CASE'IN VAR OLMA SEBEBI: ATOMIKLIK
 * ============================================================================
 * ADR-0016: "Sahipsiz bir tenant asla var olamaz. Bu atomiklik pazarlik konusu
 * degildir."
 *
 * Tenant kaydi commit olup owner membership'i olusmazsa, tenant'a HICBIR
 * kullanici erisemez ve kurtarilmasi manuel mudahale gerektirir. Bu yuzden
 * tenant + owner membership + outbox event'i TEK TRANSACTION'da yazilir.
 * ============================================================================
 *
 * NEDEN TEK `runInTenantTransaction`:
 *
 * `platform.memberships` standart RLS'e tabidir (12.4). Context kurulmadan
 * yapilan `INSERT` RLS'e takilir. Transaction, tenant'in kendi id'siyle
 * acilir; `platform.tenants` politikasi `id = current_setting(...)` oldugu
 * icin tenant kendi satirini yazabilir, membership de ayni context altinda
 * yazilir.
 *
 * Ic ice transaction KULLANILMAZ — kismi commit riski uretir.
 */
export interface ProvisionTenantCommand {
  readonly ownerUserId: UserId;
  readonly name: string;
  readonly slug: TenantSlug;
  /** HTTP sinirindan gelir; event ve loglar uzerinden uctan uca izleme saglar. */
  readonly correlationId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface ProvisionTenantDependencies {
  readonly tenantRepository: TenantRepository;
  readonly membershipRepository: MembershipRepository;
  readonly provisioningPolicy: TenantProvisioningPolicy;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class ProvisionTenantUseCase {
  constructor(private readonly deps: ProvisionTenantDependencies) {}

  /**
   * Tenant'i `provisioning` durumunda dondurur — HENUZ KULLANIMA HAZIR DEGIL.
   *
   * Kurulumun geri kalani (storage prefix'i, arama index'i, ornek veri)
   * `TenantProvisioningRequested` event'ini tuketen asenkron handler'da olur.
   * Bu yuzden HTTP karsiligi `202 Accepted`'tir, `201` degil.
   */
  async execute(command: ProvisionTenantCommand): Promise<Tenant> {
    // 1. Onkosul: ADR-0016 geregi dogrulanmamis kullanici tenant acamaz.
    //    Policy hata firlatir; buraya donmusse kullanici uygundur.
    await this.deps.provisioningPolicy.assertCanProvision(command.ownerUserId);

    // 2. Nesneler transaction'dan ONCE kurulur: hepsi saf, I/O yok. Gecersiz
    //    girdi varsa transaction hic acilmadan burada patlar ve veritabani
    //    baglantisi bos yere tutulmaz.
    const { tenant, ownerMembership, event } = this.#build(command);

    // 3. Tum veritabani erisimi TEK transaction'da.
    //
    //    Slug kontrolu de ICERIDEDIR: repository cagrilari aktif bir
    //    transaction gerektirir (MULTI_TENANT_ARCHITECTURE 11.4 kural 2) —
    //    `SET LOCAL`'siz bir baglantida calisan sorgu ya RLS'e takilir ya da
    //    filtresiz calisir, ve ikincisi tum veritabanini acar.
    //
    //    Kontrol TEKILLIGI GARANTI ETMEZ; iki es zamanli istek onu birlikte
    //    gecebilir. Amaci kullaniciya erken ve anlamli geri bildirim vermektir.
    //    Gercek garanti veritabani unique index'idir ve adapter kisit
    //    ihlalini AYNI domain hatasina cevirir (ADR-0016).
    //
    //    Biri basarisiz olursa hicbiri kalmaz — yarim kurulmus, sahipsiz veya
    //    event'siz tenant olusamaz.
    await this.deps.transactionManager.runInTenantTransaction(tenant.id.value, async () => {
      if (await this.deps.tenantRepository.existsBySlug(command.slug)) {
        throw new TenantSlugAlreadyTakenError(command.slug.value);
      }

      await this.deps.tenantRepository.save(tenant);
      await this.deps.membershipRepository.save(ownerMembership);
      await this.deps.eventPublisher.publish(event);
    });

    return tenant;
  }

  /**
   * Tenant, owner uyeligi ve event'i kurar. Tamami saf — I/O yok.
   *
   * Tenant ve uyelik AYNI `now` degerini paylasir: tek bir `clock.now()`
   * okunur. Ayri ayri okunsaydi ikisi milisaniyeler farkli olur ve "kurucu,
   * tenant'tan sonra mi katildi?" gibi anlamsiz bir soru dogardi.
   */
  #build(command: ProvisionTenantCommand): {
    tenant: Tenant;
    ownerMembership: Membership;
    event: TenantProvisioningRequested;
  } {
    const tenantId = TenantId.create(this.deps.idGenerator.nextId());
    const now = this.deps.clock.now();

    const tenant = Tenant.provision({
      id: tenantId,
      slug: command.slug,
      name: command.name,
      ownerUserId: command.ownerUserId,
      createdAt: now,
    });

    const ownerMembership = Membership.createOwner({
      id: MembershipId.create(this.deps.idGenerator.nextId()),
      tenantId,
      userId: command.ownerUserId,
      joinedAt: now,
    });

    return { tenant, ownerMembership, event: this.#buildEvent(tenant, command.correlationId) };
  }

  /**
   * Event'i TENANT'TAN turetir, command'dan degil.
   *
   * Sebep: entity girdiyi normalize etti (ad trim'lendi) ve zamani kendi
   * kopyasinda tutuyor. Event'i command'dan kursaydik, yayinlanan deger ile
   * KAYDEDILEN deger birbirinden ayrilabilirdi — ve bu fark, event'i tuketen
   * tarafta sessizce yanlis veri uretirdi.
   */
  #buildEvent(tenant: Tenant, correlationId: string): TenantProvisioningRequested {
    return TenantProvisioningRequested.create({
      eventId: this.deps.idGenerator.nextId(),
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      ownerUserId: tenant.ownerUserId,
      occurredAt: tenant.createdAt,
      correlationId,
    });
  }
}
