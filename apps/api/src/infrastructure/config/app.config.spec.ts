import { describe, expect, it } from 'vitest';

import { createAppConfig } from './app.config';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://businessos_app:secret@localhost:5432/business_os',
} as const;

describe('createAppConfig', () => {
  it('zorunlu degiskenler verildiginde yapilandirmayi uretir', () => {
    const config = createAppConfig({ ...validEnv });

    expect(config.env).toBe('development');
    expect(config.database.url).toBe(validEnv.DATABASE_URL);
  });

  it('belirtilmeyen degiskenler icin varsayilanlari uygular', () => {
    const config = createAppConfig({ ...validEnv });

    expect(config.port).toBe(3001);
    expect(config.logging.level).toBe('info');
    expect(config.database.poolMax).toBe(10);
  });

  it('DATABASE_URL eksikse uygulamayi baslatmaz', () => {
    expect(() => createAppConfig({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });

  it('postgres olmayan bir DATABASE_URL kabul etmez', () => {
    expect(() =>
      createAppConfig({ ...validEnv, DATABASE_URL: 'mysql://localhost:3306/db' }),
    ).toThrow(/postgres/);
  });

  it('gecersiz NODE_ENV degerini reddeder', () => {
    expect(() => createAppConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('PORT sayiya cevrilemiyorsa reddeder', () => {
    expect(() => createAppConfig({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });

  // Bu test bir guvenlik davranisini korur: yapilandirma hatasi mesaji, hatali
  // degiskenin DEGERINI icermemelidir. Aksi halde parola tasiyan bir baglanti
  // dizesi acilis log'una duser.
  it('hata mesajinda degisken degerini sizdirmaz', () => {
    const secretUrl = 'mysql://admin:SUPER_SECRET_PASSWORD@localhost:3306/db';

    let message = '';
    try {
      createAppConfig({ ...validEnv, DATABASE_URL: secretUrl });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBe('');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('SUPER_SECRET_PASSWORD');
  });

  describe('boolean ortam degiskenleri', () => {
    // z.coerce.boolean() kullanilsaydi Boolean("false") === true oldugu icin
    // bu test kirmizi yanardi. Testin varlik sebebi budur.
    it('"false" metnini false olarak okur', () => {
      const config = createAppConfig({ ...validEnv, SWAGGER_ENABLED: 'false' });

      expect(config.swagger.enabled).toBe(false);
    });

    it('"true" metnini true olarak okur', () => {
      const config = createAppConfig({ ...validEnv, LOG_PRETTY: 'true' });

      expect(config.logging.pretty).toBe(true);
    });

    it('boolean olmayan bir metni reddeder', () => {
      expect(() => createAppConfig({ ...validEnv, LOG_PRETTY: 'evet' })).toThrow(/LOG_PRETTY/);
    });

    // Guvenlik davranisi (fail-closed). Bu testin varlik sebebi somut bir hatadir:
    // varsayilan acik birakilmisti, yani ortam degiskenini unutan HER ortam —
    // production dahil — API yuzeyini kimlik dogrulamasiz ifsa ediyordu.
    it('SWAGGER_ENABLED belirtilmediginde KAPALI olur', () => {
      const config = createAppConfig({ ...validEnv });

      expect(config.swagger.enabled).toBe(false);
    });

    it('SWAGGER_ENABLED production ortaminda da varsayilan olarak kapalidir', () => {
      const config = createAppConfig({ ...validEnv, NODE_ENV: 'production' });

      expect(config.swagger.enabled).toBe(false);
    });

    it('SWAGGER_ENABLED yalnizca acikca acildiginda etkinlesir', () => {
      const config = createAppConfig({ ...validEnv, SWAGGER_ENABLED: 'true' });

      expect(config.swagger.enabled).toBe(true);
    });
  });

  describe('CORS origin listesi', () => {
    it('virgulle ayrilmis listeyi ayristirir ve bosluklari temizler', () => {
      const config = createAppConfig({
        ...validEnv,
        CORS_ORIGINS: 'http://localhost:3000, https://app.businessos.com',
      });

      expect(config.http.corsOrigins).toEqual([
        'http://localhost:3000',
        'https://app.businessos.com',
      ]);
    });

    it('tanimsizsa bos liste dondurur — CORS kapali', () => {
      const config = createAppConfig({ ...validEnv });

      expect(config.http.corsOrigins).toEqual([]);
    });
  });
});
