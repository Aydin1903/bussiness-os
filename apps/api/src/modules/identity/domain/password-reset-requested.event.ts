import { type DomainEvent } from '../../../shared/domain-event';
import { type Email } from './email.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Parola sifirlama kodu istendi; kod e-postayla gonderilmeli (AUTH §7.6, §15).
 *
 * ADR-0006: bu event, onu doguran degisiklikle (yeni reset kodu) AYNI
 * TRANSACTION'da `identity_outbox`'a yazilir. `tenantId` NULL'dir — sifirlama
 * kimliktir, tenant'siz.
 *
 * ============================================================================
 * PAYLOAD HAM KODU TASIR — bilincli (UserRegistered ile ayni gerekce)
 * ============================================================================
 * Outbox tuketicisi 6 haneli kodu e-postalar; tuketici ham kodu
 * `password_reset_codes`'tan OKUYAMAZ (orada yalnizca HMAC durur), bu yuzden kod
 * teslimat icin payload'da tasinir. Satir teslimat sonrasi silinir, kod
 * dakikalar omurludur ve hicbir LOG'a girmez (P1) — yalnizca teslimat kanalina.
 * ============================================================================
 */
export interface PasswordResetRequestedPayload {
  readonly userId: string;
  readonly email: string;
  /** 6 haneli ham sifirlama kodu — YALNIZCA e-posta teslimati icin. */
  readonly resetCode: string;
}

export interface CreatePasswordResetRequestedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly email: Email;
  readonly resetCode: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class PasswordResetRequested implements DomainEvent {
  static readonly TYPE = 'password_reset.requested';
  static readonly VERSION = 1;

  readonly eventType = PasswordResetRequested.TYPE;
  readonly eventVersion = PasswordResetRequested.VERSION;

  readonly eventId: string;
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<PasswordResetRequestedPayload>;

  private constructor(input: CreatePasswordResetRequestedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      email: input.email.value,
      resetCode: input.resetCode,
    });

    Object.freeze(this);
  }

  static create(input: CreatePasswordResetRequestedInput): PasswordResetRequested {
    return new PasswordResetRequested(input);
  }
}
