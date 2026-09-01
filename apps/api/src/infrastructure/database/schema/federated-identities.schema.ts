import { text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';
import { users } from './users.schema';

/**
 * `platform.federated_identities` — sosyal giris kimlik baglantilari (ADR-0053 §2).
 *
 * ============================================================================
 * ⚠️ KIMLIGIN CAPASI `(provider, provider_subject)`, E-POSTA DEGIL
 * ============================================================================
 * ADR-0053 §1'in yapisal karsiligi. E-posta yalnizca BIR KEZ — baglama aninda,
 * adapter'in verdigi bir hukum altinda — kullanilir; `email_at_link` ondan
 * sonra yalnizca bir TESHIS kolonudur ve hicbir sorguda anahtar DEGILDIR.
 *
 * Gerekce nOAuth (2023): Microsoft Entra'da saldirgan kendi tenant'inda `mail`
 * alanini kurbanin adresine yazabilir. E-postayi kimlik anahtari saymak, o
 * saldiriyi calisir kilar.
 *
 * `users` ile ayni schema (`platform`) ve ayni modul (Identity) icinde oldugu
 * icin FK cross-schema/cross-module yasagini (ARCHITECTURE 6.1) ihlal etmez.
 * MULTI_TENANT_ARCHITECTURE 12.4 istisna listesinde — tenant RLS yok.
 *
 * ⚠️ VERITABANI YETKISI BU DOSYADAN OKUNAMAZ ve okunmamalidir: migration
 * `0040`, `provider_subject` uzerindeki `UPDATE`i acikca kaldirir ve yalnizca
 * `UPDATE (last_login_at)` verir. Drizzle sema tanimi bir ORM goruntusudur,
 * yetki kaynagi degildir (DEVELOPMENT_RULES 6).
 * ============================================================================
 */
export const federatedIdentities = platformSchema.table(
  'federated_identities',
  {
    id: uuid('id').primaryKey(),

    /** Sahibi olan kullanici. Kullanici silinirse baglanti da gider. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * `google` | `microsoft` | `linkedin` | `facebook`.
     *
     * ⚠️ Tur burada `text`tir, birlik (union) DEGIL: sinirdaki daraltmayi
     * mapper yapar (`toFederatedIdentity`), boylece bozuk bir kolon degeri
     * entity'ye ulasmadan yakalanir. Veritabani tarafinda kisit `0040`taki
     * CHECK'tir.
     */
    provider: text('provider').notNull(),

    /** ⚠️ Saglayicinin degismez `sub` degeri — kimligin TEK capasi. */
    providerSubject: text('provider_subject').notNull(),

    /** ⚠️ Yalnizca teshis. Baglama ANININ fotografi; bugunku gercek degil. */
    emailAtLink: text('email_at_link'),

    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),

    /** ⚠️ Bu tablodaki TEK guncellenebilir kolon (migration `0040`). */
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    // Bir saglayici hesabi EN FAZLA BIR kullaniciya baglanir.
    uniqueIndex('federated_identities_provider_subject_key').on(
      table.provider,
      table.providerSubject,
    ),
    // Bir kullanicinin saglayici basina EN FAZLA BIR hesabi olur.
    uniqueIndex('federated_identities_user_provider_key').on(table.userId, table.provider),
  ],
);
