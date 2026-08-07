import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { opportunities } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/company.repository.port';
import {
  type FollowUpRow,
  type OpportunityRepository,
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

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    stage: OpportunityStage | null;
  }): Promise<ListPage<Opportunity>> {
    const { db } = requireTransaction();

    // IS filtreleri elle yazilir; TENANT filtresi yine RLS'in isidir.
    const filters: SQL[] = [];
    if (input.companyId !== null) filters.push(eq(opportunities.companyId, input.companyId));
    if (input.stage !== null) filters.push(eq(opportunities.stage, input.stage));
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await db
      .select()
      .from(opportunities)
      .where(where)
      .orderBy(desc(opportunities.createdAt), desc(opportunities.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(where);

    return { items: rows.map(toEntity), total: counted?.total ?? 0 };
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
        nextFollowUpOn: opportunities.nextFollowUpOn,
      })
      .from(opportunities)
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
        nextFollowUpOn: String(row.nextFollowUpOn),
      })),
      total: counted?.total ?? 0,
    };
  }
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
