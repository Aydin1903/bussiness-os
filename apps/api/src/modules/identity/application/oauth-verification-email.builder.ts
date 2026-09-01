import { type EmailMessage } from '../../../shared/email.port';
import { VERIFICATION_CODE_TTL_MINUTES } from '../domain/email-verification-code.entity';

/**
 * D3'un dogrulama e-postasini kurar (ADR-0053 §1.3).
 *
 * SAF: I/O yok, saglayici yok, sablon motoru yok — `buildVerificationEmail` ile
 * ayni disiplin.
 *
 * ============================================================================
 * ⚠️ METIN HESABIN VAR OLUP OLMADIGINI SOYLEMEZ
 * ============================================================================
 * D3'e iki yoldan gelinir (mevcut hesaba baglama / yeni hesap acma) ve
 * kullanicinin gordugu metin IKISINDE DE AYNIDIR. Ayirt edilebilir olsaydi,
 * e-posta claim'ini kendisi yazan bir saldirgan icin bir hesap sayim kanali
 * acilirdi (P2).
 *
 * ⚠️ Bu yuzden cumle "hesabiniza baglamak icin" ya da "kaydinizi tamamlamak
 * icin" DEMEZ; ikisini de kapsayan notr bir fiil kullanir.
 * ============================================================================
 */

const SUBJECT = 'Business OS — giris dogrulama kodunuz';

/** Saglayicinin kullaniciya gosterilecek adi. Anahtar degil, ETIKET. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  google: 'Google',
  microsoft: 'Microsoft',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

export class InvalidOAuthVerificationPayloadError extends Error {
  constructor(reason: string) {
    super(`oauth dogrulama payload'i kullanilamaz: ${reason}`);
    this.name = 'InvalidOAuthVerificationPayloadError';
  }
}

function readString(payload: Readonly<Record<string, unknown>>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidOAuthVerificationPayloadError(`'${field}' alani metin degil veya bos`);
  }
  return value;
}

/**
 * ⚠️ Saglayici adi payload'dan gelir ve payload `jsonb`den okunur — yani
 * GUVENILMEZDIR. Dogrudan metne yazilsaydi, bozuk bir satir kullaniciya
 * gonderilen e-postaya keyfi metin sokabilirdi. Bu yuzden yalnizca BILINEN
 * etiketlere eslenir; bilinmeyen deger notr bir ifadeye duser.
 */
function toProviderLabel(value: string): string {
  return PROVIDER_LABELS[value] ?? 'sosyal hesabiniz';
}

export function buildOAuthVerificationEmail(
  payload: Readonly<Record<string, unknown>>,
): EmailMessage {
  const email = readString(payload, 'email');
  const verificationCode = readString(payload, 'verificationCode');
  const provider = toProviderLabel(readString(payload, 'provider'));

  return {
    to: email,
    subject: SUBJECT,
    textBody:
      `${provider} ile giris yapmak icin asagidaki kodu girin:\n\n` +
      `${verificationCode}\n\n` +
      `Kod ${String(VERIFICATION_CODE_TTL_MINUTES)} dakika gecerlidir. ` +
      'Bu islemi siz baslatmadiysaniz bu e-postayi yok sayabilirsiniz; ' +
      'kod girilmeden hicbir baglanti kurulmaz.',
  };
}
