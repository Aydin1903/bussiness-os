import { z } from 'zod';

/**
 * Ortam degiskenlerinin tek dogruluk kaynagi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 * Ortam degiskenleri de dis veridir — process.env tamami `string | undefined`
 * tipindedir ve TypeScript burada hicbir guvence vermez.
 *
 * Dogrulama uygulama acilisinda yapilir ve basarisiz olursa surec BASLAMAZ.
 * Yarim yapilandirilmis calisan bir uygulama, hic acilmayandan tehlikelidir:
 * hatayi deploy aninda degil, ilk musteri istegi geldiginde gosterir.
 */

/**
 * "true"/"false" metnini boolean'a cevirir.
 *
 * z.coerce.boolean() burada KULLANILAMAZ: Boolean("false") === true oldugu icin
 * ozelligi kapatmak isteyen herkes yanlislikla acmis olur.
 */
const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const postgresUrl = z
  .url()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL postgres:// veya postgresql:// ile baslamalidir',
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  /** Health cevabinda ve loglarda raporlanir. */
  APP_VERSION: z.string().min(1).default('0.1.0'),

  /**
   * Uygulama runtime'i businessos_app rolu ile baglanir (ARCHITECTURE 3.3).
   * Migration'lar ayri bir URL ve businessos_owner rolu kullanir.
   */
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: booleanFromEnv.default(false),

  /** Virgulle ayrilmis origin listesi. Bos ise CORS kapalidir. */
  CORS_ORIGINS: z.string().default(''),

  /**
   * Varsayilan KAPALI (fail-closed).
   *
   * API yuzeyini kimlik dogrulamasiz ifsa etmek gereksiz bir kesif yuzeyidir.
   * Varsayilanin acik olmasi, ortam degiskeni unutulan HER ortami — production
   * dahil — ifsa eder. Kapali varsayilanda ise en fazla gelistiricinin dokumani
   * gormemesi olur: yanlis gittiginde bedeli kucuk olan yon budur.
   *
   * Gelistirmede acikca .env icinde acilir.
   */
  SWAGGER_ENABLED: booleanFromEnv.default(false),
});

export type Env = z.infer<typeof envSchema>;
