import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { tenants } from './tenants.schema';

/**
 * `platform.memberships` — bir kullanicinin bir tenant icindeki uyeligi
 * (ADR-0014).
 *
 * `tenants`'tan FARKLI OLARAK bu tablo TENANT-SCOPED'dir: `tenant_id` tasir ve
 * STANDART RLS politikasina tabidir (MULTI_TENANT_ARCHITECTURE 12.4).
 *
 * Politikalar ve CHECK kisitlari elle yazilan migration'dadir.
 */
export const memberships = platformSchema.table(
  'memberships',
  {
    id: uuid('id').primaryKey(),

    /**
     * RLS anahtari. `tenants`'a FK verilir — ayni schema icinde oldugu icin
     * cross-schema FK yasagi (ARCHITECTURE 6.1) ihlal edilmez.
     */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * Identity modulune ait kimlik — FK YOK, referans id ile tutulur.
     * ADR-0014: kullanici GLOBALDIR, tenant'a ait degildir.
     */
    userId: uuid('user_id').notNull(),

    /** owner | admin | member | viewer — CHECK migration'da. */
    role: text('role').notNull(),

    /** invited | active | suspended | revoked — CHECK migration'da. */
    status: text('status').notNull(),

    /**
     * Davet kabul edildiginde dolar. Durumla tutarliligi migration'daki CHECK
     * ile zorlanir: `invited` -> bos, `active`/`suspended` -> dolu,
     * `revoked` -> ikisi de gecerli (davet asamasinda mi aktifken mi iptal
     * edildigi belirsizdir ve bilincli olarak zorlanmaz).
     */
    joinedAt: timestamp('joined_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Bir kullanicinin bir tenant'ta EN FAZLA BIR uyeligi olur.
    // Tenant-scoped tekillik (12.3): UNIQUE(user_id) DEGIL, UNIQUE(tenant_id, user_id).
    // Aksi halde bir tenant'in uyeligi baska bir tenant'in yazmasini engeller
    // ve o kullanicinin varligini SIZDIRIRDI.
    uniqueIndex('memberships_tenant_id_user_id_key').on(table.tenantId, table.userId),

    // FK indexlenir (DEVELOPMENT_RULES 6). tenant_id BILESIK INDEX'TE ILK
    // KOLONDUR — her sorgu once tenant ile filtrelenir (12.3).
    index('memberships_tenant_id_idx').on(table.tenantId),

    // "Bu kullanicinin uyelikleri" — tenant degistirme akisi bunu kullanir (7.4).
    index('memberships_user_id_idx').on(table.userId),
  ],
);
