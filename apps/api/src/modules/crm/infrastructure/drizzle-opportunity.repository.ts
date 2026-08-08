import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { companies, opportunities } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/company.repository.port';
import {
  type FollowUpRow,
  type OpportunityListRow,
  type OpportunityOrder,
  type OpportunityRepository,
  type PipelineRow,
} from '../application/opportunity.repository.port';
import { InvalidOpportunityStageError } from '../domain/crm.error';
import {
  CLOSED_STAGES,
  isOpportunityStage,
  Opportunity,
  type OpportunityStage,
} from '../domain/opportunity.entity';

/** RLS notu: bkz. `DrizzleCompanyRepository`. */
@Injectable()
export class DrizzleOpportunityRepository implements OpportunityRepository {
  async save(opportunity: Opportunity): Promise<void> {
    const { db } = requireTransaction();
    const state = opportunity.toState();

    await db
      .insert(opportunities)
      .values(state)
      .onConflictDoUpdate({
        target: opportunities.id,
        set: {
          title: state.title,
          stage: state.stage,
          estimatedValue: state.estimatedValue,
          currency: state.currency,
          nextFollowUpOn: state.nextFollowUpOn,
          contactId: state.contactId,
          stageChangedAt: state.stageChangedAt,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Opportunity | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toEntity(row);
  }

  /**
   * Sayfali liste — sirket adiyla.
   *
   * ============================================================================
   * `innerJoin` SATIR DUSURMEZ
   * ============================================================================
   * `company_id` NOT NULL ve `ON DELETE CASCADE` ile `crm.companies`e baglidir:
   * eslesmeyen bir firsat satiri VAR OLAMAZ. Bu yuzden `leftJoin` gereksizdir
   * ve `companyName`i `string | null` yapip her cagirana bos kontrol yazdirirdi.
   * `listOpenPipeline` ayni join'i ayni gerekceyle zaten yapiyor.
   *
   * SAYIM sorgusu join'SIZ kalir: 1:1 oldugu icin sonuc ayni, maliyeti daha az.
   */
  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    stage: OpportunityStage | null;
    orderBy: OpportunityOrder;
  }): Promise<ListPage<OpportunityListRow>> {
    const { db } = requireTransaction();

    // IS filtreleri elle yazilir; TENANT filtresi yine RLS'in isidir.
    const filters: SQL[] = [];
    if (input.companyId !== null) filters.push(eq(opportunities.companyId, input.companyId));
    if (input.stage !== null) filters.push(eq(opportunities.stage, input.stage));
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await db
      .select({ opportunity: opportunities, companyName: companies.name })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(where)
      .orderBy(...orderColumns(input.orderBy))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(where);

    return {
      items: rows.map((row) => ({
        ...toEntity(row.opportunity).toState(),
        companyName: row.companyName,
      })),
      total: counted?.total ?? 0,
    };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db
      .delete(opportunities)
      .where(eq(opportunities.id, id))
      .returning({ id: opportunities.id });
    return deleted.length;
  }

  /**
   * ACIK firsat anlik goruntusu — YAPISAL katki (ADR-0031 §5.4).
   *
   * SIRALAMA iki kademelidir ve bu KASITLIDIR:
   *   1. GECIKMIS takipler once — "yapilacak is" sinyalinin en guclusu.
   *   2. Sonra tahmini deger (buyukten kucuge); degeri olmayan en sonda.
   *
   * `limit` katkicidan gelir ve KUCUKTUR (3): yapisal katki her soruda
   * gonderilir, bu yuzden sabit ve kucuk tutulmak ZORUNDADIR.
   */
  async listOpenPipeline(input: { limit: number }): Promise<PipelineRow[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        opportunityId: opportunities.id,
        companyName: companies.name,
        title: opportunities.title,
        stage: opportunities.stage,
        estimatedValue: opportunities.estimatedValue,
        currency: opportunities.currency,
        stageChangedAt: opportunities.stageChangedAt,
        nextFollowUpOn: opportunities.nextFollowUpOn,
      })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(notInArray(opportunities.stage, [...CLOSED_STAGES]))
      .orderBy(
        // Gecikmis olanlar ONCE. `NULLS LAST` degeri olmayani sona atar.
        sql`(${opportunities.nextFollowUpOn} IS NOT NULL AND ${opportunities.nextFollowUpOn} < CURRENT_DATE) DESC`,
        sql`${opportunities.estimatedValue} DESC NULLS LAST`,
        asc(opportunities.id),
      )
      .limit(input.limit);

    return rows.map((row) => ({
      opportunityId: row.opportunityId,
      companyName: row.companyName,
      title: row.title,
      stage: toStage(row.stage),
      estimatedValue: row.estimatedValue,
      currency: row.currency,
      stageChangedAt: row.stageChangedAt,
      nextFollowUpOn: row.nextFollowUpOn,
    }));
  }

  /**
   * Yuklem, migration `0017`'deki KISMI INDEX ile BIREBIR eslesir:
   * `next_follow_up_on IS NOT NULL AND stage NOT IN ('won','lost')`.
   * Ikisi ayrisirsa index devre disi kalir ve sorgu tam tarama yapar.
   */
  async listFollowUps(input: { limit: number; offset: number }): Promise<ListPage<FollowUpRow>> {
    const { db } = requireTransaction();

    const where = and(
      isNotNull(opportunities.nextFollowUpOn),
      notInArray(opportunities.stage, [...CLOSED_STAGES]),
    );

    const rows = await db
      .select({
        opportunityId: opportunities.id,
        title: opportunities.title,
        stage: opportunities.stage,
        companyId: opportunities.companyId,
        companyName: companies.name,
        nextFollowUpOn: opportunities.nextFollowUpOn,
      })
      .from(opportunities)
      // Satir DUSURMEZ: `company_id` NOT NULL + FK (bkz. `list` yorumu).
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(where)
      // KRONOLOJIK: en yakin (ve GECIKMIS) takip once. `id` tie-breaker.
      .orderBy(asc(opportunities.nextFollowUpOn), asc(opportunities.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(where);

    return {
      items: rows.map((row) => ({
        opportunityId: row.opportunityId,
        title: row.title,
        stage: toStage(row.stage),
        companyId: row.companyId,
        companyName: row.companyName,
        nextFollowUpOn: String(row.nextFollowUpOn),
      })),
      total: counted?.total ?? 0,
    };
  }
}

/**
 * Siralama anahtarlari.
 *
 * ============================================================================
 * `priority` — GECIKMIS ONCE, SONRA EN SON GUNCELLENEN
 * ============================================================================
 * Hat (pipeline) sutun basina yalnizca birkac kart gosterir; hangi birkaci
 * oldugu bu siralamayla belirlenir. Gecikmis yuklemi `listOpenPipeline` ile
 * BIREBIR AYNI ifadedir — iki yerde farkli yazilsa, ayni firsat bir ekranda
 * "gecikmis" sayilip digerinde sayilmayabilirdi.
 *
 * Ikincil anahtar `updated_at`: "en son dokunulan is en ustte". `created_at`
 * olsaydi aylar once acilmis ama dun guncellenmis bir firsat dibe duserdi.
 *
 * `id` her ikisinde de TIE-BREAKER: ayni milisaniyede olusan iki kayitta
 * kararsiz siralama, sayfalamada bir kaydin iki kez ya da hic gorunmesi
 * demektir (ADR-0029'un liste ucunda ogrenilen ders).
 */
function orderColumns(order: OpportunityOrder): [SQL, ...SQL[]] {
  if (order === 'priority') {
    return [
      sql`(${opportunities.nextFollowUpOn} IS NOT NULL AND ${opportunities.nextFollowUpOn} < CURRENT_DATE) DESC`,
      sql`${opportunities.updatedAt} DESC`,
      sql`${opportunities.id} ASC`,
    ];
  }

  return [sql`${opportunities.createdAt} DESC`, sql`${opportunities.id} DESC`];
}

/** Satiri entity'ye cevirir; `stage` daraltmasi tek yerde yapilir. */
function toEntity(row: typeof opportunities.$inferSelect): Opportunity {
  return Opportunity.fromPersistence({ ...row, stage: toStage(row.stage) });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi. Yuklem
 * kullanilir ve uymayan deger domain hatasi firlatir.
 *
 * Pratikte ULASILMAZ: satir migration `0017`'nin CHECK kisitindan gecmistir.
 * Savunma katmani.
 */
function toStage(value: string): OpportunityStage {
  if (!isOpportunityStage(value)) {
    throw new InvalidOpportunityStageError(value);
  }
  return value;
}
