import { index, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { loyaltySchema } from './loyalty-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `loyalty.accounts` — bir musterinin PROGRAMDAKI KAYDI (ADR-0051 §1.2).
 *
 * ============================================================================
 * ⚠️ `balance` DIYE BIR KOLON YOKTUR (ADR-0051 §4.1)
 * ============================================================================
 * Bakiye HER OKUMADA `point_entries`ten turetilir. Projede ON DORDUNCU kez
 * verilen ayni karar ve gerekce yine HATANIN SEKLIDIR: bir kolon tutulsaydi,
 * onu guncellemeyi unutan bir yol SESSIZ ve MAKUL GORUNEN yanlis bir bakiye
 * uretirdi — musteri odul alamaz ve kimse nedenini bilmezdi.
 *
 * ⚠️ Bedeli acikca kayitlidir: "bakiye negatife dusemez" bir SATIRLAR ARASI
 * kosuldur ve bir `CHECK` onu GOREMEZ. Yani o degismezin VERITABANI GARANTISI
 * YOKTUR; tek dayanak harcama yazan TEK kod yolu ve `SELECT ... FOR UPDATE`
 * satir kilididir (§4.4).
 *
 * ============================================================================
 * ⚠️ GUNCELLENEBILIR ALANI YOKTUR — `updated_at` de YOK (§2.2)
 * ============================================================================
 * `feedback.responses` ile ayni gerekce: guncellenmeyen bir satirin
 * guncellenme zamani da olmaz; kolonu koymak OLMAYAN BIR YOLUN VAR OLDUGUNU
 * ima ederdi. `PATCH` ucu de yoktur ve `businessos_app` rolune bu tabloda
 * `UPDATE` yetkisi VERILMEZ (migration `0039`).
 */
export const loyaltyAccounts = loyaltySchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * ⚠️ CROSS-MODUL ISARETCI — ve projede ILK KEZ **ZORUNLU** (§6.1).
     *
     * Bugune kadarki BES isaretcinin BESI DE nullable'di ve gerekce hep
     * ayniydi: _"zorunlu olsaydi kullanici SAHTE KAYIT acardi."_
     *
     * ⚠️ BURADA O DERS TERS ISLIYOR: bir isletme puan verdigi kisiyi ZATEN
     * TANIMAK ZORUNDADIR — yoksa musteri geri geldiginde puanini BULAMAZ.
     * Zorunluluk uydurma veri degil, GERCEK MUSTERI KAYDI uretir.
     *
     * ⚠️ FK YOKTUR (Mutlak Kural 5): `NOT NULL` "bir id VAR" garantisidir,
     * "o musteri VAR" garantisi DEGILDIR. Sarkan isaretci TOLERE EDILIR ve bu
     * modulde ILK KEZ kaydi KULLANILAMAZ kilar (§9.2) — ekran bunu ACIKCA
     * soyler, "silinmis" DEMEZ.
     *
     * ⚠️ DEGISTIRILEMEZ: onu degistirmek BIR BAKIYEYI BASKA BIR INSANA
     * DEVRETMEKTIR. Yanlis kisiye acilmis hesabin cozumu SILIP YENIDEN
     * ACMAKTIR.
     */
    crmContactId: uuid('crm_contact_id').notNull(),

    /** Satir ici aktor damgasi (ADR-0041 §8 deseni). */
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * ⚠️ ADR-0047'NIN TAM TERSI BIR KARAR.
     *
     * Kampanya'da `UNIQUE (tenant_id, name)` REDDEDILMISTI cunku ayni ad her
     * ay tekrarlanabilir ve ikisi de GERCEKTIR. Burada ayni musteriye ikinci
     * bir hesap GERCEK BIR OLGU DEGILDIR: bakiyeyi IKIYE BOLER ve hata
     * SESSIZDIR — ADR-0039'un `ABC-1`/`abc-1` SKU tuzaginin ayni sekli.
     *
     * ⚠️ Sonucu: bu modulde **409 VARDIR**.
     */
    unique('accounts_tenant_contact_unique').on(table.tenantId, table.crmContactId),

    /**
     * ⚠️ GEREKSIZ GORUNUR AMA `point_entries`in BILESIK FK'SININ ON KOSULUDUR.
     *
     * `id` zaten birincil anahtardir. ⚠️ Silinirse migration
     * "there is no unique constraint matching given keys" ile PATLAR —
     * ADR-0034'un `categories_id_direction_unique` kisitiyla BIREBIR AYNI
     * durum, ve bir entegrasyon testi onun VARLIGINI koruyor.
     */
    unique('accounts_tenant_id_unique').on(table.tenantId, table.id),
    index('accounts_tenant_created_idx').on(table.tenantId, table.createdAt.desc()),
  ],
);
