import { sql } from 'drizzle-orm';
import { check, date, index, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

import { supplierContacts } from './supplier-contacts.schema';
import { supplierCompanies } from './suppliers.schema';
import { suppliersSchema } from './suppliers-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `suppliers.interactions` — gorusme gunlugu (ADR-0040 §1, §2.2).
 *
 * ============================================================================
 * ⚠️ CHUNK TABLOSU YOK — CRM'IN `interaction_chunks`I BIR EMSAL DEGIL, MIRAS
 * ============================================================================
 * Bu modul CRM'i "ucuza tekrar ediyor" ama onun parca tablosunu TEKRAR ETMIYOR.
 * Sebep, olcutun CRM'DEN SONRA yazilmis olmasidir (ADR-0035 §3 + ADR-0037 §3):
 *
 *     chunk tablosu, metnin ust sinirini KULLANICI degil
 *     VERININ KENDISI belirliyorsa acilir.
 *
 * Tedarikci gorusmesi bir FORMA yazilir; sinirini BIZ koyariz
 * (`MAX_INTERACTION_BODY_CHARS` = `TARGET_CHUNK_CHARS`) ve parcalayici bu
 * sinirin altinda HER ZAMAN tek parca uretirdi. `appointments.appointments` ve
 * `inventory.items` ile ayni sinif, UCUNCU kez.
 *
 * ⚠️ Bedeli: sinir SUNUCUDA zorlanir ve asilirsa 422. SESSIZ KIRPMA YASAK.
 * Yapistirilan uzun bir e-posta zincirinin dogru yeri BELGE moduludur.
 *
 * ============================================================================
 * ⚠️ `updated_at` YOKTUR — EKLEME-YALNIZ (ADR-0031 §6'nin `create` izni)
 * ============================================================================
 * Guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu koymak, ileride
 * birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR DAVET olurdu.
 *
 * ⚠️ BU, ADR-0039'UN DEGISTIRILEMEZ DEFTERI DEGILDIR ve karistirilmamalidir:
 * `inventory.movements` degistirilemez cunku BUGUNKU MIKTAR ondan turetilir.
 * Burada turetilen HICBIR SAYI yoktur; gunluk yalnizca guncellenmiyor.
 * Pratik farki: orada koruma UC KATMANLIYDI (izin yok + FK RESTRICT + metot
 * yok), burada `update` metodunun ve `write` izninin olmamasi YETER.
 */
export const supplierInteractions = suppliersSchema.table(
  'interactions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** ⚠️ NOT NULL — ADR-0031 §1.1: gorusme tanimi geregi bir firmayla yapilir. */
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => supplierCompanies.id, { onDelete: 'cascade' }),

    /**
     * ⚠️ `SET NULL`, `CASCADE` DEGIL (§1.3): bir KISININ silinmesi
     * KONUSULANIN KAYDINI silmemelidir. `crm.opportunities.contact_id` ile ayni
     * kural.
     */
    contactId: uuid('contact_id').references(() => supplierContacts.id, {
      onDelete: 'set null',
    }),

    authorUserId: uuid('author_user_id').notNull(),

    /**
     * `YYYY-MM-DD` — gorusmenin GERCEKLESTIGI gun.
     *
     * ⚠️ `date`, `timestamptz` DEGIL: bir tedarikci gorusmesinin SAATI anlamli
     * bir boyut degildir. Randevu (ADR-0035 §2c) tersini secmisti cunku orada
     * saat kaydin KENDISIYDI; burada `crm.interactions.occurred_on` ile ayni
     * sinifta.
     */
    occurredOn: date('occurred_on').notNull(),

    /** ⚠️ Ust sinir DOMAINDE zorlanir; asilirsa 422 — sessiz kirpma YASAK. */
    body: text('body').notNull(),

    /**
     * 1536 = `text-embedding-3-small` cikti boyutu.
     *
     * ⚠️ NULLABLE ve bu bir ARIZA DEGIL, iki asamali yazma akisinin (T1 kayit /
     * T2 vektor) dogal ara halidir: embedding cokerse GORUSME KAYBOLMAZ,
     * yalnizca aranamaz kalir. `POST /suppliers/reindex` onarir.
     */
    embedding: vector('embedding', { dimensions: 1536 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('supplier_interactions_body_not_blank', sql`btrim(${table.body}) <> ''`),

    /** "Bu tedarikciyle ne konustuk" — en yeni once (bir GECMIS akisi). */
    index('supplier_interactions_tenant_supplier_occurred_idx').on(
      table.tenantId,
      table.supplierId,
      table.occurredOn.desc(),
    ),
    index('supplier_interactions_tenant_occurred_idx').on(table.tenantId, table.occurredOn.desc()),
    index('supplier_interactions_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);
