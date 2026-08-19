import { sql } from 'drizzle-orm';
import { boolean, check, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { inventoryItems } from './inventory-items.schema';
import { inventorySchema } from './inventory-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `inventory.movements` — DEGISTIRILEMEZ defter (ADR-0039 §3, §3.3).
 *
 * ============================================================================
 * ⚠️ `updatedAt` YOKTUR — ve bu bir unutma DEGILDIR
 * ============================================================================
 * Bir hareket olusturulduktan sonra guncellenmez ve silinmez; guncellenmeyen
 * bir satirin guncellenme zamani da olmaz. Kolonu koymak, ileride birinin
 * "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR DAVET olurdu.
 *
 * ⚠️ ADR-0034'ten BILINCLI SAPMA: `finance.transactions` duzenlenebilir. Fark
 * §2'den dogar — Stok'ta bugunku miktar GECMISTEN turetilir, yani gecmisi
 * degistirmek BUGUNU sessizce yeniden yazar.
 *
 * ============================================================================
 * ⚠️ `direction` + `isCorrection` — UC DEGERLI BIR `kind` DEGIL
 * ============================================================================
 * `adjustment` tek basina miktarin hangi yone gittigini SOYLEMEZ; uc degerli
 * bir kolon ya isaretli miktar (ADR-0034 §5'in acikca reddettigi) ya da satir
 * bazinda anlam degistiren nullable bir `direction` gerektirirdi.
 */
export const inventoryMovements = inventorySchema.table(
  'movements',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ `restrict`, `cascade` DEGIL: cascade olsaydi degistirilemez ilan edilen
     * defter TEK BIR `DELETE` ile yok edilebilirdi (ADR-0039 §3.4). FK ayni sema
     * icinde oldugu icin MESRUDUR — Mutlak Kural 5 cross-schema FK'yi yasaklar.
     */
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'restrict' }),

    /** `'in'` | `'out'` — CHECK kisiti migration `0029`'da. */
    direction: text('direction').notNull(),

    /** ⚠️ HER ZAMAN POZITIF; isaret `direction`dadir. JS'te `string` kalir. */
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),

    /** Fiziksel sayimdan dogan fark mi, gercek bir akis mi (ADR-0039 §3.1). */
    isCorrection: boolean('is_correction').notNull().default(false),

    /** ⚠️ `createdAt` ile AYNI SEY DEGIL: hareket dun olmus, bugun girilmis olabilir. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    /** ⚠️ EMBED EDILMEZ — anlamsal yuzey KALEMIN notudur (ADR-0039 §5). */
    note: text('note'),

    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('movements_direction_valid', sql`${table.direction} IN ('in', 'out')`),
    check('movements_quantity_positive', sql`${table.quantity} > 0`),
    check('movements_note_not_blank', sql`${table.note} IS NULL OR btrim(${table.note}) <> ''`),

    /** ⚠️ §2'nin TURETME sorgusu bu index uzerinden calisir — modulun en sicak yolu. */
    index('movements_tenant_item_idx').on(table.tenantId, table.itemId),
    index('movements_tenant_occurred_idx').on(table.tenantId, table.occurredAt.desc()),
  ],
);
