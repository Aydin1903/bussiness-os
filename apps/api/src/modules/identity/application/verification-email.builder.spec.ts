import { describe, expect, it } from 'vitest';

import {
  buildVerificationEmail,
  InvalidUserRegisteredPayloadError,
} from './verification-email.builder';

const PAYLOAD = {
  userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
  email: 'user@example.com',
  verificationCode: '123456',
};

describe('buildVerificationEmail', () => {
  it('e-postayi payload daki adrese yollar', () => {
    expect(buildVerificationEmail(PAYLOAD).to).toBe('user@example.com');
  });

  it('kodu govdeye koyar', () => {
    expect(buildVerificationEmail(PAYLOAD).textBody).toContain('123456');
  });

  it('kodun gecerlilik suresini yazar (15 dakika)', () => {
    expect(buildVerificationEmail(PAYLOAD).textBody).toContain('15 dakika');
  });

  it('konu satirinda KOD BULUNMAZ', () => {
    // Konu satiri bildirim onizlemelerinde ve mail sunucusu loglarinda gorunur.
    expect(buildVerificationEmail(PAYLOAD).subject).not.toContain('123456');
  });

  it('userId gibi ic kimlikleri govdeye sizdirmaz', () => {
    expect(buildVerificationEmail(PAYLOAD).textBody).not.toContain(PAYLOAD.userId);
  });

  it.each([
    ['email eksik', { verificationCode: '123456' }],
    ['kod eksik', { email: 'user@example.com' }],
    ['email bos', { email: '   ', verificationCode: '123456' }],
    ['kod metin degil', { email: 'user@example.com', verificationCode: 123456 }],
  ])('bozuk payload u (%s) ACIKCA reddeder', (_name, payload) => {
    // Sessizce "undefined" iceren bir e-posta gondermek, hatayi kullaniciya
    // tasirdi; kayit yayinlanmamis kalsin ve gorunur olsun.
    expect(() => buildVerificationEmail(payload)).toThrow(InvalidUserRegisteredPayloadError);
  });
});
