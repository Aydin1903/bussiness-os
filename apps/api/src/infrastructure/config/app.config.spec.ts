import { describe, expect, it } from 'vitest';

import { createAppConfig } from './app.config';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://businessos_app:secret@localhost:5432/business_os',

  // Identity sirlari — VARSAYILANI YOKTUR (ADR-0019, ADR-0020), bu yuzden
  // gecerli her fixture'da bulunmak zorundadir. Degerler test icindir.
  JWT_ISSUER: 'https://api.businessos.test',
  JWT_AUDIENCE: 'businessos-api',
  JWT_SIGNING_KID: 'test-1',
  JWT_PRIVATE_KEY: 'dGVzdC1wcml2YXRlLWtleQ==',
  JWT_PUBLIC_KEY: 'dGVzdC1wdWJsaWMta2V5',
  VERIFICATION_CODE_PEPPER: 'test-pepper-at-least-16',
} as const;

/**
 * Uretim fixture'i. Uretimde SAHTE hicbir saglayici kabul edilmez, bu yuzden
 * uretimi konu alan her test ucunu birden gercek saglayiciya ayarlamak
 * zorundadir:
 *   - `EMAIL_PROVIDER=console` -> dogrulama kodunu loglar (P1 · sir sizintisi)
 *   - `EMBEDDING_PROVIDER=fake` / `LLM_PROVIDER=fake` -> sir sizdirmaz ama
 *     urunu SESSIZCE islevsiz kilar
 */
const productionEnv = {
  ...validEnv,
  NODE_ENV: 'production',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_live',
  EMAIL_FROM: 'no-reply@example.com',
  EMBEDDING_PROVIDER: 'openai',
  OPENAI_API_KEY: 'sk-live',
  LLM_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'sk-live',
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

  it('JWT ozel anahtari eksikse uygulamayi baslatmaz', () => {
    // Sirlarin VARSAYILANI YOKTUR: varsayilani olan bir sir, o degiskeni unutan
    // her ortamda ayni (ve herkesce bilinen) sirdir (ADR-0020).
    const { JWT_PRIVATE_KEY: _omitted, ...withoutKey } = validEnv;

    expect(() => createAppConfig(withoutKey)).toThrow(/JWT_PRIVATE_KEY/);
  });

  it('cok kisa dogrulama kodu pepper ini reddeder', () => {
    expect(() => createAppConfig({ ...validEnv, VERIFICATION_CODE_PEPPER: 'kisa' })).toThrow(
      /VERIFICATION_CODE_PEPPER/,
    );
  });

  it('Identity sirlarini yapilandirmaya tasir', () => {
    const config = createAppConfig({ ...validEnv });

    expect(config.auth.jwt.signingKid).toBe('test-1');
    expect(config.auth.jwt.issuer).toBe('https://api.businessos.test');
    expect(config.auth.verificationCodePepper).toBe('test-pepper-at-least-16');
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
      const config = createAppConfig({ ...productionEnv });

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

  describe('outbox tuketicisi', () => {
    // Swagger'in TERSI yonde varsayilan — ve bu bilincli: relay kapaliyken
    // hicbir sey patlamaz, kullanicilar yalnizca kodlarini hic almaz. Sessiz
    // teslimatsizlik, bir gelistiricinin dokumani gormemesinden pahalidir.
    it('belirtilmediginde ACIK olur', () => {
      const config = createAppConfig({ ...validEnv });

      expect(config.outboxRelay.enabled).toBe(true);
    });

    it('acikca kapatilabilir (testler bunu kullanir)', () => {
      const config = createAppConfig({ ...validEnv, OUTBOX_RELAY_ENABLED: 'false' });

      expect(config.outboxRelay.enabled).toBe(false);
    });

    it('varsayilan aralik ve batch boyutunu tasir', () => {
      const config = createAppConfig({ ...validEnv });

      expect(config.outboxRelay.intervalMs).toBe(5_000);
      expect(config.outboxRelay.batchSize).toBe(20);
    });

    it('absurt batch boyutunu reddeder — kilit turu boyunca tutulur', () => {
      expect(() => createAppConfig({ ...validEnv, OUTBOX_RELAY_BATCH_SIZE: '5000' })).toThrow();
    });
  });

  describe('e-posta saglayicisi', () => {
    it('belirtilmediginde console olur', () => {
      const config = createAppConfig({ ...validEnv });

      // Kazara gercek e-posta gondermek, gondermemekten pahalidir.
      expect(config.email.provider).toBe('console');
    });

    it('resend secildiginde anahtar ve gonderen ZORUNLUDUR', () => {
      expect(() => createAppConfig({ ...validEnv, EMAIL_PROVIDER: 'resend' })).toThrow(
        /RESEND_API_KEY/,
      );
    });

    it('resend secildiginde EMAIL_FROM da zorunludur', () => {
      expect(() =>
        createAppConfig({ ...validEnv, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }),
      ).toThrow(/EMAIL_FROM/);
    });

    it('BOS anahtari eksik sayar', () => {
      expect(() =>
        createAppConfig({
          ...validEnv,
          EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: '   ',
          EMAIL_FROM: 'no-reply@example.com',
        }),
      ).toThrow(/RESEND_API_KEY/);
    });

    it('tam yapilandirmayi kabul eder', () => {
      const config = createAppConfig({
        ...validEnv,
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'no-reply@example.com',
      });

      expect(config.email).toEqual({
        provider: 'resend',
        resendApiKey: 're_test',
        from: 'no-reply@example.com',
      });
    });

    it('URETIMDE console adapter i REDDEDER', () => {
      // Konsol adapter'i dogrulama kodunu loglar; uretimde P1 ihlalidir.
      // Wiring'e birakmak, hatanin ilk e-posta gonderilene kadar gizli
      // kalmasi demekti.
      expect(() =>
        createAppConfig({ ...validEnv, NODE_ENV: 'production', EMAIL_PROVIDER: 'console' }),
      ).toThrow(/EMAIL_PROVIDER/);
    });

    it('uretimde resend kabul edilir', () => {
      const config = createAppConfig({ ...productionEnv });

      expect(config.email.provider).toBe('resend');
    });

    it('bilinmeyen saglayiciyi reddeder', () => {
      expect(() => createAppConfig({ ...validEnv, EMAIL_PROVIDER: 'smtp' })).toThrow();
    });
  });

  // --- Uretimde sahte AI saglayicilari ------------------------------------

  describe('AI saglayicilari', () => {
    it('gelistirmede fake VARSAYILANDIR', () => {
      // Anahtarsiz bir makinede `pnpm dev` ve `pnpm test` calismali.
      const config = createAppConfig({ ...validEnv });

      expect(config.embedding.provider).toBe('fake');
      expect(config.llm.provider).toBe('fake');
    });

    it('URETIMDE fake embedding i REDDEDER', () => {
      // Sir sizdirmaz — daha sinsi: arama CALISIYOR gorunur, sonuclari
      // anlamsizdir. Sessiz islevsizlik, acilista patlamaktan kotudur.
      expect(() => createAppConfig({ ...productionEnv, EMBEDDING_PROVIDER: 'fake' })).toThrow(
        /EMBEDDING_PROVIDER/,
      );
    });

    it('URETIMDE fake LLM i REDDEDER', () => {
      expect(() => createAppConfig({ ...productionEnv, LLM_PROVIDER: 'fake' })).toThrow(
        /LLM_PROVIDER/,
      );
    });

    it('uretimde gercek saglayicilar kabul edilir', () => {
      const config = createAppConfig({ ...productionEnv });

      expect(config.embedding.provider).toBe('openai');
      expect(config.llm.provider).toBe('deepseek');
    });
  });
});
