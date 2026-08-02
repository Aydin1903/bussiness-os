import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.dto';

describe('registerSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    const parsed = registerSchema.parse({ email: 'user@example.com', password: 'parola123' });

    expect(parsed).toEqual({ email: 'user@example.com', password: 'parola123' });
  });

  it('e-postanin bosluklarini temizler', () => {
    expect(registerSchema.parse({ email: '  user@example.com  ', password: 'parola123' }).email).toBe(
      'user@example.com',
    );
  });

  it('tanimsiz alani REDDEDER (strict)', () => {
    // Sessizce yok saymak, istemcinin gonderdigini sandigi ama islenmeyen
    // veriyi gizler.
    expect(() =>
      registerSchema.parse({ email: 'user@example.com', password: 'parola123', role: 'admin' }),
    ).toThrow();
  });

  it('kimlik alanlarini govdeden KABUL ETMEZ', () => {
    // userId/emailVerified gibi alanlar istemciden gelemez (DEVELOPMENT_RULES 4.5).
    expect(() =>
      registerSchema.parse({
        email: 'user@example.com',
        password: 'parola123',
        userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
      }),
    ).toThrow();
  });

  it('bos parolayi reddeder', () => {
    expect(() => registerSchema.parse({ email: 'user@example.com', password: '' })).toThrow();
  });

  it('absurt buyuklukteki parolayi sinirda eler (DoS)', () => {
    expect(() =>
      registerSchema.parse({ email: 'user@example.com', password: 'a'.repeat(257) }),
    ).toThrow();
  });

  it('politika ihlalini BURADA yakalamaz — o domain in isi', () => {
    // 'kisa1' politikaya (min 8) aykiridir ama Zod bunu gecirir; tek dogruluk
    // kaynagi password-policy.ts'tir ve 422'yi o uretir.
    expect(() =>
      registerSchema.parse({ email: 'user@example.com', password: 'kisa1' }),
    ).not.toThrow();
  });
});

describe('loginSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    expect(loginSchema.parse({ email: 'user@example.com', password: 'parola123' })).toEqual({
      email: 'user@example.com',
      password: 'parola123',
    });
  });

  it('ipAddress i govdeden KABUL ETMEZ', () => {
    // IP kaba kuvvet sayacinin anahtaridir; istemci bildirirse limit atlatilir.
    expect(() =>
      loginSchema.parse({
        email: 'user@example.com',
        password: 'parola123',
        ipAddress: '1.2.3.4',
      }),
    ).toThrow();
  });
});

describe('verifyEmailSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    expect(verifyEmailSchema.parse({ email: 'user@example.com', code: '123456' })).toEqual({
      email: 'user@example.com',
      code: '123456',
    });
  });

  it('kodun bosluklarini temizler', () => {
    expect(verifyEmailSchema.parse({ email: 'user@example.com', code: ' 123456 ' }).code).toBe(
      '123456',
    );
  });

  it.each([['12345'], ['1234567'], ['abcdef'], ['12 456'], ['']])(
    'gecersiz bicimli kodu (%s) reddeder',
    (code) => {
      // Bicimsiz girdi bir TAHMIN degildir; deneme harcamadan sinirda elenir.
      expect(() => verifyEmailSchema.parse({ email: 'user@example.com', code })).toThrow();
    },
  );

  it('kodun DOGRULUGUNU burada karara baglamaz', () => {
    // Bicimi gecerli her kod semadan gecer; dogru olup olmadigi HMAC kiyasiyla
    // ve deneme sayaci artirilarak use case'te belirlenir.
    expect(() =>
      verifyEmailSchema.parse({ email: 'user@example.com', code: '000000' }),
    ).not.toThrow();
  });

  it('parola veya kimlik alani KABUL ETMEZ (strict)', () => {
    expect(() =>
      verifyEmailSchema.parse({ email: 'user@example.com', code: '123456', password: 'parola123' }),
    ).toThrow();
    expect(() =>
      verifyEmailSchema.parse({
        email: 'user@example.com',
        code: '123456',
        emailVerified: true,
      }),
    ).toThrow();
  });
});

describe('forgotPasswordSchema', () => {
  it('yalnizca e-posta kabul eder', () => {
    expect(forgotPasswordSchema.parse({ email: 'user@example.com' })).toEqual({
      email: 'user@example.com',
    });
  });

  it('kimlik/parola alani KABUL ETMEZ (strict)', () => {
    expect(() =>
      forgotPasswordSchema.parse({ email: 'user@example.com', password: 'parola123' }),
    ).toThrow();
  });
});

describe('resetPasswordSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    expect(
      resetPasswordSchema.parse({ email: 'user@example.com', code: '123456', password: 'parola123' }),
    ).toEqual({ email: 'user@example.com', code: '123456', password: 'parola123' });
  });

  it('6 haneli olmayan kodu reddeder', () => {
    expect(() =>
      resetPasswordSchema.parse({ email: 'user@example.com', code: 'abc', password: 'parola123' }),
    ).toThrow();
  });

  it('parola politikasini BURADA yakalamaz (o domain in isi)', () => {
    // 'kisa1' politikaya aykiridir ama Zod gecirir; tek dogruluk kaynagi
    // password-policy.ts'tir ve 422'yi o uretir.
    expect(() =>
      resetPasswordSchema.parse({ email: 'user@example.com', code: '123456', password: 'kisa1' }),
    ).not.toThrow();
  });

  it('tanimsiz alani reddeder (strict)', () => {
    expect(() =>
      resetPasswordSchema.parse({
        email: 'user@example.com',
        code: '123456',
        password: 'parola123',
        userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
      }),
    ).toThrow();
  });
});

describe('changePasswordSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    expect(
      changePasswordSchema.parse({ currentPassword: 'eskiparola1', newPassword: 'yeniparola9' }),
    ).toEqual({ currentPassword: 'eskiparola1', newPassword: 'yeniparola9' });
  });

  it('KIMLIK alani KABUL ETMEZ — userId/email token dan gelir (strict)', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'eskiparola1',
        newPassword: 'yeniparola9',
        userId: '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c',
      }),
    ).toThrow();
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'eskiparola1',
        newPassword: 'yeniparola9',
        email: 'user@example.com',
      }),
    ).toThrow();
  });

  it('"yeni parola tekrar" alanini KABUL ETMEZ — o bir arayuz dogrulamasidir', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'eskiparola1',
        newPassword: 'yeniparola9',
        newPasswordConfirmation: 'yeniparola9',
      }),
    ).toThrow();
  });

  it('bos parolayi reddeder', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: '', newPassword: 'yeniparola9' }),
    ).toThrow();
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'eskiparola1', newPassword: '' }),
    ).toThrow();
  });

  it('yeni parola politikasini BURADA yakalamaz (o domain in isi)', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'eskiparola1', newPassword: 'kisa1' }),
    ).not.toThrow();
  });
});
