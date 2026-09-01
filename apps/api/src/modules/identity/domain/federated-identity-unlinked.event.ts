import { type DomainEvent } from '../../../shared/domain-event';
import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Bir saglayici baglantisi kaldirildi (ADR-0053 §4.4).
 *
 * `FederatedIdentityLinked` ile ayni gerekce: `tenantId = null`, hedef
 * `platform.identity_outbox` — `platform.audit_log`in `tenant_id`si
 * `NOT NULL`dur ve kimlik olaylari tenant'siz.
 *
 * ⚠️ BU OLAY OTURUMLARI DUSURMEZ ve dusurmemesi bir karardir (§4.4): parola
 * degistirmede oturumlar duser (ADR-0023) cunku orada SIRRIN KENDISI degisir;
 * burada yalnizca bir giris KAPISI kapanir ve acik oturumlar o kapidan gelmemis
 * olabilir.
 */
export interface FederatedIdentityUnlinkedPayload {
  readonly userId: string;
  readonly provider: OAuthProviderKey;
}

export interface CreateFederatedIdentityUnlinkedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly provider: OAuthProviderKey;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class FederatedIdentityUnlinked implements DomainEvent {
  static readonly TYPE = 'identity.federated_identity_unlinked';
  static readonly VERSION = 1;

  readonly eventType = FederatedIdentityUnlinked.TYPE;
  readonly eventVersion = FederatedIdentityUnlinked.VERSION;

  readonly eventId: string;
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<FederatedIdentityUnlinkedPayload>;

  private constructor(input: CreateFederatedIdentityUnlinkedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      provider: input.provider,
    });

    Object.freeze(this);
  }

  static create(input: CreateFederatedIdentityUnlinkedInput): FederatedIdentityUnlinked {
    return new FederatedIdentityUnlinked(input);
  }
}
