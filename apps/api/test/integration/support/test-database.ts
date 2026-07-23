import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './database-roles';

/**
 * Migration'lari uygulanmis, uygulama rolu hazir bir test veritabani acar.
 *
 * KRITIK: `appPool` uygulamanin gercekte kullandigi `businessos_app` rolu ile
 * baglanir. Container'in varsayilan kullanicisi superuser ve tablo sahibidir;
 * onunla yapilan bir RLS testi HER ZAMAN YESIL YANAR ve hicbir sey kanitlamaz.
 */
export interface TestDatabase {
  readonly container: StartedPostgreSqlContainer;
  /** Tablolarin sahibi. Yalnizca kurulum ve dogrulama icin. */
  readonly ownerPool: Pool;
  /** Uygulamanin havuzu — RLS'e TABI. Adapter'lar bunu kullanir. */
  readonly appPool: Pool;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerPool = new Pool({ connectionString: container.getConnectionUri() });

  // Sira onemli: rol ONCE olusturulur, migration SONRA calisir — migration
  // rol mevcutsa ona yetki verir.
  await createApplicationRole(ownerPool, container.getDatabase());
  await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

  const appPool = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: APP_ROLE,
    password: APP_PASSWORD,
  });

  return {
    container,
    ownerPool,
    appPool,
    async stop(): Promise<void> {
      await appPool.end();
      await ownerPool.end();
      await container.stop();
    },
  };
}

/** Testler arasi temizlik. Sahip rolle calisir; RLS'e takilmaz. */
export async function truncateTenantTables(ownerPool: Pool): Promise<void> {
  await ownerPool.query('TRUNCATE platform.memberships, platform.tenants CASCADE');
}

/** Identity tablolarini temizler. FK sirasi CASCADE ile halledilir. */
export async function truncateIdentityTables(ownerPool: Pool): Promise<void> {
  await ownerPool.query(
    'TRUNCATE platform.login_attempts, platform.refresh_tokens, platform.token_families, ' +
      'platform.email_verification_codes, platform.credentials, platform.users, ' +
      'platform.identity_outbox, platform.verification_code_requests CASCADE',
  );
}
