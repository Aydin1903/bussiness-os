import { sql } from 'drizzle-orm';
import { check, index, smallint, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

import { feedbackSchema } from './feedback-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `feedback.responses` — geri bildirim kaydi (ADR-0045 §1, §2).
 *
 * ============================================================================
 * ⚠️ CHUNK TABLOSU YOK — IKI EMSALIN ORTAK OLCUTU (ADR-0045 §1.2)
 * ============================================================================
 * Kural, ADR-0035 §3 ve ADR-0037 §3'un BIRLIKTE urettigi cumledir:
 *
 *     chunk tablosu, metnin ust sinirini KULLANICI degil
 *     VERININ KENDISI belirliyorsa acilir.
 *
 * Bir geri bildirim yorumunun ust sinirini BIZ koyariz
 * (`MAX_FEEDBACK_COMMENT_CHARS` = `TARGET_CHUNK_CHARS`) ve parcalayici bu
 * sinirin altinda HER ZAMAN tek parca uretirdi. `appointments.appointments`,
 * `inventory.items` ve `suppliers.interactions` ile ayni sinif, DORDUNCU kez.
 *
 * ⚠️ Bedeli: sinir SUNUCUDA zorlanir ve asilirsa 422. SESSIZ KIRPMA YASAK.
 *
 * ============================================================================
 * ⚠️ `updated_at` YOKTUR — KAYIT GUNCELLENMEZ (ADR-0045 §2)
 * ============================================================================
 * Guncellenmeyen bir satirin guncellenme zamani olmaz. Kolonu koymak, ileride
 * birinin "demek ki guncellenebiliyor" diye okuyacagi SESSIZ BIR DAVET olurdu.
 *
 * ⚠️ AMA BU, `suppliers.interactions` ILE DE AYNI DEGILDIR: orada satir NE
 * guncellenir NE silinir. Burada SILINEBILIR ve gerekcesi KVKK'dir (§2.2) —
 * bir yorum kisisel veri icerebilir ve veri sahibinin silme talebi hakki
 * vardir. Koruma bu yuzden UC katmanlidir ama DORDUNCUSU (silme yasagi)
 * BILEREK YOKTUR:
 *
 *     izin: `feedback:write` YOK (`create` + `delete` VAR)
 *     kod:  entity'de `update`, repository'de `update` YOK
 *     db:   `UPDATE` yalnizca `embedding` kolonunda (`0037`)
 */
export const feedbackResponses = feedbackSchema.table(
  'responses',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * 1..5 — olcek SABIT (§1.3).
     *
     * ⚠️ `scale` kolonu YOKTUR: NPS bir sayi degil bir METODOLOJIDIR ve ayni
     * tabloya karistirilsaydi `rating`in anlami satirdan satira degisir,
     * ortalama SESSIZCE YANLIS olurdu.
     *
     * ⚠️ Kisit VERITABANINDA da var (`feedback_responses_rating_range`): Zod
     * HTTP'den geleni baglar, CHECK HTTP'yi ATLAYAN her yolu baglar.
     */
    rating: smallint('rating').notNull(),

    /**
     * ⚠️ OPSIYONEL — ve bedeli §3.5'te kayitli: yorumsuz bir kaydin embed
     * edilecek metni yoktur, yani `POST /ask` havuzunda HICBIR SESI OLMAZ.
     *
     * ⚠️ Ust sinir DOMAINDE zorlanir; asilirsa 422 — sessiz kirpma YASAK.
     */
    comment: text('comment'),

    /**
     * Serbest metin etiketi (§1.5) — `"Google"`, `"telefon"`, `"kagit form"`.
     *
     * ⚠️ Bir BOYUT DEGIL, bir ETIKET: `"google"` ve `"Google"` iki ayri deger
     * olur ve kanala gore gruplama GUVENILMEZDIR.
     */
    channel: text('channel'),

    /**
     * ⚠️ CROSS-MODUL ISARETCI — FK YOK (cross-schema FK yasak, Mutlak Kural 5).
     *
     * ⚠️ `null` YAYGIN DURUMDUR: gercek geri bildirimlerin cogu ANONIMDIR.
     * Zorunlu olsaydi kullanici SAHTE CRM KISILERI acar ve BASKA BIR MODULUN
     * (CRM'in) musteri listesi kirlenirdi (§6.2).
     *
     * ⚠️ Ad DENORMALIZE EDILMEZ: her okumada `ContactDirectory.findNames` ile
     * cozulur ve okuma `contact:read` iznine baglidir. Sarkan isaretci TOLERE
     * EDILIR — ad cozulemezse GOSTERILMEZ, uydurulmaz.
     */
    crmContactId: uuid('crm_contact_id'),

    /**
     * Geri bildirimin ALINDIGI an.
     *
     * ⚠️ `timestamptz`, `date` DEGIL: bir geri bildirim bir ANDA gelir ve ayni
     * gun icindeki sirasi anlamlidir (`suppliers.interactions.occurred_on`un
     * tersi karar; orada gunluk bir GUNE aitti).
     */
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),

    /**
     * 1536 = `text-embedding-3-small` cikti boyutu.
     *
     * ⚠️ NULLABLE ve IKI ayri mesru sebebi var: (a) iki asamali yazma akisinin
     * (T1 kayit / T2 vektor) ara hali — embedding cokerse KAYIT KAYBOLMAZ;
     * (b) ⚠️ YORUMSUZ KAYITTA KALICI OLARAK `NULL` — gomulecek metin yoktur.
     *
     * ⚠️ Ikinci sebep bu modulde YENIDIR ve `reindex`in is listesini etkiler:
     * `WHERE embedding IS NULL` TEK BASINA YETMEZ, `comment IS NOT NULL` de
     * gerekir — yoksa onarim her cagrida ayni yorumsuz satirlari secip
     * SONSUZA KADAR bir sey yapmazdi.
     */
    embedding: vector('embedding', { dimensions: 1536 }),

    /**
     * ⚠️ Yalnizca KAYDI GIRENI tutar; bir denetim izi DEGILDIR.
     *
     * ⚠️ Ama bu modulde borc KENDILIGINDEN KAPANIR (ADR-0039'un hareket
     * defteriyle ayni sinif): satir guncellenmedigi icin "bu puani kim
     * degistirdi" diye BIR SORU YOKTUR.
     */
    createdByUserId: uuid('created_by_user_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('feedback_responses_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    check(
      'feedback_responses_comment_not_blank',
      sql`${table.comment} IS NULL OR btrim(${table.comment}) <> ''`,
    ),
    check(
      'feedback_responses_channel_not_blank',
      sql`${table.channel} IS NULL OR btrim(${table.channel}) <> ''`,
    ),

    /** Liste bir GECMIS AKISIDIR — en yeni once. */
    index('feedback_responses_tenant_received_idx').on(table.tenantId, table.receivedAt.desc()),

    /** Puan bandi filtresi + duvarin `<= 2` sayaci. */
    index('feedback_responses_tenant_rating_received_idx').on(
      table.tenantId,
      table.rating,
      table.receivedAt.desc(),
    ),

    index('feedback_responses_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);
