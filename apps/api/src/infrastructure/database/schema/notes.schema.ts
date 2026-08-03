import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { knowledgeSchema } from './knowledge.schema';
import { tenants } from './tenants.schema';

/**
 * `knowledge.notes` — kurumsal hafizanin atomu (ADR-0029 §1).
 *
 * CLAUDE.md: "modul tasarlanirken sorulacak soru 'kullanici bu ekranda ne yapar'
 * degil, 'bu modul AI'a hangi baglami ve hafizayi kazandirir'dir." Bu tablo o
 * sorunun ilk somut cevabidir: serbest metin, AI'in okuyacagi hale
 * (`note_chunks`) ayri bir yasam dongusunde cevrilir.
 *
 * `author_user_id` icin `platform.users`'a FK YOKTUR: Identity tablolari ayri
 * bir modulun icidir (MT §12.4.3, Mutlak Kural 5). Deger dogrulanmis token'dan
 * gelir; butunluk uygulama katmanindadir.
 */
export const notes = knowledgeSchema.table(
  'notes',
  {
    id: uuid('id').primaryKey(),

    /** Tenant sahipligi. RLS politikasinin dayandigi kolon. */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    authorUserId: uuid('author_user_id').notNull(),

    /** OPSIYONEL (ADR-0029): kullanici hizlica bir dusunce birakabilmeli. */
    title: text('title'),

    body: text('body').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Gunluk rapor "son 24 saatte eklenen notlar" sorar (ADR-0030 §2.2).
    index('notes_tenant_created_idx').on(table.tenantId, table.createdAt),

    check('notes_body_not_blank', sql`length(btrim(body)) > 0`),
    // Baslik varsa bos olamaz: `NULL` ile `''` arasindaki farki korur.
    check('notes_title_not_blank', sql`title IS NULL OR length(btrim(title)) > 0`),
    check('notes_updated_after_created', sql`updated_at >= created_at`),
  ],
);
