import { type DomainEvent } from '../../../shared/domain-event';
import { type TokenFamilyId } from './token-family-id.value-object';
import { type UserId } from '../../../shared/user-id.value-object';

/**
 * ⚠️ Kullanilmis bir refresh token YENIDEN sunuldu (AUTH_ARCHITECTURE 11.3, §15.2).
 *
 * ============================================================================
 * BU BIR BILDIRIM DEGIL, ALARMDIR
 * ============================================================================
 * §15.2: bu event ve `UserLockedOut` yalnizca denetim kaydi degildir — ALARM
 * uretmelidirler. Tekrarlanmalari aktif bir saldirinin en erken sinyalidir.
 *
 * Yayinlandigi an, iki tarafin ayni token zincirini kullandigi ANLASILMIS ve
 * ailenin tamami iptal EDILMISTIR. Event iptali tetiklemez; olan biteni
 * duyurur. Iptal, tespitle ayni anda ve ondan bagimsiz olarak yapilir —
 * teslimat/tuketici sorunlari korumayi geciktirmemelidir.
 * ============================================================================
 *
 * Payload SIR TASIMAZ: token, hash veya kod yoktur — yalnizca kim (userId) ve
 * hangi oturum (familyId). `tenantId` NULL'dir (§15.1).
 */
export interface RefreshTokenReuseDetectedPayload {
  readonly userId: string;
  /** Iptal edilen token ailesi (oturum). */
  readonly familyId: string;
}

export interface CreateRefreshTokenReuseDetectedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly familyId: TokenFamilyId;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class RefreshTokenReuseDetected implements DomainEvent {
  static readonly TYPE = 'refresh_token.reuse_detected';
  static readonly VERSION = 1;

  readonly eventType = RefreshTokenReuseDetected.TYPE;
  readonly eventVersion = RefreshTokenReuseDetected.VERSION;

  readonly eventId: string;
  /** Identity event'i — tenant'a atfedilemez (§15.1). */
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<RefreshTokenReuseDetectedPayload>;

  private constructor(input: CreateRefreshTokenReuseDetectedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      familyId: input.familyId.value,
    });

    Object.freeze(this);
  }

  static create(input: CreateRefreshTokenReuseDetectedInput): RefreshTokenReuseDetected {
    return new RefreshTokenReuseDetected(input);
  }
}
