import { type DomainEvent } from '../../../shared/domain-event';
import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Bir kullaniciya bir saglayici hesabi baglandi (ADR-0053 §2.3).
 *
 * ============================================================================
 * ⚠️ NEDEN `platform.audit_log` DEGIL DE OUTBOX
 * ============================================================================
 * Baglama guvenlik acisindan anlamli bir olaydir ve kaydedilmelidir. Ama
 * `platform.audit_log`a YAZILAMAZ: o tablonun `tenant_id` kolonu `NOT NULL`dur
 * ve `platform.tenants`a FK tasir (`0032`). Kimlik olaylari TENANT'SIZDIR —
 * kullanici baglama aninda hicbir tenant'a ait olmayabilir, hatta cogu zaman
 * degildir (kayit → tenant acma zincirinin ILK adimidir).
 *
 * Bu yuzden olay Faz 3'un tum kimlik olaylariyla ayni yere, `identity_outbox`a
 * gider ve `tenantId = null` tasir (§15.1). ⚠️ Yeni bir mekanizma KURULMAZ:
 * "denetim izi" adi altinda ikinci bir olay altyapisi acmak, izlemek istedigimiz
 * seyi iki yere bolmek olurdu.
 *
 * ============================================================================
 * ⚠️ PAYLOAD `sub` TASIMAZ
 * ============================================================================
 * `providerSubject` bir kimlik anahtaridir ve outbox satiri teslimat icin
 * okunur, loglanir, hata ayiklamada goze carpar. Olayin cevaplamasi gereken
 * soru _"kim, hangi saglayiciyi, ne zaman bagladi"_dir; `sub` bu sorunun
 * cevabinda YER ALMAZ ve tasinmasi yalnizca yuzey buyutur (P1).
 * ============================================================================
 */
export interface FederatedIdentityLinkedPayload {
  readonly userId: string;
  readonly provider: OAuthProviderKey;
  /** Baglantinin yeni bir kullanici mi actigini yoksa mevcut hesaba mi eklendigini soyler. */
  readonly createdNewUser: boolean;
}

export interface CreateFederatedIdentityLinkedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly provider: OAuthProviderKey;
  readonly createdNewUser: boolean;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class FederatedIdentityLinked implements DomainEvent {
  static readonly TYPE = 'identity.federated_identity_linked';
  static readonly VERSION = 1;

  readonly eventType = FederatedIdentityLinked.TYPE;
  readonly eventVersion = FederatedIdentityLinked.VERSION;

  readonly eventId: string;
  /** Identity event'i — tenant'a atfedilemez (§15.1). */
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<FederatedIdentityLinkedPayload>;

  private constructor(input: CreateFederatedIdentityLinkedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      provider: input.provider,
      createdNewUser: input.createdNewUser,
    });

    Object.freeze(this);
  }

  static create(input: CreateFederatedIdentityLinkedInput): FederatedIdentityLinked {
    return new FederatedIdentityLinked(input);
  }
}
