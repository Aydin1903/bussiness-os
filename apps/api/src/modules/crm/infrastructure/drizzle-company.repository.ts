import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import {
  companies,
  contacts,
  interactions,
  opportunities,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type CompanyListRow,
  type CompanyRepository,
  type ListPage,
} from '../application/company.repository.port';
import { Company } from '../domain/company.entity';
import { CLOSED_STAGES } from '../domain/opportunity.entity';

/**
 * `CompanyRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0016`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleCompanyRepository implements CompanyRepository {
  async save(company: Company): Promise<void> {
    const { db } = requireTransaction();
    const state = company.toState();

    // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
    await db
      .insert(companies)
      .values(state)
      .onConflictDoUpdate({
        target: companies.id,
        set: {
          name: state.name,
          industry: state.industry,
          email: state.email,
          phone: state.phone,
          website: state.website,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Company | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : Company.fromPersistence(row);
  }

  /**
   * Sayfali liste — SON TEMAS gunuyle.
   *
   * ============================================================================
   * IKI SORGU, ILISKILI ALT SORGU DEGIL — ve N+1 DE DEGIL
   * ============================================================================
   * Once sayfa cekilir, sonra YALNIZCA o sayfadaki id'ler icin tek bir
   * gruplanmis sorgu atilir. Yani istek sayisi sabittir (2), sayfa uzunlugundan
   * bagimsizdir; musteri basina bir sorgu atan N+1 deseni DEGILDIR.
   *
   * Iliskili bir alt sorgu (`SELECT max(...) ... WHERE company_id = companies.id`)
   * once denendi ve entegrasyon testinde `null` dondu: Drizzle'in `sql`
   * sablonunda gomulu tablo/kolon referanslarinin nasil render edildigi opak
   * kaldi. Tahminle duzeltmek yerine, uretilen SQL'i okunur ve ongorulebilir
   * kilan bu yol secildi. Bedeli bir ekstra gidis-donus; kazanci, sorgunun ne
   * yaptiginin dosyaya bakarak anlasilabilmesi.
   *
   * ⚠️ `LEFT JOIN` semantigi KORUNUR: haritada bulunmayan musteri listeden
   * DUSMEZ, degeri `null` olur. `INNER JOIN` olsaydi yeni eklenmis her musteri
   * listede HIC gorunmezdi — sessizce kaybolan kayitlar.
   *
   * Ikinci sorgu da RLS altindadir; baska tenant'in gorusmesi haritaya giremez.
   * `crm.interactions` uzerindeki `(tenant_id, company_id)` indeksi (migration
   * `0018`) bu erisimi karsilar.
   */
  async list(input: { limit: number; offset: number }): Promise<ListPage<CompanyListRow>> {
    const { db } = requireTransaction();

    // Siralamada `id` TIE-BREAKER'dir: ayni milisaniyede olusan iki kayitta
    // kararsiz siralama, sayfalamada bir kaydin iki kez ya da hic gorunmesi
    // demektir (ADR-0029'un liste ucunda ogrenilen ders).
    const rows = await db
      .select()
      .from(companies)
      .orderBy(desc(companies.createdAt), desc(companies.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(companies);

    // Uc yardimci sorgu PARALEL: birbirini beklemeleri icin bir sebep yok ve
    // ucu de ayni sayfanin id'leriyle sinirli.
    const ids = rows.map((row) => row.id);
    const [lastContact, contactCounts, openOpportunityCounts] = await Promise.all([
      this.#lastContactMap(ids),
      this.#contactCountMap(ids),
      this.#openOpportunityCountMap(ids),
    ]);

    return {
      items: rows.map((row) => ({
        ...Company.fromPersistence(row).toState(),
        lastInteractionOn: lastContact.get(row.id) ?? null,
        // Haritada YOKSA sifir: gruplanmis sayim yalnizca EN AZ BIR satiri
        // olan musteriyi dondurur (`LEFT JOIN` semantiginin ayni uygulamasi).
        contactCount: contactCounts.get(row.id) ?? 0,
        openOpportunityCount: openOpportunityCounts.get(row.id) ?? 0,
      })),
      total: counted?.total ?? 0,
    };
  }

  /**
   * Musteri id -> yetkili sayisi.
   *
   * ============================================================================
   * IKI SAYAC AYRI AYRI YAZILDI — ortak bir yardimciya CIKARILMADI
   * ============================================================================
   * Sekilleri ayni ("grupla ve say"), dolayisiyla tek bir jenerik yardimci
   * cazip gorunuyor. Denendi: Drizzle'in tablo ve kolon tipleri uzerinde
   * soyutlama yapmak `any` gerektiriyordu ve `no-explicit-any` bu projede
   * HATADIR (DEVELOPMENT_RULES 2.3). On iki satirlik tekrar, dogrulamayi
   * atlayan bir tip zorlamasindan iyidir.
   *
   * `count(*)::int` ACIK ve gerekli: PostgreSQL `count` icin `bigint` doner ve
   * surucu onu JS'te STRING'e cevirir — `::int` olmadan sayac bir metin olurdu.
   */
  async #contactCountMap(companyIds: readonly string[]): Promise<Map<string, number>> {
    if (companyIds.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();

    const rows = await db
      .select({ companyId: contacts.companyId, total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(inArray(contacts.companyId, [...companyIds]))
      .groupBy(contacts.companyId);

    return new Map(rows.map((row) => [row.companyId, row.total]));
  }

  /**
   * Musteri id -> ACIK firsat sayisi.
   *
   * Yuklem `listFollowUps` ve `listOpenPipeline` ile AYNI: kapanmis asamalar
   * dislanir ve kume tek tanimdan (`CLOSED_STAGES`) gelir. "Su an kac isim
   * var" sorusunun cevabi kapanmis anlasmalari icermez.
   */
  async #openOpportunityCountMap(companyIds: readonly string[]): Promise<Map<string, number>> {
    if (companyIds.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();

    const rows = await db
      .select({ companyId: opportunities.companyId, total: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          inArray(opportunities.companyId, [...companyIds]),
          notInArray(opportunities.stage, [...CLOSED_STAGES]),
        ),
      )
      .groupBy(opportunities.companyId);

    return new Map(rows.map((row) => [row.companyId, row.total]));
  }

  /**
   * Musteri id -> en son gorusme gunu.
   *
   * `to_char(...)` ACIKTIR ve gereklidir: `date` kolonlari icin surucu
   * varsayilan olarak bir `Date` NESNESI dondurebilir ve o nesne dilim
   * cevirisine tabi olur — takvim gununun tam olarak kacinmasi gereken sey.
   * Metin olarak uretmek, degerin sunucudan ekrana kadar `YYYY-MM-DD` kalmasini
   * garanti eder.
   */
  async #lastContactMap(companyIds: readonly string[]): Promise<Map<string, string>> {
    if (companyIds.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();

    const rows = await db
      .select({
        companyId: interactions.companyId,
        lastOn: sql<string>`to_char(max(${interactions.occurredOn}), 'YYYY-MM-DD')`,
      })
      .from(interactions)
      .where(inArray(interactions.companyId, [...companyIds]))
      .groupBy(interactions.companyId);

    return new Map(rows.map((row) => [row.companyId, row.lastOn]));
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db.delete(companies).where(eq(companies.id, id)).returning({
      id: companies.id,
    });
    return deleted.length;
  }
}
