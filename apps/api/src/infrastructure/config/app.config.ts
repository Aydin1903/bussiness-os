import type { ZodError } from 'zod';

import { envSchema, type Env } from './env.schema';

/**
 * Uygulamanin dogrulanmis yapilandirmasi.
 *
 * Kod hicbir yerde process.env okumaz; bu nesneyi enjekte eder. Boylece
 * yapilandirma test edilebilir hale gelir ve "bu degisken nereden geliyor"
 * sorusunun tek bir cevabi olur (ESLint no-restricted-properties ile zorlanir).
 */
export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly port: number;
  readonly version: string;

  readonly database: {
    readonly url: string;
    readonly poolMax: number;
    readonly connectionTimeoutMs: number;
  };

  readonly logging: {
    readonly level: Env['LOG_LEVEL'];
    readonly pretty: boolean;
  };

  readonly http: {
    readonly corsOrigins: readonly string[];
  };

  readonly swagger: {
    readonly enabled: boolean;
  };

  /**
   * Identity sirlari (ADR-0019, ADR-0020).
   *
   * Anahtarlar base64(PEM) olarak tasinir ve KULLANILDIGI yerde (IdentityModule
   * factory'si) `jose` ile CryptoKey'e cevrilir — config saf veri kalir.
   */
  readonly auth: {
    readonly jwt: {
      readonly issuer: string;
      readonly audience: string;
      readonly signingKid: string;
      readonly privateKeyBase64: string;
      readonly publicKeyBase64: string;
    };
    readonly verificationCodePepper: string;
  };

  /** Identity outbox tuketicisinin zamanlamasi (ADR-0006). */
  readonly outboxRelay: {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly batchSize: number;
  };

  /** E-posta saglayicisi secimi ve kimlik bilgileri (ARCHITECTURE 9.3). */
  readonly email: {
    readonly provider: 'console' | 'resend';
    /** Yalnizca `provider === 'resend'` iken dolu (env semasi zorlar). */
    readonly resendApiKey: string;
    readonly from: string;
  };

  /** Embedding saglayicisi secimi ve kimlik bilgileri (ADR-0029 §3). */
  readonly embedding: {
    readonly provider: 'fake' | 'openai';
    /** Yalnizca `provider === 'openai'` iken dolu (env semasi zorlar). */
    readonly openAiApiKey: string;
    readonly model: string;
  };
}

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Ham ortam degiskenlerini dogrular ve uygulama yapilandirmasina donusturur.
 *
 * @throws Dogrulama basarisiz olursa okunabilir bir hata ile — surec baslamaz.
 */
export function createAppConfig(source: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(formatEnvErrors(parsed.error));
  }

  const env = parsed.data;

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    version: env.APP_VERSION,
    database: toDatabaseConfig(env),
    logging: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
    },
    http: {
      corsOrigins: parseOrigins(env.CORS_ORIGINS),
    },
    swagger: {
      enabled: env.SWAGGER_ENABLED,
    },
    auth: toAuthConfig(env),
    outboxRelay: toOutboxRelayConfig(env),
    email: toEmailConfig(env),
    embedding: toEmbeddingConfig(env),
  };
}

/** Veritabani baglantisi. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toDatabaseConfig(env: Env): AppConfig['database'] {
  return {
    url: env.DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
    connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
  };
}

/**
 * E-posta saglayicisi. Deger DONUSTURMEZ; yalnizca eslestirir.
 *
 * `?? ''`: sema `resend` secildiginde bu alanlari ZORUNLU kilar, dolayisiyla
 * bos string yalnizca `console` modunda olusabilir — o modda da hic okunmaz.
 */
function toEmailConfig(env: Env): AppConfig['email'] {
  return {
    provider: env.EMAIL_PROVIDER,
    resendApiKey: env.RESEND_API_KEY ?? '',
    from: env.EMAIL_FROM ?? '',
  };
}

/**
 * Embedding saglayicisi. `??  ''`: anahtar yalnizca `fake` modunda bos olabilir
 * — o modda da hic okunmaz (`toEmailConfig` ile ayni disiplin).
 */
function toEmbeddingConfig(env: Env): AppConfig['embedding'] {
  return {
    provider: env.EMBEDDING_PROVIDER,
    openAiApiKey: env.OPENAI_API_KEY ?? '',
    model: env.OPENAI_EMBEDDING_MODEL,
  };
}

/** Outbox tuketicisinin zamanlamasi. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toOutboxRelayConfig(env: Env): AppConfig['outboxRelay'] {
  return {
    enabled: env.OUTBOX_RELAY_ENABLED,
    intervalMs: env.OUTBOX_RELAY_INTERVAL_MS,
    batchSize: env.OUTBOX_RELAY_BATCH_SIZE,
  };
}

/** Identity sirlarini yapilandirmaya tasir. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toAuthConfig(env: Env): AppConfig['auth'] {
  return {
    jwt: {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      signingKid: env.JWT_SIGNING_KID,
      privateKeyBase64: env.JWT_PRIVATE_KEY,
      publicKeyBase64: env.JWT_PUBLIC_KEY,
    },
    verificationCodePepper: env.VERIFICATION_CODE_PEPPER,
  };
}

/**
 * Hata mesaji degiskeni adiyla listeler ama DEGERINI yazmaz —
 * yapilandirma hatasi log'a parola sizdirmanin klasik yoludur.
 */
function formatEnvErrors(error: ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path === '' ? '(kok)' : path}: ${issue.message}`;
  });

  return ['Ortam degiskeni dogrulamasi basarisiz:', ...lines].join('\n');
}

function parseOrigins(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
