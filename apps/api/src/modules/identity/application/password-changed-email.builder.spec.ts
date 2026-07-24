import { describe, expect, it } from 'vitest';

import {
  buildPasswordChangedNotification,
  InvalidPasswordChangedPayloadError,
} from './password-changed-email.builder';

describe('buildPasswordChangedNotification', () => {
  it('dogru adrese bilgilendirme yollar', () => {
    const message = buildPasswordChangedNotification({ userId: 'u-1', email: 'user@example.com' });

    expect(message.to).toBe('user@example.com');
    expect(message.subject).toContain('degistirildi');
    // "yapmadiysaniz" uyarisi bilgilendirmenin asil amaci.
    expect(message.textBody.toLowerCase()).toContain('yapmadiysaniz');
  });

  it('SIR TASIMAZ — kod/parola/token gecmez', () => {
    const body = buildPasswordChangedNotification({ email: 'user@example.com' }).textBody;
    expect(body).not.toMatch(/\d{6}/);
  });

  it('email eksikse ACIKCA reddeder', () => {
    expect(() => buildPasswordChangedNotification({ userId: 'u-1' })).toThrow(
      InvalidPasswordChangedPayloadError,
    );
  });
});
