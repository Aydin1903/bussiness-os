import { type DomainEvent } from '../../../shared/domain-event';
import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { type Email } from './email.value-object';

/**
 * D3 (ADR-0053 §1.3): saglayicinin e-posta hukmu `false` — kendi 6 haneli
 * kodumuz gonderilecek.
 *
 * ============================================================================
 * ⚠️ NEDEN `UserRegistered` YENIDEN KULLANILMADI
 * ============================================================================
 * `UserRegistered` "yeni bir hesap acildi" demektir ve metni de oyle yazilmistir
 * (_"Bu kaydi siz yapmadiysaniz…"_). D3'te IKI durum da mumkundur:
 *
 *   - kullanici YOKTU  -> `pending` bir hesap acilir (kayit gibi), ama sebep
 *     bir saglayici girisidir;
 *   - kullanici VARDI  -> hicbir hesap acilmaz; yalnizca gelen kutusuna sahip
 *     oldugu kanitlanir.
 *
 * Ikisine de _"kaydiniz olusturuldu"_ demek YANLIS olurdu; ikincisinde
 * kullanici zaten uyedir ve o cumle onu paniklerdi. Bu yuzden AYRI bir olay ve
 * AYRI bir metin.
 *
 * ⚠️ Metin HANGI DURUMDA oldugumuzu SOYLEMEZ (§1.3): hesap var da olsa yok da
 * olsa gonderilen e-posta AYNIDIR. Ayirt edilebilir olsaydi, claim'i kendisi
 * yazan bir saldirgan gelen kutusuna erisemese bile — kullaniciyi kandirip
 * ekran goruntusu isteyerek — hesap varligini ogrenebilirdi. Ekran metni de
 * ayni sebeple sabittir.
 *
 * ============================================================================
 * ⚠️ PAYLOAD `sub` TASIMAZ
 * ============================================================================
 * Baglamayi tamamlayacak olan `sub`, IMZALI BEKLEYEN BAGLAMA CEREZINDEDIR
 * (§4.3) — tarayicida, sunucuda degil. Outbox satirina yazilsaydi, e-posta
 * kuyrugunu okuyabilen biri baglamayi tamamlamak icin gereken iki parcadan
 * birine erisirdi.
 * ============================================================================
 */
export interface OAuthEmailVerificationRequestedPayload {
  readonly userId: string;
  readonly email: string;
  readonly provider: OAuthProviderKey;
  /** 6 haneli ham kod — YALNIZCA e-posta teslimati icin (`UserRegistered` ile ayni desen). */
  readonly verificationCode: string;
}

export interface CreateOAuthEmailVerificationRequestedInput {
  readonly eventId: string;
  readonly userId: UserId;
  readonly email: Email;
  readonly provider: OAuthProviderKey;
  readonly verificationCode: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export class OAuthEmailVerificationRequested implements DomainEvent {
  static readonly TYPE = 'identity.oauth_email_verification_requested';
  static readonly VERSION = 1;

  readonly eventType = OAuthEmailVerificationRequested.TYPE;
  readonly eventVersion = OAuthEmailVerificationRequested.VERSION;

  readonly eventId: string;
  readonly tenantId = null;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: Readonly<OAuthEmailVerificationRequestedPayload>;

  private constructor(input: CreateOAuthEmailVerificationRequestedInput) {
    this.eventId = input.eventId;
    this.occurredAt = new Date(input.occurredAt.getTime());
    this.correlationId = input.correlationId;

    this.payload = Object.freeze({
      userId: input.userId.value,
      email: input.email.value,
      provider: input.provider,
      verificationCode: input.verificationCode,
    });

    Object.freeze(this);
  }

  static create(
    input: CreateOAuthEmailVerificationRequestedInput,
  ): OAuthEmailVerificationRequested {
    return new OAuthEmailVerificationRequested(input);
  }
}
