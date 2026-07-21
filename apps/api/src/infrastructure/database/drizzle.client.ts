import { Logger } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { AppConfig } from '../config/app.config';
import * as schema from './schema';

/** Uygulamanin veritabani istemcisi. Repository'ler bu tipi enjekte eder. */
export type DatabaseClient = NodePgDatabase<typeof schema>;

const poolLogger = new Logger('DatabasePool');

/** DI token'lari. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const DATABASE_POOL = Symbol('DATABASE_POOL');
export const DATABASE = Symbol('DATABASE');

/**
 * Baglanti havuzunu olusturur.
 *
 * Havuz, ARCHITECTURE 3.3 geregi businessos_app rolu ile baglanir: bu rol
 * hicbir tablonun sahibi degildir, dolayisiyla Faz 2'de devreye girecek RLS
 * politikalarini bypass EDEMEZ. Migration'lar ayri bir rol ve ayri bir surec
 * (drizzle-kit) tarafindan calistirilir.
 */
export function createPool(config: AppConfig): Pool {
  const pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolMax,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    // Bosta bekleyen baglanti, veritabani tarafinda sessizce kapatilmis olabilir;
    // makul bir sure sonra biz kapatiriz ki olu baglanti havuzda birikmesin.
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  });

  // ZORUNLU: pg havuzu, bosta bekleyen bir baglanti sunucu tarafindan
  // koparildiginda 'error' olayi yayar (veritabani yeniden baslatma, failover,
  // idle timeout). Bu olay DINLENMEZSE Node surecin tamamini oldurur —
  // yani veritabaninin bir saniyeligine yeniden baslamasi API'yi de dusurur.
  //
  // Havuz kopan baglantiyi kendisi atar ve bir sonraki istekte yenisini acar;
  // burada yapilmasi gereken hatayi yutmak degil, KAYDEDIP ayakta kalmaktir.
  pool.on('error', (error: Error) => {
    poolLogger.error({ err: error }, 'Bosta bekleyen veritabani baglantisi hata verdi');
  });

  return pool;
}

export function createDrizzle(pool: Pool): DatabaseClient {
  return drizzle(pool, { schema });
}
