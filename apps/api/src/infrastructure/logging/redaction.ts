/**
 * Log maskeleme kurallari.
 *
 * DEVELOPMENT_RULES 8: log'lara PII, token, parola veya prompt icerigi yazilmaz.
 * ARCHITECTURE 8.3: prompt'lar tenant verisi tasir, loglanmalari sizinti riskidir.
 *
 * Maskeleme opt-out degil OPT-IN olmalidir; yani yeni bir hassas alan eklendiginde
 * buraya eklenmesi unutulursa sizar. Bu listeyi genisletmek bir review konusudur.
 */
export const REDACTED_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',

  // Govde alanlari — kimlik dogrulama ve AI katmani icin.
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.prompt',
  '*.completion',
];

export const REDACTION_PLACEHOLDER = '[REDACTED]';
