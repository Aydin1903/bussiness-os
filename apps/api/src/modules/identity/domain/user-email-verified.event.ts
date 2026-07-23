import { type DomainEvent } from '../../../shared/domain-event';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Kullanicinin e-postasi dogrulandi (AUTH_ARCHITECTURE 7.5, §15).
 *
 * ADR-0006: bu event, onu doguran veri degisikligiyle (User + tuketilen kod) AYNI
 * TRANSACTION'da `identity_outbox`'a yazilir. `tenantId` NULL'dir — dogrulama
 * tenant seciminden ONCEDIR; kullanici bu noktada hala hicbir tenant'a ait
 * degildir (§7.5 notu, ADR-0016).
 *
 * ============================================================================
 * PAYLOAD DAR: YALNIZCA `userId`
 * ============================================================================
 * `UserRegistered` ham kodu tasir cunku TESLIMAT ona baglidir. Burada teslim
 * edilecek bir sir YOKTUR: dogrulama olup bitmistir. Kod, hash, e-posta veya
 * durum bilgisi eklemek payload'i genisletir ve outbox satirini gereksiz yere
 * kisisel veri tasiyan bir kayda cevirir (P1).
 * ============================================================================
 */
export interface UserEmailVerifiedPayload {
  readonly userId: string;
}

export interface CreateUserEmailVerifiedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class UserEmailVerified implements DomainEvent {
  static readonly TYPE = 'user.email_verified';
  static readonly VERSION = 1;

  readonly eventType = UserEmailVerified.TYPE;
  readonly eventVersion = UserEmailVerified.VERSION;

  readonly eventId: string;
  /** Identity event'i — tenant'a atfedilemez (§15.1). */
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<UserEmailVerifiedPayload>;

  private constructor(input: CreateUserEmailVerifiedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    // Payload ILKEL degerler tasir: event serilestirilip outbox'a yazilir.
    this.payload = Object.freeze({ userId: input.userId.value });

    Object.freeze(this);
  }

  static create(input: CreateUserEmailVerifiedInput): UserEmailVerified {
    return new UserEmailVerified(input);
  }
}
