import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ROLE, APP_PASSWORD, createApplicationRole } from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `documents` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0037 Backend).
 *
 * Bes onceki modulun dersi burada da BASTAN uygulaniyor: yeni bir tablo,
 * dogrudan A<->B izolasyon testi yazilmadan merge EDILMEZ.
 *
 * ============================================================================
 * ⚠️ BU DOSYA AYRICA BIR SUREC HATASINI KILITLIYOR
 * ============================================================================
 * Bu modulun migration'lari yazildiginda `drizzle/meta/_journal.json`a
 * EKLENMEMISTI. Sonucu SESSIZDI ve tam olarak bu yuzden tehlikeliydi:
 * `drizzle-kit migrate` "migrations applied successfully" yazdi, cikis kodu 0
 * verdi ve HICBIR SEY UYGULAMADI. Tablolar olusmadi, uygulama ayaga kalkti,
 * yalnizca `POST /ask` sessizce bir kaynagi `degradedSources`a dusurdu.
 *
 * `database.integration.spec` bunu YAKALAYAMAZDI: onun geri alma listesi
 * `DROP TABLE IF EXISTS` calistirir ve olmayan bir tablo icin de BASARILI olur.
 *
 * Asagidaki "tablolar GERCEKTEN olusturuldu" iddiasi o bosluğu kapatiyor —
 * journal'a eklenmemis bir migration burada KIRMIZI yanar.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000d1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000d2';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** `vector(1536)` kolonuna yazilabilir en ucuz gecerli deger. */
const VECTOR = `[${Array.from({ length: 1536 }, () => '0.1').join(',')}]`;

describe('documents semasi (gercek PostgreSQL)', () => {
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
       VALUES ($1, 'tenant-doc-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-doc-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('TRUNCATE documents.documents CASCADE');
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

  async function insertDocument(
    tenantId: string,
    overrides: {
      id?: string;
      storageKey?: string;
      mimeType?: string;
      sizeBytes?: number;
      label?: string | null;
      originalFilename?: string;
    } = {},
  ): Promise<string> {
    const id = overrides.id ?? randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO documents.documents
           (id, tenant_id, original_filename, storage_key, mime_type, size_bytes, label,
            crm_contact_id, project_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8)`,
        [
          id,
          tenantId,
          overrides.originalFilename ?? 'Kira Sozlesmesi.pdf',
          overrides.storageKey ?? `tenants/${tenantId}/documents/${id}/x-kira.pdf`,
          overrides.mimeType ?? PDF_MIME,
          overrides.sizeBytes ?? 1024,
          overrides.label ?? null,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function insertChunk(
    tenantId: string,
    documentId: string,
    chunkIndex = 0,
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO documents.document_chunks
           (id, tenant_id, document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tenantId, documentId, chunkIndex, '[Belge · a.pdf] metin', VECTOR],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('⚠️ IKI TABLO da GERCEKTEN olusturuldu — journal kaydinin kaniti', async () => {
      // Bkz. dosya basligi: journal'a eklenmemis bir migration SESSIZCE hicbir
      // sey yapar ve `drizzle-kit` yine "applied successfully" der.
      const result = await ownerPool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'documents' ORDER BY table_name",
      );

      expect(result.rows.map((row) => row.table_name)).toEqual(['document_chunks', 'documents']);
    });

    it('⚠️ IKISINDE DE RLS ENABLE + FORCE (MT §12.2)', async () => {
      // `FORCE` olmadan tablo SAHIBI politikayi atlar; alti kez ayni sablon.
      const result = await ownerPool.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'documents' AND c.relkind = 'r'
          ORDER BY c.relname`,
      );

      expect(result.rows).toEqual([
        { relname: 'document_chunks', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'documents', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });

    it('⚠️ ALLOWLIST DISI MIME veritabani seviyesinde REDDEDILIR', async () => {
      // Uygulama katmani zaten 415 doner; CHECK, uygulamayi ATLAYAN yollari
      // baglar. Sozluk IKI yerde yasar ve senkron kalmak zorundadir.
      await expect(insertDocument(TENANT_A, { mimeType: 'image/png' })).rejects.toThrow(
        /documents_mime_type_allowed/,
      );
    });

    it('DOCX de kabul edilir (allowlist IKI deger tasir)', async () => {
      await expect(insertDocument(TENANT_A, { mimeType: DOCX_MIME })).resolves.toBeTruthy();
    });

    it('⚠️ AYNI `storage_key` IKI KEZ yazilamaz — tenant-scoped UNIQUE', async () => {
      // Iki satirin ayni nesneyi isaret etmesi, birini silmenin digerini
      // SESSIZCE bozmasi demekti (ADR-0037 §1).
      const key = `tenants/${TENANT_A}/documents/sabit/x-kira.pdf`;
      await insertDocument(TENANT_A, { storageKey: key });

      await expect(insertDocument(TENANT_A, { storageKey: key })).rejects.toThrow(
        /documents_storage_key_unique/,
      );
    });

    it('AYNI anahtar FARKLI tenant ta yazilabilir — kisit tenant-scoped', async () => {
      const key = 'tenants/x/documents/y/z.pdf';
      await insertDocument(TENANT_A, { storageKey: key });

      await expect(insertDocument(TENANT_B, { storageKey: key })).resolves.toBeTruthy();
    });

    it('sifir/negatif boyut REDDEDILIR', async () => {
      await expect(insertDocument(TENANT_A, { sizeBytes: 0 })).rejects.toThrow(
        /documents_size_positive/,
      );
    });

    it('⚠️ BOS etiket REDDEDILIR — "girilmedi" `NULL` ile ifade edilir', async () => {
      await expect(insertDocument(TENANT_A, { label: '   ' })).rejects.toThrow(
        /documents_label_not_blank/,
      );
    });

    it('etiket `NULL` olabilir — etiketsiz belge MESRUDUR', async () => {
      await expect(insertDocument(TENANT_A, { label: null })).resolves.toBeTruthy();
    });

    it('⚠️ AYNI parca indeksi IKI KEZ yazilamaz — yeniden uretim IDEMPOTENT', async () => {
      const documentId = await insertDocument(TENANT_A);
      await insertChunk(TENANT_A, documentId, 0);

      await expect(insertChunk(TENANT_A, documentId, 0)).rejects.toThrow(
        /document_chunks_unique_index/,
      );
    });
  });

  describe('⚠️ TENANT IZOLASYONU (MT §12.6)', () => {
    it('A nin belgesi B ye GORUNMEZ', async () => {
      await insertDocument(TENANT_A);

      const visible = await asTenant(TENANT_B, (client) =>
        client.query('SELECT id FROM documents.documents'),
      );

      expect(visible.rowCount).toBe(0);
    });

    it('A nin PARCASI B ye GORUNMEZ', async () => {
      const documentId = await insertDocument(TENANT_A);
      await insertChunk(TENANT_A, documentId);

      const visible = await asTenant(TENANT_B, (client) =>
        client.query('SELECT id FROM documents.document_chunks'),
      );

      expect(visible.rowCount).toBe(0);
    });

    it('B, A nin belgesini SILEMEZ', async () => {
      const documentId = await insertDocument(TENANT_A);

      const deleted = await asTenant(TENANT_B, (client) =>
        client.query('DELETE FROM documents.documents WHERE id = $1', [documentId]),
      );

      expect(deleted.rowCount).toBe(0);
      const stillThere = await asTenant(TENANT_A, (client) =>
        client.query('SELECT id FROM documents.documents WHERE id = $1', [documentId]),
      );
      expect(stillThere.rowCount).toBe(1);
    });

    it('⚠️ BASKA tenant adina satir YAZILAMAZ — `WITH CHECK`', async () => {
      await expect(
        asTenant(TENANT_B, (client) =>
          client.query(
            `INSERT INTO documents.documents
               (id, tenant_id, original_filename, storage_key, mime_type, size_bytes, created_by_user_id)
             VALUES ($1, $2, 'x.pdf', 'k', $3, 10, $4)`,
            [randomUUID(), TENANT_A, PDF_MIME, USER_B],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('⚠️ TENANT CONTEXT YOKSA sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 (fail-closed): `missing_ok` kullanilmadi. Sessiz bos
      // sonuc "hic belge yok" gibi gorunurdu ve kullanici arsivinin bos
      // oldugunu sanardi.
      // ⚠️ MESAJ IKI BICIMDE GELEBILIR ve ikisi de AYNI seyi kanitlar:
      // parametre oturumda HIC gorulmediyse "unrecognized configuration
      // parameter", daha once bir transaction'da set edilip sifirlandiysa BOS
      // DIZE doner ve `::uuid` cast'i "invalid input syntax" ile patlar.
      // Onemli olan sorgunun BOS DONMEMESI, HATA VERMESIDIR.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT id FROM documents.documents')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  describe('⚠️ CASCADE — retention kolu `documents.documents` (ROADMAP §8.5)', () => {
    it('belge silinince PARCALARI da gider', async () => {
      // Dogru retention kolu ebeveyndir; yalnizca parca silen bir is YETIM
      // EBEVEYN birakirdi. Ayni cascade, §7'nin "yeni dosya eskisini
      // degistirir" karariniin da mekanigidir.
      const documentId = await insertDocument(TENANT_A);
      await insertChunk(TENANT_A, documentId, 0);
      await insertChunk(TENANT_A, documentId, 1);

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM documents.documents WHERE id = $1', [documentId]),
      );

      const remaining = await asTenant(TENANT_A, (client) =>
        client.query('SELECT id FROM documents.document_chunks'),
      );
      expect(remaining.rowCount).toBe(0);
    });
  });
});
