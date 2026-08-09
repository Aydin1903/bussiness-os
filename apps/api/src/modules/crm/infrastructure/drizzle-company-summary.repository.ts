import { Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';

import {
  companies,
  companySummaries,
  contacts,
  interactions,
  opportunities,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type CompanySummaryRepository,
  type StoredCompanySummary,
} from '../application/company-summary.repository.port';
import { type SummarySourceFacts } from '../domain/company-summary.entity';

/** Kapanmis firsatlar hattin disindadir — `listOpenPipeline` ile ayni ayrim. */
const CLOSED_STAGES = ['won', 'lost'];

/** RLS notu: bkz. `DrizzleCompanyRepository`. */
@Injectable()
export class DrizzleCompanySummaryRepository implements CompanySummaryRepository {
  async findCompanyIdentity(
    companyId: string,
  ): Promise<{ name: string; industry: string | null } | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select({ name: companies.name, industry: companies.industry })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return rows[0] ?? null;
  }

  async find(companyId: string): Promise<StoredCompanySummary | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select({
        summary: companySummaries.summary,
        sourceWatermark: companySummaries.sourceWatermark,
        generatedAt: companySummaries.generatedAt,
        generatingAt: companySummaries.generatingAt,
      })
      .from(companySummaries)
      .where(eq(companySummaries.companyId, companyId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Watermark'in ham girdileri — TEK sorgu.
   *
   * Dort ayri sorgu ayni cevabi dort gidis-donusle verirdi ve aralarinda veri
   * degisirse TUTARSIZ bir imza uretirdi: gorusme sayimi ile firsat sayimi
   * arasinda eklenen bir kayit, hicbir zaman bayat gorunmeyen bir ozete yol
   * acardi.
   *
   * `max(...)` degerleri ISO 8601 metne cevrilerek doner: imza bir string'dir
   * ve tip donusumunu SQL'de sabitlemek, JS tarafinda yerel saat dilimine
   * gore degisen bir bicimlendirmeden guvenlidir.
   */
  async collectSourceFacts(companyId: string): Promise<SummarySourceFacts> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        interactionCount: sql<string>`(
          SELECT count(*) FROM ${interactions} WHERE ${interactions.companyId} = ${companyId}
        )`,
        lastInteractionCreatedAt: sql<string | null>`(
          SELECT to_char(max(${interactions.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM ${interactions} WHERE ${interactions.companyId} = ${companyId}
        )`,
        opportunityCount: sql<string>`(
          SELECT count(*) FROM ${opportunities} WHERE ${opportunities.companyId} = ${companyId}
        )`,
        lastOpportunityUpdatedAt: sql<string | null>`(
          SELECT to_char(max(${opportunities.updatedAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          FROM ${opportunities} WHERE ${opportunities.companyId} = ${companyId}
        )`,
        contactCount: sql<string>`(
          SELECT count(*) FROM ${contacts} WHERE ${contacts.companyId} = ${companyId}
        )`,
        companyUpdatedAt: sql<string>`to_char(${companies.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const row = rows[0];
    if (row === undefined) {
      // Cagiran zaten `findCompanyIdentity` ile varligi dogruladi; buraya
      // dusmek sirketin ARADA silindigi anlamina gelir. Sifir gercekler
      // dondurmek yerine acikca patlamak dogru: sessiz bir "hic gorusme yok"
      // cevabi, silinmis bir sirket icin ozet uretilmeye calisildigini gizlerdi.
      throw new Error(`Sirket watermark hesabi sirasinda bulunamadi: ${companyId}`);
    }

    return {
      interactionCount: Number(row.interactionCount),
      lastInteractionCreatedAt: row.lastInteractionCreatedAt,
      opportunityCount: Number(row.opportunityCount),
      lastOpportunityUpdatedAt: row.lastOpportunityUpdatedAt,
      contactCount: Number(row.contactCount),
      companyUpdatedAt: row.companyUpdatedAt,
    };
  }

  async recentInteractions(input: {
    companyId: string;
    limit: number;
  }): Promise<readonly { occurredOn: string; body: string }[]> {
    const { db } = requireTransaction();

    // GUNCELLIK sirasi — benzerlik DEGIL. Bu bir arama degil, iliskinin
    // bugunku halinin ozeti (ADR-0032 §4).
    return db
      .select({ occurredOn: interactions.occurredOn, body: interactions.body })
      .from(interactions)
      .where(eq(interactions.companyId, input.companyId))
      .orderBy(desc(interactions.occurredOn), desc(interactions.createdAt))
      .limit(input.limit);
  }

  async openOpportunities(
    companyId: string,
  ): Promise<readonly { title: string; stage: string; estimatedValue: string | null }[]> {
    const { db } = requireTransaction();

    return db
      .select({
        title: opportunities.title,
        stage: opportunities.stage,
        estimatedValue: opportunities.estimatedValue,
      })
      .from(opportunities)
      .where(
        and(eq(opportunities.companyId, companyId), notInArray(opportunities.stage, CLOSED_STAGES)),
      )
      .orderBy(desc(opportunities.updatedAt));
  }

  /**
   * Uretim hakkini TEK deyimde alir.
   *
   * ============================================================================
   * NEDEN UPSERT + KOSULLU UPDATE, "once oku sonra yaz" DEGIL
   * ============================================================================
   * Iki es zamanli istek once okusaydi ikisi de "claim bos" gorur, ikisi de
   * yazar ve MODEL IKI KEZ cagrilirdi — bu ucun var olma sebebinin tam tersi.
   *
   * `ON CONFLICT ... DO UPDATE ... WHERE` atomiktir: catisma halinde satiri
   * yalnizca claim'i BOS ya da BAYAT olan kazanir. `RETURNING` bos donerse
   * hak alinamamis demektir.
   *
   * ⚠️ `WHERE` yan tumcesi `DO UPDATE`e AITTIR (satir duzeyi kosul), tabloya
   * degil. Unutulursa her cagri claim'i ezer ve mekanizma sessizce ise
   * yaramaz hale gelir — kod calismaya devam eder, yalnizca korumaz.
   */
  async claim(input: {
    companyId: string;
    tenantId: string;
    staleBefore: Date;
    now: Date;
  }): Promise<boolean> {
    const { db } = requireTransaction();

    const claimed = await db
      .insert(companySummaries)
      .values({
        companyId: input.companyId,
        tenantId: input.tenantId,
        generatingAt: input.now,
      })
      .onConflictDoUpdate({
        target: companySummaries.companyId,
        set: { generatingAt: input.now },
        setWhere: sql`${companySummaries.generatingAt} IS NULL OR ${companySummaries.generatingAt} < ${input.staleBefore}`,
      })
      .returning({ companyId: companySummaries.companyId });

    return claimed.length > 0;
  }

  async complete(input: {
    companyId: string;
    summary: string;
    sourceWatermark: string;
    now: Date;
  }): Promise<void> {
    const { db } = requireTransaction();

    await db
      .update(companySummaries)
      .set({
        summary: input.summary,
        sourceWatermark: input.sourceWatermark,
        generatedAt: input.now,
        // Claim BIRAKILIR: is bitti.
        generatingAt: null,
      })
      .where(eq(companySummaries.companyId, input.companyId));
  }

  async releaseClaim(companyId: string): Promise<void> {
    const { db } = requireTransaction();

    // Yalnizca claim temizlenir; `summary`/`generated_at` KORUNUR. Onceki
    // basarili bir ozet varsa, basarisiz bir yenileme denemesi onu SILMEZ.
    await db
      .update(companySummaries)
      .set({ generatingAt: null })
      .where(eq(companySummaries.companyId, companyId));
  }
}
