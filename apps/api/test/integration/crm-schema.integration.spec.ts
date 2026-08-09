import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `crm` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0031 Slice 4).
 *
 * Slice 2'nin dersi burada BASTAN uygulaniyor: yeni bir tablo, dogrudan A<->B
 * izolasyon testi yazilmadan merge EDILMEZ. Bir CRM'de sizinti ozellikle
 * yikicidir — sizan sey musteri listesidir.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-00000000000b';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

describe('crm semasi (gercek PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await createApplicationRole(ownerPool, container.getDatabase());
    await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

    appPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: APP_ROLE,
      password: APP_PASSWORD,
    });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query(
      'TRUNCATE crm.interaction_chunks, crm.interactions, crm.opportunities, crm.contacts, crm.companies CASCADE',
    );
  });

  async function asTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function insertCompany(tenantId: string, name = 'Acme'): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
        id,
        tenantId,
        name,
      ]),
    );
    return id;
  }

  async function insertContact(tenantId: string, companyId: string): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO crm.contacts (id, tenant_id, company_id, full_name)
         VALUES ($1, $2, $3, 'Ayse Yilmaz')`,
        [id, tenantId, companyId],
      ),
    );
    return id;
  }

  async function insertOpportunity(
    tenantId: string,
    companyId: string,
    overrides: { stage?: string; followUp?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO crm.opportunities (id, tenant_id, company_id, title, stage, next_follow_up_on)
         VALUES ($1, $2, $3, 'Yillik sozlesme', $4, $5)`,
        [id, tenantId, companyId, overrides.stage ?? 'in_discussion', overrides.followUp ?? null],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('alti tablo crm semasinda olusturuldu', async () => {
      const rows = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'crm' ORDER BY table_name",
      );

      // ⚠️ `company_summaries` GECIKMELI eklendi: migration `0019` (ADR-0032,
      // commit `f564ecd`) tabloyu getirdi ama bu iddia "bes tablo" demeye devam
      // etti ve test o gunden beri kirmiziydi. Yeni bir tablo eklerken bu satir
      // da guncellenir — testin isi tam olarak semanin BEKLENEN sekilde
      // kalmasini zorlamaktir.
      expect(rows.rows.map((row) => row.table_name)).toEqual([
        'companies',
        'company_summaries',
        'contacts',
        'interaction_chunks',
        'interactions',
        'opportunities',
      ]);
    });

    it('sirket adi TEKIL DEGILDIR (ADR-0031 Slice 4 karari)', async () => {
      // Ayni isimli iki kayit MESRUDUR: ayni grubun iki sirketi, ayni adi
      // tasiyan farkli subeler. Bu test karari KAYIT ALTINA ALIR — biri
      // "UNIQUE ekleyelim" derse kirmizi yanar ve gerekceyi okur.
      await insertCompany(TENANT_A, 'Acme');
      await expect(insertCompany(TENANT_A, 'Acme')).resolves.toBeDefined();
    });

    it('BOS sirket adi reddedilir (veritabani seviyesinde)', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            TENANT_A,
            '   ',
          ]),
        ),
      ).rejects.toThrow(/companies_name_not_blank/);
    });

    it('kisi VAR OLMAYAN sirkete baglanamaz (FK)', async () => {
      await expect(insertContact(TENANT_A, randomUUID())).rejects.toThrow(/foreign key/i);
    });

    it('GECERSIZ asama veritabaninda REDDEDILIR', async () => {
      // `platform.rate_limits`ten FARKLI olarak burada numaralandiran CHECK
      // VARDIR: tablo modulun KENDISININDIR, kendi sozlugunu tasimasi mesru.
      const companyId = await insertCompany(TENANT_A);
      await expect(insertOpportunity(TENANT_A, companyId, { stage: 'arsivlendi' })).rejects.toThrow(
        /opportunities_stage_valid/,
      );
    });

    it('TUTAR varsa PARA BIRIMI zorunlu (veritabani seviyesinde)', async () => {
      const companyId = await insertCompany(TENANT_A);
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO crm.opportunities (id, tenant_id, company_id, title, estimated_value)
             VALUES ($1, $2, $3, 'Birimsiz tutar', 1000)`,
            [randomUUID(), TENANT_A, companyId],
          ),
        ),
      ).rejects.toThrow(/opportunities_currency_required_with_value/);
    });

    it('kisi silinince firsat OLMEZ, baglantisi kopar (SET NULL)', async () => {
      const companyId = await insertCompany(TENANT_A);
      const contactId = await insertContact(TENANT_A, companyId);
      const opportunityId = randomUUID();

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query(
          `INSERT INTO crm.opportunities (id, tenant_id, company_id, contact_id, title)
           VALUES ($1, $2, $3, $4, 'Sozlesme')`,
          [opportunityId, TENANT_A, companyId, contactId],
        );
        await client.query('DELETE FROM crm.contacts WHERE id = $1', [contactId]);

        // CASCADE olsaydi bir kisiyi silmek acik bir anlasmayi da silerdi —
        // silme niyetiyle orantisiz bir yikim.
        const result = await client.query<{ contact_id: string | null }>(
          'SELECT contact_id FROM crm.opportunities WHERE id = $1',
          [opportunityId],
        );
        return result.rows[0];
      });

      expect(remaining?.contact_id).toBeNull();
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('companies: tenant A, B nin sirketini GOREMEZ', async () => {
      await insertCompany(TENANT_A, 'A nin sirketi');
      await insertCompany(TENANT_B, 'B nin sirketi');

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ name: string }>('SELECT name FROM crm.companies');
        return result.rows;
      });

      expect(rows.map((row) => row.name)).toEqual(['A nin sirketi']);
    });

    it('contacts: tenant A, B nin kisisini GOREMEZ', async () => {
      const companyB = await insertCompany(TENANT_B);
      await insertContact(TENANT_B, companyB);

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ id: string }>('SELECT id FROM crm.contacts');
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('companies: BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('INSERT INTO crm.companies (id, tenant_id, name) VALUES ($1, $2, $3)', [
            randomUUID(),
            TENANT_B,
            'sizinti denemesi',
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('companies: tenant A, kendi kaydinin tenant_id sini TASIYAMAZ', async () => {
      await insertCompany(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE crm.companies SET tenant_id = $1', [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin kaydini SILEMEZ (silme de RLS e tabidir)', async () => {
      const companyB = await insertCompany(TENANT_B);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM crm.companies WHERE id = $1', [companyB]);
        return result.rowCount;
      });

      // Hata degil, SIFIR SATIR: RLS satiri gorunmez kilar, gorunmeyen satir
      // silinemez. Uygulama bunu 404'e cevirir.
      expect(deleted).toBe(0);
    });

    it('tenant context KURULMADAN sorgu HATA verir', async () => {
      // Sessiz bos sonuc bir CRM'de "musteri kaydi yok" gibi gorunur ve
      // kullanici veriyi kaybettigini sanar (MT §12.6 madde 4).
      for (const table of ['companies', 'contacts']) {
        await expect(
          appPool.query(`SELECT 1 FROM crm.${table}`),
          `crm.${table} context siz calismamali`,
        ).rejects.toThrow(/unrecognized configuration parameter|invalid input syntax/i);
      }
    });

    it('her iki tablo da ENABLE + FORCE tasiyor', async () => {
      for (const table of ['companies', 'contacts']) {
        const result = await ownerPool.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'crm' AND c.relname = $1`,
          [table],
        );

        expect(result.rows[0]?.relrowsecurity, `${table} ENABLE`).toBe(true);
        expect(result.rows[0]?.relforcerowsecurity, `${table} FORCE`).toBe(true);
      }
    });

    it('uygulama rolu crm tablolarinin SAHIBI degildir', async () => {
      // FORCE RLS sahibi de kapsar; ama sahiplik ayrica DDL yetkisi demektir.
      const result = await ownerPool.query<{ count: string }>(
        `SELECT count(*) AS count FROM pg_tables
         WHERE schemaname = 'crm' AND tableowner = $1`,
        [APP_ROLE],
      );

      expect(result.rows[0]?.count).toBe('0');
    });
  });

  describe('opportunities — RLS ve takipler (ADR-0031 §2, §3)', () => {
    it('tenant A, B nin firsatini GOREMEZ', async () => {
      const companyB = await insertCompany(TENANT_B);
      await insertOpportunity(TENANT_B, companyB);

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ id: string }>('SELECT id FROM crm.opportunities');
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('BASKA tenant adina firsat yazmak WITH CHECK ile reddedilir', async () => {
      const companyA = await insertCompany(TENANT_A);
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO crm.opportunities (id, tenant_id, company_id, title)
             VALUES ($1, $2, $3, 'sizinti')`,
            [randomUUID(), TENANT_B, companyA],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('ENABLE + FORCE tasir', async () => {
      const result = await ownerPool.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'crm' AND c.relname = 'opportunities'`,
      );

      expect(result.rows[0]?.relrowsecurity).toBe(true);
      expect(result.rows[0]?.relforcerowsecurity).toBe(true);
    });

    it('tenant context KURULMADAN sorgu HATA verir', async () => {
      await expect(appPool.query('SELECT 1 FROM crm.opportunities')).rejects.toThrow(
        /unrecognized configuration parameter|invalid input syntax/i,
      );
    });

    it('sirket silinince firsatlari da gider (CASCADE)', async () => {
      const companyId = await insertCompany(TENANT_A);
      await insertOpportunity(TENANT_A, companyId);

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query('DELETE FROM crm.companies WHERE id = $1', [companyId]);
        const result = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.opportunities',
        );
        return result.rows[0]?.count;
      });

      expect(remaining).toBe('0');
    });

    it('takipler sorgusu KAPANAN firsati DISLAR', async () => {
      const companyId = await insertCompany(TENANT_A);
      await insertOpportunity(TENANT_A, companyId, {
        stage: 'in_discussion',
        followUp: '2026-08-12',
      });
      await insertOpportunity(TENANT_A, companyId, { stage: 'won', followUp: '2026-08-11' });
      await insertOpportunity(TENANT_A, companyId, { stage: 'lost', followUp: '2026-08-10' });

      const rows = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ next_follow_up_on: string }>(
          `SELECT next_follow_up_on FROM crm.opportunities
           WHERE next_follow_up_on IS NOT NULL AND stage NOT IN ('won', 'lost')
           ORDER BY next_follow_up_on ASC, id ASC`,
        );
        return result.rows;
      });

      // Kapanan firsat listeden KENDILIGINDEN duser — elle silme isi yok.
      expect(rows).toHaveLength(1);
    });

    it('takipler icin KISMI index kuruldu (sorgu yuklemiyle birebir)', async () => {
      const result = await ownerPool.query<{ indexdef: string }>(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'opportunities_follow_up_idx'",
      );

      // Index yuklemi sorgunun yuklemiyle ayrisirsa index devre disi kalir.
      expect(result.rows[0]?.indexdef).toMatch(/WHERE.*next_follow_up_on IS NOT NULL/s);
      expect(result.rows[0]?.indexdef).toMatch(/won.*lost/s);
    });
  });

  describe('interactions + chunks (ADR-0031 §4)', () => {
    /** 1536 boyutlu sahte vektor — pgvector metin bicimini bekler. */
    function vector(): string {
      return `[${Array.from({ length: 1536 }, () => '0.1').join(',')}]`;
    }

    async function insertInteraction(tenantId: string, companyId: string): Promise<string> {
      const id = randomUUID();
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO crm.interactions
             (id, tenant_id, company_id, author_user_id, occurred_on, body)
           VALUES ($1, $2, $3, $4, '2026-08-12', 'Toplanti iyi gecti')`,
          [id, tenantId, companyId, USER_A],
        ),
      );
      return id;
    }

    async function insertChunk(tenantId: string, interactionId: string): Promise<void> {
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO crm.interaction_chunks
             (id, tenant_id, interaction_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, 0, '[Acme · 2026-08-12] Toplanti iyi gecti', $4)`,
          [randomUUID(), tenantId, interactionId, vector()],
        ),
      );
    }

    it('embedding index i gercekten HNSW (IVFFlat DEGIL)', async () => {
      const rows = await ownerPool.query<{ indexdef: string }>(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'interaction_chunks_embedding_idx'",
      );

      expect(rows.rows[0]?.indexdef).toMatch(/hnsw/i);
      // Operator eslesmezse index DEVRE DISI kalir ve sorgu tam tarama yapar.
      expect(rows.rows[0]?.indexdef).toMatch(/vector_cosine_ops/);
    });

    it('YANLIS boyutlu embedding veritabaninda REDDEDILIR', async () => {
      const companyId = await insertCompany(TENANT_A);
      const interactionId = await insertInteraction(TENANT_A, companyId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO crm.interaction_chunks
               (id, tenant_id, interaction_id, chunk_index, content, embedding)
             VALUES ($1, $2, $3, 0, 'kisa', '[0.1,0.2]')`,
            [randomUUID(), TENANT_A, interactionId],
          ),
        ),
      ).rejects.toThrow(/expected 1536 dimensions/i);
    });

    it('AYNI (interaction, chunk_index) IKI KEZ eklenemez — idempotency', async () => {
      const companyId = await insertCompany(TENANT_A);
      const interactionId = await insertInteraction(TENANT_A, companyId);
      await insertChunk(TENANT_A, interactionId);

      // Bu kisit ILK GUNDEN var; ADR-0029 onu migration 0011'de SONRADAN
      // ogrenmisti. Es zamanli iki onarimda ikincisi reddedilir, veri BOZULMAZ.
      await expect(insertChunk(TENANT_A, interactionId)).rejects.toThrow(
        /interaction_chunks_unique_index/,
      );
    });

    it('tenant A, B nin gorusmesini ve parcasini GOREMEZ', async () => {
      const companyB = await insertCompany(TENANT_B);
      const interactionB = await insertInteraction(TENANT_B, companyB);
      await insertChunk(TENANT_B, interactionB);

      const seen = await asTenant(TENANT_A, async (client) => {
        const a = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.interactions',
        );
        const b = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.interaction_chunks',
        );
        return { interactions: a.rows[0]?.count, chunks: b.rows[0]?.count };
      });

      expect(seen).toEqual({ interactions: '0', chunks: '0' });
    });

    it('BASKA tenant adina gorusme yazmak WITH CHECK ile reddedilir', async () => {
      const companyA = await insertCompany(TENANT_A);
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO crm.interactions
               (id, tenant_id, company_id, author_user_id, occurred_on, body)
             VALUES ($1, $2, $3, $4, '2026-08-12', 'sizinti')`,
            [randomUUID(), TENANT_B, companyA, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant context KURULMADAN sorgu HATA verir', async () => {
      for (const table of ['interactions', 'interaction_chunks']) {
        await expect(
          appPool.query(`SELECT 1 FROM crm.${table}`),
          `crm.${table} context siz calismamali`,
        ).rejects.toThrow(/unrecognized configuration parameter|invalid input syntax/i);
      }
    });

    it('her iki tablo da ENABLE + FORCE tasiyor', async () => {
      for (const table of ['interactions', 'interaction_chunks']) {
        const result = await ownerPool.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'crm' AND c.relname = $1`,
          [table],
        );

        expect(result.rows[0]?.relrowsecurity, `${table} ENABLE`).toBe(true);
        expect(result.rows[0]?.relforcerowsecurity, `${table} FORCE`).toBe(true);
      }
    });

    it('SIRKET silinince gorusme VE parcalari gider (IKI KADEMELI CASCADE)', async () => {
      const companyId = await insertCompany(TENANT_A);
      const interactionId = await insertInteraction(TENANT_A, companyId);
      await insertChunk(TENANT_A, interactionId);

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query('DELETE FROM crm.companies WHERE id = $1', [companyId]);
        const a = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.interactions',
        );
        const b = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.interaction_chunks',
        );
        return { interactions: a.rows[0]?.count, chunks: b.rows[0]?.count };
      });

      // `crm` semasinin VAR OLMA GEREKCESI: silinen musteri AI hafizasindan
      // da silinir. Gorusmeler `knowledge.notes`'a yazilsaydi cross-schema FK
      // yasagi yuzunden bu cascade YAZILAMAZDI.
      expect(remaining).toEqual({ interactions: '0', chunks: '0' });
    });

    it('parcasiz gorusme LEFT JOIN ile TESPIT EDILEBILIR', async () => {
      const companyId = await insertCompany(TENANT_A);
      await insertInteraction(TENANT_A, companyId);

      const orphans = await asTenant(TENANT_A, async (client) => {
        const result = await client.query<{ count: string }>(
          `SELECT count(*) AS count FROM crm.interactions i
           LEFT JOIN crm.interaction_chunks c ON c.interaction_id = i.id
           WHERE c.id IS NULL`,
        );
        return result.rows[0]?.count;
      });

      // Is listesi TURETILMISTIR: ayri bir "onarilacaklar" tablosu yok.
      expect(orphans).toBe('1');
    });
  });

  describe('CASCADE (ADR-0031 §7)', () => {
    it('sirket silinince kisileri de gider', async () => {
      const companyId = await insertCompany(TENANT_A);
      await insertContact(TENANT_A, companyId);

      const remaining = await asTenant(TENANT_A, async (client) => {
        await client.query('DELETE FROM crm.companies WHERE id = $1', [companyId]);
        const result = await client.query<{ count: string }>(
          'SELECT count(*) AS count FROM crm.contacts',
        );
        return result.rows[0]?.count;
      });

      // Bu cascade `crm` semasinin VAR OLMA GEREKCESIDIR: Slice 6'da zincir
      // `interactions` ve `interaction_chunks`'a uzayacak ve silinen musteri
      // AI hafizasindan da silinecek. Gorusmeler `knowledge.notes`'a
      // yazilsaydi cross-schema FK yasagi yuzunden bu YAZILAMAZDI.
      expect(remaining).toBe('0');
    });
  });
});
