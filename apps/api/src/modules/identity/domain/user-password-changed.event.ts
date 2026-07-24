import { type DomainEvent } from '../../../shared/domain-event';
import { type Email } from './email.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * Kullanicinin parolasi degisti (AUTH_ARCHITECTURE 7.6/§15, ADR-0024).
 *
 * ADR-0006: parola degisikligiyle AYNI TRANSACTION'da `identity_outbox`'a
 * yazilir. `tenantId` NULL'dir.
 *
 * ============================================================================
 * NEDEN E-POSTA PAYLOAD'DA — VE NEDEN SIR TASIMAZ
 * ============================================================================
 * Bu event bir BILGILENDIRME e-postasi tetikler ("parolan degistirildi"). Onu
 * teslim eden tuketicinin alici adresine ihtiyaci var; bu yuzden `email`
 * payload'dadir (UserRegistered ile ayni desen). SIR YOKTUR: yeni parola, kod
 * veya token TASINMAZ. E-postanin amaci, sifirlamayi YAPMAYAN kisiyi (hesap ele
 * gecirilmisse) uyarmaktir; yapan zaten bilir.
 * ============================================================================
 */
export interface UserPasswordChangedPayload {
  readonly userId: string;
  readonly email: string;
}

export interface CreateUserPasswordChangedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly email: Email;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class UserPasswordChanged implements DomainEvent {
  static readonly TYPE = 'user.password_changed';
  static readonly VERSION = 1;

  readonly eventType = UserPasswordChanged.TYPE;
  readonly eventVersion = UserPasswordChanged.VERSION;

  readonly eventId: string;
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<UserPasswordChangedPayload>;

  private constructor(input: CreateUserPasswordChangedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({ userId: input.userId.value, email: input.email.value });

    Object.freeze(this);
  }

  static create(input: CreateUserPasswordChangedInput): UserPasswordChanged {
    return new UserPasswordChanged(input);
  }
}
