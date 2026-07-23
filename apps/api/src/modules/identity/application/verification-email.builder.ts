import { type EmailMessage } from '../../../shared/email.port';
import { VERIFICATION_CODE_TTL_MINUTES } from '../domain/email-verification-code.entity';

/**
 * `user.registered` payload'indan dogrulama e-postasini kurar.
 *
 * SAF: I/O yok, saglayici yok, sablon motoru yok. Boylece icerigin dogrulugu
 * (kodun gectigi, sirlarin gecmedigi) e-posta gondermeden test edilebilir.
 *
 * ============================================================================
 * PAYLOAD DISARIDAN GELIR — jsonb'den okunur, GUVENILMEZ
 * ============================================================================
 * Kayit `jsonb` kolonundan gelir; tipi calisma zamaninda garanti DEGILDIR.
 * Bu yuzden alanlar `as` ile zorlanmaz, acikca ayristirilir (ARCHITECTURE 4).
 * Bicimsiz bir payload sessizce "undefined" iceren bir e-postaya donusmez —
 * acikca patlar ve kayit yayinlanmamis kalir.
 * ============================================================================
 */

const SUBJECT = 'Business OS — e-posta dogrulama kodunuz';

export class InvalidUserRegisteredPayloadError extends Error {
  constructor(reason: string) {
    super(`user.registered payload'i kullanilamaz: ${reason}`);
    this.name = 'InvalidUserRegisteredPayloadError';
  }
}

interface UserRegisteredFields {
  readonly email: string;
  readonly verificationCode: string;
}

function readString(payload: Readonly<Record<string, unknown>>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidUserRegisteredPayloadError(`'${field}' alani metin degil veya bos`);
  }
  return value;
}

function parse(payload: Readonly<Record<string, unknown>>): UserRegisteredFields {
  return {
    email: readString(payload, 'email'),
    verificationCode: readString(payload, 'verificationCode'),
  };
}

/**
 * Metin duz tutuldu: HTML sablonu bir sunum karari ve bugun bir degeri yok.
 * Kod TEK basina bir satirda durur — kullanici onu kopyalayacak.
 */
export function buildVerificationEmail(
  payload: Readonly<Record<string, unknown>>,
): EmailMessage {
  const { email, verificationCode } = parse(payload);

  return {
    to: email,
    subject: SUBJECT,
    textBody:
      'Business OS hesabinizi dogrulamak icin asagidaki kodu girin:\n\n' +
      `${verificationCode}\n\n` +
      `Kod ${String(VERIFICATION_CODE_TTL_MINUTES)} dakika gecerlidir. ` +
      'Bu kaydi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz.',
  };
}
