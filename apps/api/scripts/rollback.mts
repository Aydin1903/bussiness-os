import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from 'pg';
import { z } from 'zod';

/**
 * En son uygulanan migration'i geri alir.
 *
 * DEVELOPMENT_RULES 6 "migration geri alinabilir olur" kuralinin calisan
 * karsiligidir. drizzle-kit geri alma desteklemez; konvansiyon sudur:
 *
 *   drizzle/0001_tenant.sql        ileri
 *   drizzle/0001_tenant.down.sql   geri
 *
 * Her cagri TEK adim geri alir. Down SQL'i ve migration kaydinin silinmesi
 * AYNI transaction icindedir: yarim geri alinmis bir durum olusamaz.
 *
 * Calistirma: pnpm db:rollback  (production'da ek olarak --yes gerekir)
 */

/**
 * Migration gunlugu de dis veridir (DEVELOPMENT_RULES 2.3): elle duzenlenebilir,
 * merge sirasinda bozulabilir. Bicimi dogrulanmadan guvenilmez — bozuk bir gunluk
 * yanlis migration'in geri alinmasina yol acabilir.
 */
const journalSchema = z.object({
  entries: z.array(
    z.object({
      idx: z.number().int().nonnegative(),
      tag: z.string().min(1),
    }),
  ),
});

type JournalEntry = z.infer<typeof journalSchema>['entries'][number];

const MIGRATIONS_DIR = 'drizzle';
const MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations';

async function main(): Promise<void> {
  loadEnv();
  guardProduction();

  const client = new Client({ connectionString: migrationUrl() });
  await client.connect();

  try {
    await rollbackLastMigration(client);
  } finally {
    await client.end();
  }
}

async function rollbackLastMigration(client: Client): Promise<void> {
  const last = await findLastApplied(client);

  if (last === null) {
    console.log('Geri alinacak migration yok.');
    return;
  }

  const downFile = join(MIGRATIONS_DIR, `${last.entry.tag}.down.sql`);

  if (!existsSync(downFile)) {
    throw new Error(
      `Geri alma dosyasi bulunamadi: ${downFile}\n` +
        'Her migration icin bir .down.sql yazilmalidir (DEVELOPMENT_RULES 6).',
    );
  }

  console.log(`Geri aliniyor: ${last.entry.tag}`);

  await applyDown(client, readFileSync(downFile, 'utf8'), last.id);

  console.log(`Geri alindi: ${last.entry.tag}`);
}

/**
 * Uygulanmis son migration'i ve gunlukteki karsiligini bulur.
 *
 * Eslestirme SIRAYA dayanir: drizzle kayitlari gunluk sirasiyla ekler, yani
 * n. kayit gunlugun n-1 indeksine karsilik gelir.
 */
async function findLastApplied(
  client: Client,
): Promise<{ readonly id: string; readonly entry: JournalEntry } | null> {
  const result = await client.query<{ id: string; total: string }>(
    `SELECT id, (SELECT COUNT(*)::text FROM ${MIGRATIONS_TABLE}) AS total
       FROM ${MIGRATIONS_TABLE}
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  );

  const row = result.rows[0];

  if (row === undefined) {
    return null;
  }

  return { id: row.id, entry: journalEntryAt(Number(row.total) - 1) };
}

/**
 * Down SQL ve migration kaydinin silinmesi TEK transaction'dadir: islem yarida
 * kalirsa veritabani "uygulanmis" olarak isaretli kalir, tutarsizlik olusmaz.
 */
async function applyDown(client: Client, sql: string, migrationId: string): Promise<void> {
  await client.query('BEGIN');

  try {
    for (const statement of splitStatements(sql)) {
      await client.query(statement);
    }
    await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [migrationId]);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function journalEntryAt(index: number): JournalEntry {
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  const raw: unknown = JSON.parse(readFileSync(journalPath, 'utf8'));
  const journal = journalSchema.parse(raw);
  const entry = journal.entries[index];

  if (entry === undefined) {
    throw new Error(
      `Migration gunlugunde ${String(index)} numarali kayit yok. ` +
        'Veritabani ile drizzle/meta/_journal.json uyusmuyor.',
    );
  }

  return entry;
}

/** drizzle-kit ile ayni ayirici. */
function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function loadEnv(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

function migrationUrl(): string {
  const url = process.env.DATABASE_MIGRATION_URL;

  if (url === undefined || url === '') {
    throw new Error('DATABASE_MIGRATION_URL tanimli degil.');
  }

  return url;
}

/**
 * Production'da geri alma kaza eseri calistirilamaz.
 * Veri kaybi uretebilecek bir islem, acik niyet beyani olmadan yapilmaz.
 */
function guardProduction(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const confirmed = process.argv.includes('--yes');

  if (isProduction && !confirmed) {
    throw new Error(
      'Production ortaminda geri alma icin --yes bayragi zorunludur.\n' +
        'Once yedegin alindigini dogrula.',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
