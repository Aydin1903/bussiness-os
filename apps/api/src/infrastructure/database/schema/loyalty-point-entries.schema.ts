import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { loyaltyAccounts } from './loyalty-accounts.schema';
import { loyaltySchema } from './loyalty-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `loyalty.point_entries` — DEGISTIRILEMEZ defter (ADR-0051 §1.3, §2).
 *
 * ============================================================================
 * ⚠️ DEFTER DEGISTIRILEMEZ AMA HESAP SILINEBILIR — BESINCI SEKIL (§2.1)
 * ============================================================================
 * Ayrimi yapan sey ADR-0039'un olcutudur ve iki soru FARKLI cevap verir:
 *
 *   Tek bir SATIRI silmek/guncellemek -> bakiyeyi SESSIZCE YENIDEN YAZAR.
 *                                        500 puanlik hesap bir satir silinince
 *                                        200 olur ve KIMSE BILMEZ. -> YASAK
 *   ⚠️ HESABIN TAMAMINI silmek        -> bakiyeyi yeniden yazmaz, YOK EDER.
 *                                        Hicbir sayiyi yalanlamaz. -> SERBEST
 *
 * ⚠️ Ve silme yolunun VAR OLMASI bir kolaylik degil bir YUKUMLULUKTUR: hesap
 * BIR KISIYE baglidir ve silme hakki KVKK m.7/m.11'dir. `RESTRICT`
 * (ADR-0039'un ucuncu katmani) burada KULLANILAMAZDI — hareketi olan her hesap
 * silinemez olurdu ve silinemeyen bir kisisel veri kaydi bir UYUM IHLALIDIR.
 *
 * ============================================================================
 * ⚠️ DEGISTIRILEMEZLIGIN UC KATMANI (§2.3)
 * ============================================================================
 *   1. DOMAIN  — `PointEntry`de `update` metodu YOK; repository'de tekil
 *                `deleteEntry` YOK.
 *   2. IZIN    — ⚠️ `loyalty_point:delete` DIYE BIR IZIN YOKTUR
 *                (`stock_movement`in ayni karari).
 *   3. ⚠️ VERITABANI — `businessos_app` rolune YALNIZCA `SELECT, INSERT`
 *                verilir (migration `0039`). `UPDATE`/`DELETE` YOK.
 *
 * ⚠️ Ucuncu katman bir soru aciyordu: `DELETE` yetkisi olmadan
 * `ON DELETE CASCADE` calisir mi? Cevap bir IDDIA olarak degil, gercek bir
 * PostgreSQL'de kosan bir entegrasyon testiyle veriliyor
 * (`loyalty-schema.integration.spec.ts`).
 */
export const loyaltyPointEntries = loyaltySchema.table(
  'point_entries',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ AYNI SEMA — gercek FK, ama TEKIL DEGIL **BILESIK** (asagida).
     *
     * ⚠️ Duz bir `references(() => loyaltyAccounts.id)` ILK TASARIMDI ve Slice
     * 1'in entegrasyon testi onun BIR TENANT SINIRI IHLALINE izin verdigini
     * OLCTU: PostgreSQL'de referans butunlugu denetimi RLS'i ATLAR, yani FK
     * cagiranin GOREMEDIGI bir hesabi bulur ve kabul eder.
     */
    accountId: uuid('account_id').notNull(),

    /**
     * ⚠️ ARITMETIK EKSEN — isaretli puan DEGIL (§1.4).
     *
     * ADR-0034 §5 ve ADR-0039 §3'un UCUNCU uygulamasi: isaretli bir miktarda,
     * isaret koymayi unutan TEK bir yol bir harcamayi kazanc gibi toplardi ve
     * hata SESSIZ ve MAKUL GORUNEN yanlis bir sayi uretirdi.
     *
     * ⚠️ `is_correction` YOKTUR (ADR-0039'dan bilincli sapma): Stok'ta bayragi
     * SISTEM koyuyordu (`recordCount`); burada her satiri insan yaziyor ve
     * bayrak kullanicinin KENDI HATASI HAKKINDAKI BEYANINA dayanirdi.
     * Duzeltme TERS YONDE BIR SATIRDIR (ADR-0041'in iskonto karari).
     */
    direction: text('direction').notNull(),

    /**
     * ⚠️ `integer` — `numeric` DEGIL (§1.5). Puan SAYILIR, olculmez; 3,5 kg
     * gercektir ama 3,5 puan degildir.
     *
     * ⚠️ Ust sinir YOKTUR: icat edilmis bir sayi olurdu. Bir tipo bakiyeyi
     * sisirir ama hata GORUNURDUR ve telafi bir ters satirdir.
     */
    points: integer('points').notNull(),

    /**
     * ⚠️ BIR ETIKET, anlatisal metin DEGIL — ve tam olarak bu yuzden
     * EMBED EDILMEZ (§3.1). Yuzlerce kayitta tekrar eden "Alisveris puani",
     * ADR-0034 §6.1'in `Ocak kirasi / Subat kirasi` havuz kirlenmesinin ayni
     * seklidir (DORDUNCU kez). ⚠️ Bu modulde vektor YOKTUR.
     */
    note: text('note'),

    /**
     * ⚠️ GELECEGE YAZILAMAZ (§1.6) — kontrol UYGULAMADADIR.
     *
     * `CHECK (occurred_at <= now())` YAZILAMAZ: `now()` STABIL DEGILDIR ve
     * PostgreSQL kisitlarda IMMUTABLE ifade ister. Yani bu, bilincli olarak
     * uygulama katmaninda kalan IKINCI kuraldir (birincisi bakiye).
     */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * ⚠️ PROJEDE ILK KEZ SATIR ICI DAMGA BIR DENETIM IZINDEN ZAYIF DEGIL
     * (§2.4). ADR-0041/0047 damgayi kullanirken _"bu bir denetim izi degildir;
     * son durumu soyler, ne oldugunu SIRASIYLA anlatmaz"_ yaziyordu.
     * Ekleme-yalniz bir defterde DAMGANIN KENDISI SIRADIR.
     */
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('point_entries_direction_valid', sql`${table.direction} IN ('earn', 'spend')`),
    check('point_entries_points_positive', sql`${table.points} > 0`),
    check('point_entries_note_not_blank', sql`${table.note} IS NULL OR btrim(${table.note}) <> ''`),

    /**
     * ⚠️ BILESIK FK — VE BU, BIR OLCUMDEN DOGDU (Slice 1 entegrasyon testi).
     *
     * ============================================================================
     * ⚠️ REFERANS BUTUNLUGU DENETIMI RLS'I ATLAR
     * ============================================================================
     * Duz bir `account_id -> accounts(id)` FK'si ile tenant A, tenant B'nin
     * hesabina isaret eden bir defter satiri YAZABILIYORDU: RI sorgusu satir
     * guvenligi DEVRE DISI kosar ve RLS'in `WITH CHECK`i yalnizca satirin KENDI
     * `tenant_id`sini baglar — ISARET ETTIGI SATIRI DEGIL.
     *
     * Cozum ADR-0034'un `finance.transactions` deseninin AYNISIDIR: `tenant_id`
     * bilesigin parcasi olur ve RLS onu cagiranin tenant'ina ZORLADIGI icin,
     * baska bir tenant'in hesabina isaret eden bir satir VERITABANI SEVIYESINDE
     * IMKANSIZ hale gelir.
     *
     * ⚠️ Uygulama katmani zaten guvenliydi (`lockAccountById` RLS'e tabidir);
     * bu, o korumayi VERITABANINA indiren IKINCI katmandir.
     *
     * ⚠️ `CASCADE` KORUNDU ve calistigi OLCULDU: `businessos_app` rolune
     * `point_entries` uzerinde `DELETE` VERILMEMIS olsa bile hesap silindiginde
     * satirlar gercekten gidiyor (ADR-0051 §2.3'un iddiasi KANITLANDI).
     */
    foreignKey({
      name: 'point_entries_tenant_account_fkey',
      columns: [table.tenantId, table.accountId],
      foreignColumns: [loyaltyAccounts.tenantId, loyaltyAccounts.id],
    }).onDelete('cascade'),

    /** ⚠️ Bakiye sorgusunun tasiyicisi — turetme karari buna dayanir. */
    index('point_entries_tenant_account_idx').on(table.tenantId, table.accountId),
    index('point_entries_tenant_occurred_idx').on(table.tenantId, table.occurredAt.desc()),
  ],
);
