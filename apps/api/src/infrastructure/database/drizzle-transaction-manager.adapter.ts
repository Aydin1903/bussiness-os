import { Inject, Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { TransactionManager } from '../../shared/transaction-manager.port';
import { DATABASE_POOL } from './drizzle.client';
import * as schema from './schema';
import { hasActiveTransaction, runWithTransaction } from './transaction-context';

/** Tenant context'inin tasindigi PostgreSQL oturum degiskeni. */
const TENANT_SETTING = 'app.current_tenant_id';

/**
 * `TransactionManager` port'unun PostgreSQL implementasyonu.
 *
 * MULTI_TENANT_ARCHITECTURE 11.3'un calisan karsiligi: havuzdan baglanti al ->
 * BEGIN -> (tenant'li ise) SET LOCAL -> isi calistir -> COMMIT/ROLLBACK ->
 * baglantiyi birak.
 */
@Injectable()
export class DrizzleTransactionManager implements TransactionManager {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** Tenant context'i KURMAZ. Yalnizca context'in henuz olmadigi akislar icin. */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.#run(null, fn);
  }

  runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.#run(tenantId, fn);
  }

  async #run<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
    // Ic ice transaction SESSIZCE kabul edilmez. PostgreSQL ic ice BEGIN'i
    // yok sayar; dis transaction geri alinirsa "basarili" sanilan ic is de
    // geri gider ve bu, en zor bulunan tutarsizlik turudur. Ustelik ic cagri
    // farkli bir tenant id'si verirse hangi context'in gecerli oldugu belirsizlesir.
    if (hasActiveTransaction()) {
      throw new Error(
        'Ic ice transaction acilamaz. Transaction siniri use case katmanindadir ' +
          '(MULTI_TENANT_ARCHITECTURE 13.3 kural 2).',
      );
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (tenantId !== null) {
        // set_config(..., is_local => true) === SET LOCAL, ama PARAMETRELI.
        // SET LOCAL sozdizimi parametre kabul etmez; string birlestirme ise
        // DEVELOPMENT_RULES 8 geregi yasaktir (SQL injection RLS'i de deler).
        //
        // is_local = true KRITIK: transaction bitince deger otomatik temizlenir.
        // Kalici olsaydi havuza donen baglantida onceki tenant'in kimligi kalir
        // ve bir sonraki istek YANLIS TENANT'IN verisini gorurdu.
        await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, tenantId]);
      }

      const result = await runWithTransaction(
        { db: drizzle(client, { schema }), tenantId },
        fn,
      );

      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Baglanti HER DURUMDA havuza doner. Birakilmazsa havuz tukenir ve
      // uygulama sessizce kilitlenir.
      client.release();
    }
  }
}
