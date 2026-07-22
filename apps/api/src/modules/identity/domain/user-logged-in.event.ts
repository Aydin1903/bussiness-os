import { type DomainEvent } from '../../../shared/domain-event';
import { type TokenFamilyId } from './token-family-id.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Bir kullanici basariyla giris yapti (AUTH_ARCHITECTURE 15).
 *
 * Denetim event'idir. `tenantId` NULL'dir — giris tenant seciminden ONCEDIR
 * (§15.1). ADR-0006: basarili giris (TokenFamily+RefreshToken) ile AYNI
 * TRANSACTION'da `identity_outbox`'a yazilir.
 *
 * Payload SIR TASIMAZ: yalnizca kim (userId) ve hangi oturum (sessionId =
 * token ailesi). Token, kod veya parola YOK.
 */
export interface UserLoggedInPayload {
  readonly userId: string;
  /** Olusturulan oturumun (token ailesi) kimligi. */
  readonly sessionId: string;
}

export interface CreateUserLoggedInInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly sessionId: TokenFamilyId;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class UserLoggedIn implements DomainEvent {
  static readonly TYPE = 'user.logged_in';
  static readonly VERSION = 1;

  readonly eventType = UserLoggedIn.TYPE;
  readonly eventVersion = UserLoggedIn.VERSION;

  readonly eventId: string;
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<UserLoggedInPayload>;

  private constructor(input: CreateUserLoggedInInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      sessionId: input.sessionId.value,
    });

    Object.freeze(this);
  }

  static create(input: CreateUserLoggedInInput): UserLoggedIn {
    return new UserLoggedIn(input);
  }
}
