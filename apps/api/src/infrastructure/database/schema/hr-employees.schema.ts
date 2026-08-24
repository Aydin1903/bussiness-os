import { date, index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { hrSchema } from './hr-schema.schema';
import { tenants } from './tenants.schema';

/**
 * `hr.employees` — calisanin kendisi (ADR-0043 §1.1).
 *
 * ============================================================================
 * ⚠️ BU TABLO `platform.memberships` DEGILDIR VE ONDAN TURETILMEZ (§2)
 * ============================================================================
 * "Kim bu sirkette CALISIYOR" ile "kimin sisteme GIRISI var" iki ayri sorudur
 * ve kumeler IKI YONDE DE ayrisir: depo gorevlisinin platform hesabi yoktur,
 * dis mali musavir calisan degildir. Ikisi tek kayit olsaydi bu iki durum
 * TEMSIL EDILEMEZDI.
 *
 * ⚠️ Yasam dongusu de TERS yonde ayrisir: isten ayrilanin UYELIGI derhal
 * kesilmeli (guvenlik), IK KAYDI ise durmalidir (kurumsal hafiza + yasal
 * saklama).
 *
 * ============================================================================
 * ⚠️ SERBEST NOT ALANI YOKTUR — VE EKLENMEMELIDIR (§1.1)
 * ============================================================================
 * Bir IK kaydindaki serbest metin alanina ILK yazilacak sey SAGLIK
 * BILGISIDIR. ADR-0043 §3'un sinirini koyup yanina bos bir metin kutusu
 * birakmak, siniri KULLANICIYA IHLAL ETTIRMEK olurdu.
 *
 * ⚠️ MAAS DA BURADA DEGILDIR: `hr.compensation_records` ayri bir tablodur ve
 * bu, §4.2'nin BIRINCI izolasyon katmanidir — bir `SELECT *`in maasi
 * yanlislikla tasimasi boylece mumkun degildir.
 */
export const hrEmployees = hrSchema.table(
  'employees',
  {
    id: uuid('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** ⚠️ TEK ALAN — kultur varsayimi yapilmaz (§1.6). */
    fullName: text('full_name').notNull(),

    /**
     * ⚠️ `role` DEGIL (§1.3): bu projede `role` owner/admin/member/viewer
     * demektir. Bir IK unvani YETKI DEGIL, IS TANIMIDIR. Serbest metin.
     */
    jobTitle: text('job_title'),

    /** ⚠️ IS iletisimi — adlar bilerek NITELENMIS (§3.5). */
    workEmail: text('work_email'),
    workPhone: text('work_phone'),

    employmentStatus: text('employment_status').notNull().default('active'),
    startedOn: date('started_on'),
    endedOn: date('ended_on'),

    /**
     * ⚠️ Opsiyonel bag — FK YOK (Mutlak Kural 5). Yazarken
     * `TenantAccessQuery.resolveMemberAccess` ile dogrulanir; sarkma TOLERE
     * EDILIR ve burada bir bozulma degil DOGRU DURUMDUR (§2.5).
     */
    platformUserId: uuid('platform_user_id'),

    // --- IK v2 (ADR-0044 §3) — bes alan, her biri §3.5'in olcutunden gecti ---
    /** Ekip bazli filtre + patronun "hangi ekip ne kadar" sorusu. */
    department: text('department'),
    /** `full_time` | `part_time` | `contract` | `intern`. */
    employmentType: text('employment_type').notNull().default('full_time'),
    /** `office` | `remote` | `hybrid` — IK'nin en cok sorulan alani. */
    workMode: text('work_mode').notNull().default('office'),
    /** ⚠️ Patronun alarm kalemi: yaklasan sozlesme bitisleri. */
    contractEndsOn: date('contract_ends_on'),
    /**
     * ⚠️ HAK EDIS BIR MEVZUAT KURALI DEGIL, BIR SAYIDIR (§2.2). Turkiye'de
     * kidemle degisir (14/20/26) ama bu ULKEYE OZEL MEVZUATTIR ve ulke
     * degisince bastan yazilir — ADR-0041'in e-fatura ve ADR-0043'un bordro
     * gerekcesiyle birebir ayni. Sistem carpar ve cikarir, KURAL BILMEZ.
     */
    annualLeaveDays: integer('annual_leave_days').notNull().default(0),
    /**
     * ⚠️ KENDINE REFERANS. Dongu (A -> B -> A) VERITABANINDA ENGELLENMEZ:
     * kontrol ozyinelemeli sorgu ister ve HER YAZMADA calisirdi. Okuma tarafi
     * dayanikli yazilir (derinlik siniri). Yalnizca EN KISA dongu
     * (kendisi = yoneticisi) CHECK ile engellenir.
     */
    managerEmployeeId: uuid('manager_employee_id'),

    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // ⚠️ Kismi index — `NULL`lar tekillige girmez: hesabi olmayan calisan
    // sayisi sinirsizdir, ama bir hesap EN FAZLA BIR calisana baglanir.
    uniqueIndex('employees_platform_user_unique')
      .on(table.tenantId, table.platformUserId)
      .where(sql`platform_user_id IS NOT NULL`),
    index('employees_tenant_status_idx').on(table.tenantId, table.employmentStatus, table.fullName),
  ],
);
