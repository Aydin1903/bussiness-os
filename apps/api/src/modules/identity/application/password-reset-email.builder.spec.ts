import { describe, expect, it } from 'vitest';

import {
  buildPasswordResetEmail,
  InvalidPasswordResetPayloadError,
} from './password-reset-email.builder';

const PAYLOAD = { userId: 'u-1', email: 'user@example.com', resetCode: '123456' };

describe('buildPasswordResetEmail', () => {
  it('kodu govdeye koyar ve dogru adrese yollar', () => {
    const message = buildPasswordResetEmail(PAYLOAD);

    expect(message.to).toBe('user@example.com');
    expect(message.textBody).toContain('123456');
    expect(message.textBody).toContain('10 dakika');
  });

  it('konu satirinda KOD BULUNMAZ', () => {
    expect(buildPasswordResetEmail(PAYLOAD).subject).not.toContain('123456');
  });

  it('userId gibi ic kimlikleri govdeye sizdirmaz', () => {
    expect(buildPasswordResetEmail(PAYLOAD).textBody).not.toContain('u-1');
  });

  it.each([
    ['kod eksik', { email: 'user@example.com' }],
    ['email eksik', { resetCode: '123456' }],
    ['kod metin degil', { email: 'user@example.com', resetCode: 123456 }],
  ])('bozuk payload u (%s) ACIKCA reddeder', (_name, payload) => {
    expect(() => buildPasswordResetEmail(payload)).toThrow(InvalidPasswordResetPayloadError);
  });
});
