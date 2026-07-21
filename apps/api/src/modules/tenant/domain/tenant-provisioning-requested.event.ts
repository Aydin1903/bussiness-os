import { type DomainEvent } from '../../../shared/domain-event';
import { type TenantId } from './tenant-id.value-object';
import { type TenantSlug } from './tenant-slug.value-object';
import { type UserId } from './user-id.value-object';

/**
 * Tenant kaydi olusturuldu; asenkron kurulum baslatilmali (ADR-0016).
 *
 * ADR-0006: bu event, onu doguran veri degisikligiyle AYNI TRANSACTION'da
 * outbox'a yazilir. Aksi halde "tenant kaydedildi ama provisioning hic
 * baslamadi" durumu olusur ve sistem kalici olarak tutarsiz kalir.
 *
 * Gecmis zaman isimlendirme (ARCHITECTURE 7.2): olan biteni bildirir, emir
 * vermez.
 */
export interface TenantProvisioningRequestedPayload {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly ownerUserId: string;
}

export interface CreateTenantProvisioningRequestedInput {
  readonly eventId: string;
  readonly tenantId: TenantId;
  readonly slug: TenantSlug;
  readonly name: string;
  readonly ownerUserId: UserId;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class TenantProvisioningRequested implements DomainEvent {
  static readonly TYPE = 'tenant.provisioning_requested';
  static readonly VERSION = 1;

  readonly eventType = TenantProvisioningRequested.TYPE;
  readonly eventVersion = TenantProvisioningRequested.VERSION;

  readonly eventId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<TenantProvisioningRequestedPayload>;

  private constructor(input: CreateTenantProvisioningRequestedInput) {
    this.eventId = input.eventId;
    this.tenantId = input.tenantId.value;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    // Payload ILKEL degerler tasir, value object degil: event serilestirilip
    // outbox'a yazilir ve baska bir process tarafindan okunur. Value object
    // JSON'a donusunce zaten ilkele iner; sozlesmeyi bastan ilkel tutmak,
    // uretilen ile tuketilenin ayni olmasini garanti eder.
    this.payload = Object.freeze({
      tenantId: input.tenantId.value,
      slug: input.slug.value,
      name: input.name,
      ownerUserId: input.ownerUserId.value,
    });

    Object.freeze(this);
  }

  static create(input: CreateTenantProvisioningRequestedInput): TenantProvisioningRequested {
    return new TenantProvisioningRequested(input);
  }
}
