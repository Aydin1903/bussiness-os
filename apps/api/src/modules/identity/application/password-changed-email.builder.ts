import { type EmailMessage } from '../../../shared/email.port';

/**
 * `user.password_changed` payload'indan BILGILENDIRME e-postasini kurar.
 *
 * SAF ve SIR TASIMAZ: yeni parola/kod/token yoktur; yalnizca "parolan
 * degistirildi" bildirimi. Amaci, sifirlamayi YAPMAYAN kisiyi (hesap ele
 * gecirilmisse) uyarmaktir — yapan zaten bilir (ADR-0024).
 */

const SUBJECT = 'Business OS — parolaniz degistirildi';

export class InvalidPasswordChangedPayloadError extends Error {
  constructor(reason: string) {
    super(`user.password_changed payload'i kullanilamaz: ${reason}`);
    this.name = 'InvalidPasswordChangedPayloadError';
  }
}

export function buildPasswordChangedNotification(
  payload: Readonly<Record<string, unknown>>,
): EmailMessage {
  const email = payload.email;
  if (typeof email !== 'string' || email.trim() === '') {
    throw new InvalidPasswordChangedPayloadError("'email' alani metin degil veya bos");
  }

  return {
    to: email,
    subject: SUBJECT,
    textBody:
      'Business OS hesabinizin parolasi az once degistirildi.\n\n' +
      'Bu degisikligi SIZ yaptiysaniz bu e-postayi yok sayabilirsiniz.\n' +
      'YAPMADIYSANIZ hesabiniz risk altinda olabilir — derhal parolanizi ' +
      'yeniden sifirlayin ve destek ile iletisime gecin.',
  };
}
