import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  companies,
  interactionChunks,
  interactions,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/company.repository.port';
import {
  type InteractionRepository,
  type UnindexedInteraction,
} from '../application/interaction.repository.port';
import { Interaction, InteractionChunk } from '../domain/interaction.entity';

/** RLS notu: bkz. `DrizzleCompanyRepository`. */
@Injectable()
export class DrizzleInteractionRepository implements InteractionRepository {
  async saveInteraction(interaction: Interaction): Promise<void> {
    const { db } = requireTransaction();
    await db.insert(interactions).values(interaction.toState());
  }

  /**
   * Parcalari TEK deyimde yazar.
   *
   * `onConflictDoNothing` KULLANILMAZ: `UNIQUE (interaction_id, chunk_index)`
   * ihlali BASTIRILMAMALIDIR. Es zamanli iki onarimda ikincisi hata almali ve
   * o gorusme `failed` sayilmalidir; sessizce gecmek, yarim yazilmis bir
   * parca kumesini "basarili" gostermek olurdu.
   */
  async saveChunks(chunks: readonly InteractionChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const { db } = requireTransaction();
    await db.insert(interactionChunks).values(
      chunks.map((chunk) => {
        const state = chunk.toState();
        return { ...state, embedding: [...state.embedding] };
      }),
    );
  }

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    opportunityId: string | null;
  }): Promise<ListPage<Interaction>> {
    const { db } = requireTransaction();

    const filters: SQL[] = [];
    if (input.companyId !== null) filters.push(eq(interactions.companyId, input.companyId));
    if (input.opportunityId !== null) {
      filters.push(eq(interactions.opportunityId, input.opportunityId));
    }
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await db
      .select()
      .from(interactions)
      .where(where)
      // En yeni gorusme once. `id` tie-breaker: ayni gunde birden fazla
      // gorusme olagandir ve kararsiz siralama sayfalamayi bozar.
      .orderBy(desc(interactions.occurredOn), desc(interactions.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(interactions)
      .where(where);

    return {
      items: rows.map((row) => Interaction.fromPersistence(row)),
      total: counted?.total ?? 0,
    };
  }

  async findCompanyName(companyId: string): Promise<string | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return rows[0]?.name ?? null;
  }

  async countUnindexed(): Promise<number> {
    const { db } = requireTransaction();
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(interactions)
      .leftJoin(interactionChunks, eq(interactionChunks.interactionId, interactions.id))
      .where(isNull(interactionChunks.id));

    return counted?.total ?? 0;
  }

  /**
   * Is listesi TURETILMISTIR: parcanin YOKLUGU is listesinin KENDISIDIR.
   *
   * Ayri bir "onarilacaklar" tablosu ve deneme sayaci YOK — sayac/backoff
   * OTOMATIK ve sonsuz bir donguyu dizginlemek icin vardir (outbox, gunluk
   * rapor); burada tetikleyici ACIK bir istektir ve oran sinirina tabidir.
   *
   * Sirket adi JOIN ile gelir: baglam basligi onu gerektirir ve ikinci bir
   * sorgu acmanin anlami yok.
   */
  async findUnindexed(limit: number): Promise<UnindexedInteraction[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        interactionId: interactions.id,
        companyName: companies.name,
        occurredOn: interactions.occurredOn,
        body: interactions.body,
      })
      .from(interactions)
      .innerJoin(companies, eq(companies.id, interactions.companyId))
      .leftJoin(interactionChunks, eq(interactionChunks.interactionId, interactions.id))
      .where(isNull(interactionChunks.id))
      .orderBy(desc(interactions.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      interactionId: row.interactionId,
      companyName: row.companyName,
      occurredOn: row.occurredOn,
      body: row.body,
    }));
  }
}
