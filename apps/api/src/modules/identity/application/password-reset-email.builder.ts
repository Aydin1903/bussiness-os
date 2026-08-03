import { type EmailMessage } from '../../../shared/email.port';
import { PASSWORD_RESET_CODE_TTL_MINUTES } from '../domain/password-reset-code.entity';

/**
 * `password_reset.requested` payload'indan sifirlama e-postasini kurar.
 *
 * `verification-email.builder.ts` ile ayni disiplin: SAF (I/O yok), payload
 * jsonb'den gelir ve GUVENILMEZ — alanlar `as` ile zorlanmaz, acikca ayristirilir
 * (bozuk payload sessizce "undefined" iceren e-postaya donmez, acikca patlar).
 * Kod hicbir LOG'a girmez (P1); yalnizca teslimat kanalina.
 */

const SUBJECT = 'Business OS — parola sifirlama kodunuz';

export class InvalidPasswordResetPayloadError extends Error {
  constructor(reason: string) {
    super(`password_reset.requested payload'i kullanilamaz: ${reason}`);
    this.name = 'InvalidPasswordResetPayloadError';
  }
}

function readString(payload: Readonly<Record<string, unknown>>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidPasswordResetPayloadError(`'${field}' alani metin degil veya bos`);
  }
  return value;
}

export function buildPasswordResetEmail(payload: Readonly<Record<string, unknown>>): EmailMessage {
  const email = readString(payload, 'email');
  const resetCode = readString(payload, 'resetCode');

  return {
    to: email,
    subject: SUBJECT,
    textBody:
      'Business OS parolanizi sifirlamak icin asagidaki kodu girin:\n\n' +
      `${resetCode}\n\n` +
      `Kod ${String(PASSWORD_RESET_CODE_TTL_MINUTES)} dakika gecerlidir. ` +
      'Bu istegi siz yapmadiysaniz bu e-postayi yok sayin; parolaniz degismez.',
  };
}
