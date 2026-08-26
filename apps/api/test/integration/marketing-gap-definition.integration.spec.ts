import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleMarketingRepository } from '../../src/modules/marketing/infrastructure/drizzle-marketing.repository';
import { runWithTransaction } from '../../src/infrastructure/database/transaction-context';
import { createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * ⚠️ "BOSLUK" TANIMININ TEK OLDUGUNU KILITLEYEN TEST.
 *
 * ============================================================================
 * ⚠️ BU DOSYA BIR RISKI KAPATMAK ICIN VAR
 * ============================================================================
 * ADR-0047'nin kapanis denetimi su siniri kaydetmisti:
 *
 *   _"BOSLUK TANIMI IKI YERDE YAZILI — sunucuda `gapSnapshot`, arayuzde
 *   `hasResultGap`. Ikisi SENKRON kalmak zorundadir; ayrisirsa ekran bir sey
 *   der, `/ask` baska bir sey sayar ve fark SESSIZ olur."_
 *
 * Risk **tanimi tekillestirerek** kapatildi: arayuzdeki `hasResultGap`
 * SILINDI ve ekran artik sunucunun turettigi `resultGap` bayragini okuyor.
 *
 * ⚠️ Ama tekillestirme TEK BASINA yetmez — sunucuda hala UC TUKETICI var ve
 * ucu de ayni SQL ifadesini (`resultGapExpression`) kullanmak ZORUNDA:
 *
 *   1. `gapSnapshot`      -> `campaign-gap` katkicisi (`POST /ask` havuzu)
 *   2. `summarize`        -> duvarin `missingResultCount` uydusu
 *   3. satir projeksiyonu -> her kampanyanin `resultGap` bayragi (ekran)
 *
 * ⚠️ Biri digerinden AYRISTIGI gun hata SESSIZ olurdu: uc sayi da doner,
 * hicbiri patlamaz, yalnizca birbirini tutmaz. Bu test ucunu AYNI VERIYLE
 * kosturup **birebir esit** olduklarini dogrular.
 * ============================================================================
 */

const TENANT = '01994800-0000-7000-8000-0f0000000001';
const USER = '01994800-0000-7000-8000-0f0000000002';

/**
 * Bugun ve gecmis — ⚠️ SABIT TARIH YAZILMAZ.
 *
 * Sabit bir tarih bugun "suresi dolmus" olan bir kampanyayi uc ay sonra
 * BASKA bir sinifa sokardi ve test sessizce anlamini yitirirdi
 * (`today.ts`in ayni tuzagi).
 */
function day(offset: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

describe('⚠️ "bosluk" tanimi TEK — uc tuketici AYNI kumeyi sayar (ADR-0047)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  const repository = new DrizzleMarketingRepository();

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await createApplicationRole(ownerPool, container.getDatabase());
    await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-mkt-gap', 'Gap Tenant', 'active', $2)`,
      [TENANT, USER],
    );
  }, 180_000);

  afterAll(async () => {
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('DELETE FROM marketing.campaigns WHERE tenant_id = $1', [TENANT]);
  });

  /**
   * Kampanya yazar. ⚠️ Kume BILEREK her sinifi kapsiyor — testin degeri,
   * SINIR DURUMLARINDA da uc tuketicinin ayni cevabi vermesidir.
   */
  async function seed(): Promise<void> {
    const rows: readonly [string, string, string | null, string, string | null][] = [
      // [id-son-hane, status, endsOn, ad, resultNote]
      ['01', 'done', day(-10), 'Bitmis, sonucu YOK -> BOSLUK', null],
      ['02', 'done', day(-8), 'Bitmis, sonucu VAR -> bosluk degil', 'Sonuc yazildi'],
      // ⚠️ IKINCI DAL: takvimde suresi dolmus ama hala `active`
      ['03', 'active', day(-3), 'Suresi dolmus ama YAYINDA -> BOSLUK', null],
      ['04', 'active', day(-3), 'Suresi dolmus, sonucu VAR -> bosluk degil', 'Kapatildi'],
      // Suren kampanya — bitmedi, bosluk olamaz
      ['05', 'active', day(30), 'Suruyor -> bosluk degil', null],
      // ⚠️ SURESIZ: bitisi olmayan bir kampanya "gecikmis" olamaz
      ['06', 'active', null, 'Suresiz -> bosluk degil', null],
      // Taslak — henuz baslamadi
      ['07', 'draft', day(-20), 'Taslak, tarihi gecmis -> bosluk degil', null],
      // ⚠️ SINIR: bitisi TAM BUGUN — `< today` oldugu icin bosluk DEGIL
      ['08', 'active', day(0), 'Bitisi BUGUN -> bosluk degil', null],
    ];

    for (const [suffix, status, endsOn, name, resultNote] of rows) {
      await ownerPool.query(
        `INSERT INTO marketing.campaigns
           (id, tenant_id, name, starts_on, ends_on, status, result_note, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `01994800-0000-7000-8000-0f00000000${suffix}`,
          TENANT,
          name,
          day(-60),
          endsOn,
          status,
          resultNote,
          USER,
        ],
      );
    }
  }

  /**
   * Repository'yi tenant baglaminda kosar.
   *
   * ⚠️ `SET LOCAL app.current_tenant_id` SART: `marketing.campaigns` `FORCE
   * RLS` tasir ve `businessos_owner` bile ondan MUAF DEGILDIR (MT §12.2).
   */
  async function inTenant<T>(work: () => Promise<T>): Promise<T> {
    const client = await ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT]);
      const result = await runWithTransaction({ db: drizzle(client), tenantId: TENANT }, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('UC TUKETICI DE AYNI KUMEYI sayar — katkici · duvar · satir bayragi', async () => {
    await seed();
    const today = day(0);

    const { gapSnapshot, summary, rows } = await inTenant(async () => ({
      // 1. `campaign-gap` katkicisinin gordugu
      gapSnapshot: await repository.gapSnapshot({ today, limit: 100 }),
      // 2. duvarin `missingResultCount` uydusu
      summary: await repository.summarize({ today, since: day(-30) }),
      // 3. her satirin `resultGap` bayragi (ekranin okudugu)
      rows: await repository.listCampaigns({ limit: 100, offset: 0, status: null, today }),
    }));

    const flagged = rows.items.filter((record) => record.resultGap);

    // ⚠️ ASIL IDDIA: uc sayi da BIREBIR esit.
    expect(gapSnapshot.gapCount).toBe(2);
    expect(summary.missingResultCount).toBe(2);
    expect(flagged).toHaveLength(2);

    // ⚠️ Ve ayni SATIRLAR — yalnizca sayilari degil, KIMLIKLERI de eslesiyor.
    const fromSnapshot = gapSnapshot.gaps.map((row) => row.id).sort();
    const fromRows = flagged.map((record) => record.campaign.toState().id).sort();
    expect(fromRows).toEqual(fromSnapshot);
  });

  it('⚠️ IKINCI DAL: takvimde suresi dolmus ama hala `active` olan da BOSLUKTUR', async () => {
    await seed();
    const today = day(0);

    const rows = await inTenant(() =>
      repository.listCampaigns({ limit: 100, offset: 0, status: null, today }),
    );

    const flaggedNames = rows.items
      .filter((record) => record.resultGap)
      .map((record) => record.campaign.toState().name);

    expect(flaggedNames).toContain('Suresi dolmus ama YAYINDA -> BOSLUK');
    expect(flaggedNames).toContain('Bitmis, sonucu YOK -> BOSLUK');
  });

  it('⚠️ SINIR DURUMLARI bosluk SAYILMAZ — suren · suresiz · taslak · bitisi BUGUN', async () => {
    await seed();
    const today = day(0);

    const rows = await inTenant(() =>
      repository.listCampaigns({ limit: 100, offset: 0, status: null, today }),
    );

    const notFlagged = rows.items
      .filter((record) => !record.resultGap)
      .map((record) => record.campaign.toState().name);

    // ⚠️ `ends_on = today` bosluk DEGILDIR: yuklem `< today` der, `<=` demez.
    // Bir kampanya bittigi GUN "sonucu yazilmadi" diye isaretlenmemelidir.
    expect(notFlagged).toContain('Bitisi BUGUN -> bosluk degil');
    expect(notFlagged).toContain('Suruyor -> bosluk degil');
    expect(notFlagged).toContain('Suresiz -> bosluk degil');
    expect(notFlagged).toContain('Taslak, tarihi gecmis -> bosluk degil');
    expect(notFlagged).toHaveLength(6);
  });

  it('bosluk YOKKEN uc tuketici de SIFIR der', async () => {
    const today = day(0);

    const { gapSnapshot, summary, rows } = await inTenant(async () => ({
      gapSnapshot: await repository.gapSnapshot({ today, limit: 100 }),
      summary: await repository.summarize({ today, since: day(-30) }),
      rows: await repository.listCampaigns({ limit: 100, offset: 0, status: null, today }),
    }));

    expect(gapSnapshot.gapCount).toBe(0);
    expect(summary.missingResultCount).toBe(0);
    expect(rows.items.filter((record) => record.resultGap)).toHaveLength(0);
  });
});
