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
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
    },
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
