import { type DomainEvent } from '../../../shared/domain-event';
import { type Email } from './email.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Yeni bir kullanici kaydedildi; dogrulama kodu gonderilmeli (AUTH_ARCHITECTURE 8, §15).
 *
 * ADR-0006: bu event, onu doguran veri degisikligiyle (User+Credential+Code) AYNI
 * TRANSACTION'da `identity_outbox`'a yazilir. `tenantId` NULL'dir — kullanici
 * henuz hicbir tenant'a ait degildir (§15.1).
 *
 * ============================================================================
 * PAYLOAD HAM KODU TASIR — bilincli
 * ============================================================================
 * §8 akisi: outbox tuketicisi 6 haneli kodu e-postalar. Tuketici ham kodu
 * `email_verification_codes`'tan OKUYAMAZ (orada yalnizca HMAC saklanir), bu
 * yuzden kod teslimat icin event payload'inda tasinir. Bu, kodu `identity_outbox`
 * satirinda kisa sureligine DUZ tutar; satir teslimat sonrasi silinir ve kod
 * dakikalar omurludur. Kod hicbir LOG'a girmez (P1) — yalnizca teslimat kanalina.
 * ============================================================================
 */
export interface UserRegisteredPayload {
  readonly userId: string;
  readonly email: string;
  /** 6 haneli ham dogrulama kodu — YALNIZCA e-posta teslimati icin. */
  readonly verificationCode: string;
}

export interface CreateUserRegisteredInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly email: Email;
  readonly verificationCode: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class UserRegistered implements DomainEvent {
  static readonly TYPE = 'user.registered';
  static readonly VERSION = 1;

  readonly eventType = UserRegistered.TYPE;
  readonly eventVersion = UserRegistered.VERSION;

  readonly eventId: string;
  /** Identity event'i — tenant'a atfedilemez (§15.1). */
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<UserRegisteredPayload>;

  private constructor(input: CreateUserRegisteredInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    // Payload ILKEL degerler tasir: event serilestirilip outbox'a yazilir.
    this.payload = Object.freeze({
      userId: input.userId.value,
      email: input.email.value,
      verificationCode: input.verificationCode,
    });

    Object.freeze(this);
  }

  static create(input: CreateUserRegisteredInput): UserRegistered {
    return new UserRegistered(input);
  }
}
