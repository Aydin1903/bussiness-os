import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from './support/test-database';

/**
 * `knowledge` semasi — sema, RLS ve besinci dar rol (ADR-0029, ADR-0030).
 *
 * Bu slice YALNIZCA semadir; use case/controller/adapter yoktur. Dolayisiyla
 * testler dogrudan SQL seviyesinde calisir ve uc seyi kanitlar:
 *
 *   1. pgvector gercekten kurulu, `vector(1536)` ve HNSW index calisiyor,
 *   2. Dort tenant-scoped tabloda RLS gercekten koruyor (MT §12.6): baska
 *      tenant'in satiri GORULMEZ, context'siz sorgu HATA verir, `WITH CHECK`
 *      baskasi adina yazmayi reddeder,
 *   3. `businessos_report_worker` YALNIZCA `daily_report_runs`'a erisebiliyor
 *      (Constraint 2 esdegeri — ADR-0028 / ADR-0030 §2.4).
 *
 * Ucuncusu en kritigidir: besinci `BYPASSRLS` rolunun DAR kaldigi ancak
 * dogrudan dogrulanirsa bilinir.
 */
const TENANT_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const TENANT_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

/** 1536 boyutlu sahte embedding — pgvector'un kabul ettigi bicimde. */
function embedding(seed: number): string {
  return `[${Array.from({ length: 1536 }, (_, i) => ((seed + i) % 100) / 100).join(',')}]`;
}

describe('knowledge semasi (gercek PostgreSQL)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.ownerPool.query(
      'TRUNCATE knowledge.daily_report_runs, knowledge.messages, knowledge.conversations, ' +
        'knowledge.note_chunks, knowledge.notes CASCADE',
    );
    await database.ownerPool.query('TRUNCATE platform.memberships, platform.tenants CASCADE');
    await seedTenant(TENANT_A, 'acme');
    await seedTenant(TENANT_B, 'globex');
  });

  /** `platform.tenants` FORCE TASIMAZ (MT §12.4.1); sahip rol dogrudan yazar. */
  async function seedTenant(id: string, slug: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, name, slug, status, owner_user_id, created_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [id, slug.toUpperCase(), slug, USER_A],
    );
  }

  /**
   * Sorguyu UYGULAMA rolu + tenant context'i altinda calistirir.
   *
   * `businessos_app` kullanilir, sahip rol DEGIL: politikalar yalnizca tablo
   * sahibi OLMAYAN rol icin uygulanir. Sahip rolle yapilan bir "izolasyon
   * testi" FORCE olmasa her zaman yesil yanar ve hicbir sey kanitlamaz.
   */
  async function asTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Tenant context'i KURULMADAN, uygulama rolu ile calistirir. */
  async function withoutTenantContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await database.appPool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async function insertNote(tenantId: string, body = 'ilk not'): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO knowledge.notes (id, tenant_id, author_user_id, title, body)
         VALUES ($1, $2, $3, 'Baslik', $4)`,
        [id, tenantId, USER_A, body],
      ),
    );
    return id;
  }

  // --- 1. pgvector ve sema kurulumu ----------------------------------------

  describe('pgvector ve sema', () => {
    it('vector eklentisi KURULU (migration 0011)', async () => {
      const rows = await database.ownerPool.query<{ extversion: string }>(
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
      );
      expect(rows.rowCount).toBe(1);
    });

    it('alti tablo da knowledge semasinda olusturuldu', async () => {
      const rows = await database.ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'knowledge' ORDER BY table_name",
      );
      expect(rows.rows.map((row) => row.table_name)).toEqual([
        'conversations',
        'daily_report_runs',
        'messages',
        'note_chunks',
        'notes',
        'rate_limits',
      ]);
    });

    it('embedding index i gercekten HNSW (IVFFlat DEGIL — ADR-0029 §1)', async () => {
      const rows = await database.ownerPool.query<{ indexdef: string }>(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'note_chunks_embedding_idx'",
      );
      expect(rows.rows[0]?.indexdef).toContain('USING hnsw');
      expect(rows.rows[0]?.indexdef).toContain('vector_cosine_ops');
      expect(rows.rows[0]?.indexdef).not.toContain('ivfflat');
    });

    it('1536 boyutlu embedding yazilip okunabiliyor', async () => {
      const noteId = await insertNote(TENANT_A);

      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.note_chunks
             (id, tenant_id, note_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, 0, 'parca', $4::vector)`,
          [randomUUID(), TENANT_A, noteId, embedding(1)],
        ),
      );

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ dims: number }>(
          'SELECT vector_dims(embedding) AS dims FROM knowledge.note_chunks',
        ),
      );
      expect(rows.rows[0]?.dims).toBe(1536);
    });

    it('YANLIS boyutlu embedding REDDEDILIR', async () => {
      const noteId = await insertNote(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO knowledge.note_chunks
               (id, tenant_id, note_id, chunk_index, content, embedding)
             VALUES ($1, $2, $3, 0, 'parca', '[1,2,3]'::vector)`,
            [randomUUID(), TENANT_A, noteId],
          ),
        ),
      ).rejects.toThrow(/expected 1536 dimensions/i);
    });

    it('benzerlik sorgusu calisiyor (kosinus mesafesi)', async () => {
      const noteId = await insertNote(TENANT_A);
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.note_chunks
             (id, tenant_id, note_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, 0, 'parca', $4::vector)`,
          [randomUUID(), TENANT_A, noteId, embedding(1)],
        ),
      );

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ content: string }>(
          `SELECT content FROM knowledge.note_chunks
           ORDER BY embedding <=> $1::vector LIMIT 1`,
          [embedding(2)],
        ),
      );
      expect(rows.rows[0]?.content).toBe('parca');
    });
  });

  // --- 2. RLS izolasyonu (MT §12.6) ----------------------------------------

  const TENANT_SCOPED = [
    'notes',
    'note_chunks',
    'conversations',
    'messages',
    'daily_report_runs',
    // Oran siniri sayaci da SAPMASIZ ayni sablona tabidir (ADR-0029 §5.1).
    // Burada sessiz bos sonuc ozellikle tehlikeli olurdu: sayac her istekte
    // 0 okunur ve koruma GORUNMEZ sekilde kapanirdi.
    'rate_limits',
  ] as const;

  describe('RLS izolasyonu', () => {
    it.each(TENANT_SCOPED)('%s: ENABLE + FORCE tasiyor', async (table) => {
      const rows = await database.ownerPool.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'knowledge' AND c.relname = $1`,
        [table],
      );
      expect(rows.rows[0]?.relrowsecurity, `${table} ENABLE`).toBe(true);
      expect(rows.rows[0]?.relforcerowsecurity, `${table} FORCE`).toBe(true);
    });

    it.each(TENANT_SCOPED)('%s: tenant context i OLMADAN sorgu HATA verir', async (table) => {
      // Sessiz bos sonuc DEGIL, hata (MT §12.6 madde 4): sessiz bos sonuc,
      // hatayi uretimde aylarca gizler.
      //
      // IKI mesaj da kabul edilir (`tenant-isolation.integration.spec.ts` ile
      // ayni konvansiyon): PostgreSQL, oturumda parametre HIC gorulmediyse
      // "unrecognized configuration parameter", bir kez `SET LOCAL` ile
      // gorulduyse bos dize dondurur ve `::uuid` cast'i "invalid input syntax"
      // ile patlar. Havuzdan gelen baglantinin gecmisi hangisinin gorunecegini
      // belirler — ikisi de FAIL-CLOSED'dir, testin iddiasi budur.
      await expect(
        withoutTenantContext((client) => client.query(`SELECT 1 FROM knowledge.${table}`)),
      ).rejects.toThrow(/unrecognized configuration parameter|invalid input syntax/i);
    });

    it('notes: tenant A, B nin notunu GOREMEZ', async () => {
      await insertNote(TENANT_A, 'A nin notu');
      await insertNote(TENANT_B, 'B nin notu');

      const seenByA = await asTenant(TENANT_A, (client) =>
        client.query<{ body: string }>('SELECT body FROM knowledge.notes'),
      );

      expect(seenByA.rows.map((row) => row.body)).toEqual(['A nin notu']);
    });

    it('notes: BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO knowledge.notes (id, tenant_id, author_user_id, body)
             VALUES ($1, $2, $3, 'sizinti denemesi')`,
            [randomUUID(), TENANT_B, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('note_chunks: tenant A, B nin chunk ini GOREMEZ', async () => {
      for (const [tenant, seed] of [
        [TENANT_A, 1],
        [TENANT_B, 2],
      ] as const) {
        const noteId = await insertNote(tenant);
        await asTenant(tenant, (client) =>
          client.query(
            `INSERT INTO knowledge.note_chunks
               (id, tenant_id, note_id, chunk_index, content, embedding)
             VALUES ($1, $2, $3, 0, $4, $5::vector)`,
            [randomUUID(), tenant, noteId, `${tenant} parcasi`, embedding(seed)],
          ),
        );
      }

      const seenByA = await asTenant(TENANT_A, (client) =>
        client.query('SELECT 1 FROM knowledge.note_chunks'),
      );
      expect(seenByA.rowCount).toBe(1);
    });

    it('conversations + messages: tenant A, B nin konusmasini GOREMEZ', async () => {
      for (const [tenant, user] of [
        [TENANT_A, USER_A],
        [TENANT_B, USER_B],
      ] as const) {
        const conversationId = randomUUID();
        await asTenant(tenant, async (client) => {
          await client.query(
            'INSERT INTO knowledge.conversations (id, tenant_id, user_id) VALUES ($1, $2, $3)',
            [conversationId, tenant, user],
          );
          await client.query(
            `INSERT INTO knowledge.messages (id, tenant_id, conversation_id, role, content)
             VALUES ($1, $2, $3, 'user', $4)`,
            [randomUUID(), tenant, conversationId, `${tenant} sorusu`],
          );
        });
      }

      const conversations = await asTenant(TENANT_A, (client) =>
        client.query('SELECT 1 FROM knowledge.conversations'),
      );
      const messages = await asTenant(TENANT_A, (client) =>
        client.query('SELECT 1 FROM knowledge.messages'),
      );

      expect(conversations.rowCount).toBe(1);
      expect(messages.rowCount).toBe(1);
    });

    it('daily_report_runs: tenant A, B nin raporunu GOREMEZ', async () => {
      for (const tenant of [TENANT_A, TENANT_B]) {
        await asTenant(tenant, (client) =>
          client.query(
            `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
             VALUES ($1, $2, CURRENT_DATE)`,
            [randomUUID(), tenant],
          ),
        );
      }

      const seenByA = await asTenant(TENANT_A, (client) =>
        client.query<{ tenant_id: string }>('SELECT tenant_id FROM knowledge.daily_report_runs'),
      );
      expect(seenByA.rows.map((row) => row.tenant_id)).toEqual([TENANT_A]);
    });
  });

  // --- 3. Kisitlar ----------------------------------------------------------

  describe('kisitlar', () => {
    it('daily_report_runs: ayni (tenant, gun) IKI KEZ eklenemez (idempotency anahtari)', async () => {
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
           VALUES ($1, $2, CURRENT_DATE)`,
          [randomUUID(), TENANT_A],
        ),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
             VALUES ($1, $2, CURRENT_DATE)`,
            [randomUUID(), TENANT_A],
          ),
        ),
      ).rejects.toThrow(/daily_report_runs_tenant_date_unique/);
    });

    it('daily_report_runs: hem uretilmis hem olu OLAMAZ', async () => {
      const id = randomUUID();
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
           VALUES ($1, $2, CURRENT_DATE)`,
          [id, TENANT_A],
        ),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `UPDATE knowledge.daily_report_runs
             SET generated_at = now(), summary = 'ozet', dead_lettered_at = now()
             WHERE id = $1`,
            [id],
          ),
        ),
      ).rejects.toThrow(/daily_report_runs_terminal_state_check/);
    });

    it('daily_report_runs: OZETSIZ "uretildi" REDDEDILIR', async () => {
      const id = randomUUID();
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
           VALUES ($1, $2, CURRENT_DATE)`,
          [id, TENANT_A],
        ),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            'UPDATE knowledge.daily_report_runs SET generated_at = now() WHERE id = $1',
            [id],
          ),
        ),
      ).rejects.toThrow(/daily_report_runs_summary_when_generated/);
    });

    it('messages: gecersiz rol REDDEDILIR (yalnizca user | assistant)', async () => {
      const conversationId = randomUUID();
      await asTenant(TENANT_A, (client) =>
        client.query(
          'INSERT INTO knowledge.conversations (id, tenant_id, user_id) VALUES ($1, $2, $3)',
          [conversationId, TENANT_A, USER_A],
        ),
      );

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO knowledge.messages (id, tenant_id, conversation_id, role, content)
             VALUES ($1, $2, $3, 'system', 'sistem promptu saklanmaz')`,
            [randomUUID(), TENANT_A, conversationId],
          ),
        ),
      ).rejects.toThrow(/messages_role_valid/);
    });

    it('note_chunks: not silinince chunk lari da gider (CASCADE)', async () => {
      const noteId = await insertNote(TENANT_A);
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO knowledge.note_chunks
             (id, tenant_id, note_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, 0, 'parca', $4::vector)`,
          [randomUUID(), TENANT_A, noteId, embedding(1)],
        ),
      );

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM knowledge.notes WHERE id = $1', [noteId]),
      );

      const remaining = await asTenant(TENANT_A, (client) =>
        client.query('SELECT 1 FROM knowledge.note_chunks'),
      );
      expect(remaining.rowCount).toBe(0);
    });
  });

  // --- 4. Constraint 2 esdegeri: besinci dar rolun SINIRI -------------------

  /**
   * Sorguyu `businessos_report_worker` rolu KIMLIGINDE calistirir.
   *
   * `SET LOCAL ROLE` + transaction: rol yalnizca transaction boyunca gecerlidir
   * ve ROLLBACK'te kendiliginden sifirlanir — havuz baglantisini KIRLETMEZ.
   * `me-memberships` ve `tenant-outbox-consumer` testlerindeki ayni desen.
   */
  async function asReportWorker(sql: string): Promise<unknown> {
    const client = await database.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE businessos_report_worker');
      return await client.query(sql);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  describe('businessos_report_worker dar rolu BASKA hicbir seye erisemez', () => {
    it('rol NOLOGIN ve BYPASSRLS tasir (dar ama tek yetenegi bypass)', async () => {
      const rows = await database.ownerPool.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
        "SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'businessos_report_worker'",
      );
      expect(rows.rows[0]?.rolcanlogin).toBe(false);
      expect(rows.rows[0]?.rolbypassrls).toBe(true);
    });

    it('kendi fonksiyonlarinin dokundugu TEK tabloya erisebilir (daily_report_runs)', async () => {
      await expect(
        asReportWorker('SELECT 1 FROM knowledge.daily_report_runs LIMIT 1'),
      ).resolves.toBeDefined();
    });

    it('DIGER knowledge tablolarina SELECT REDDEDILIR', async () => {
      for (const table of ['notes', 'note_chunks', 'conversations', 'messages', 'rate_limits']) {
        await expect(
          asReportWorker(`SELECT 1 FROM knowledge.${table} LIMIT 1`),
          `knowledge.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it('platform tablolarina SELECT REDDEDILIR (tenants dahil — tembel seed sayesinde gerekmiyor)', async () => {
      for (const table of ['tenants', 'memberships', 'outbox', 'identity_outbox', 'users']) {
        await expect(
          asReportWorker(`SELECT 1 FROM platform.${table} LIMIT 1`),
          `platform.${table} erisilebilir OLMAMALI`,
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it('daily_report_runs a INSERT ve DELETE REDDEDILIR (yalnizca SELECT + UPDATE)', async () => {
      await expect(
        asReportWorker(
          `INSERT INTO knowledge.daily_report_runs (id, tenant_id, report_date)
           VALUES (gen_random_uuid(), '${TENANT_A}', CURRENT_DATE)`,
        ),
      ).rejects.toThrow(/permission denied/i);

      await expect(asReportWorker('DELETE FROM knowledge.daily_report_runs')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('BASKA rollerin fonksiyonlarina EXECUTE REDDEDILIR', async () => {
      await expect(asReportWorker("SELECT platform.resolve_tenant('x')")).rejects.toThrow(
        /permission denied/i,
      );
      await expect(asReportWorker(`SELECT platform.claim_outbox_batch(1, now())`)).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('standing sema-yazma yetkisi TUTMAZ (CREATE gecici verilip geri alindi)', async () => {
      const rows = await database.ownerPool.query<{ create: boolean }>(
        "SELECT has_schema_privilege('businessos_report_worker', 'knowledge', 'CREATE') AS create",
      );
      expect(rows.rows[0]?.create).toBe(false);
    });

    it('OUTBOX relay rolu de knowledge semasina erisemez (iki asim birbirine sizmaz)', async () => {
      const client: Pool = database.ownerPool;
      const connection = await client.connect();
      try {
        await connection.query('BEGIN');
        await connection.query('SET LOCAL ROLE businessos_outbox_relay');
        await expect(
          connection.query('SELECT 1 FROM knowledge.daily_report_runs LIMIT 1'),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await connection.query('ROLLBACK').catch(() => undefined);
        connection.release();
      }
    });
  });
});
