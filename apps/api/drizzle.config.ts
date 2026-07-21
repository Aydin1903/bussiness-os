import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

// drizzle-kit uygulamanin DI kapsayicisi disinda calisir; .env'i kendisi yukler.
// Node 24 yerlesik loadEnvFile kullanildi — ek bir dotenv bagimliligi gerekmiyor.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/**
 * Migration'lar businessos_owner rolu ile calisir (DDL yetkisi olan tek rol).
 * Uygulama runtime'i bu URL'i ASLA gormez; o businessos_app ile baglanir.
 * ARCHITECTURE 3.3: bu ayrim RLS'in calisabilmesinin on kosuludur.
 */
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (migrationUrl === undefined || migrationUrl === '') {
  throw new Error(
    'DATABASE_MIGRATION_URL tanimli degil. businessos_owner rolunun baglanti dizesi gereklidir.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: migrationUrl },
  // Migration gecmisi kendi schema'sinda tutulur; is schema'larini kirletmez.
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
