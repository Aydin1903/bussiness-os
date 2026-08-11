import { Injectable } from '@nestjs/common';
import { and, asc, cosineDistance, desc, gte, isNull, lte, sql, eq, type SQL } from 'drizzle-orm';

import {
  financeCommentaries,
  financeCommentaryChunks,
} from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/category.repository.port';
import {
  type CommentaryRepository,
  type SimilarCommentaryChunk,
  type UnindexedCommentary,
} from '../application/commentary.repository.port';
import { Commentary, type CommentaryChunk } from '../domain/commentary.entity';

/** RLS notu: bkz. `DrizzleCategoryRepository`. */
@Injectable()
export class DrizzleCommentaryRepository implements CommentaryRepository {
  async saveCommentary(commentary: Commentary): Promise<void> {
    const { db } = requireTransaction();
    await db.insert(financeCommentaries).values(commentary.toState());
  }

  /**
   * Parcalari TEK deyimde yazar.
   *
   * `onConflictDoNothing` KULLANILMAZ: `UNIQUE (commentary_id, chunk_index)`
   * ihlali BASTIRILMAMALIDIR. Es zamanli iki onarimda ikincisi hata almali ve o
   * yorum `failed` sayilmalidir; sessizce gecmek, yarim yazilmis bir parca
   * kumesini "basarili" gostermek olurdu.
   */
  async saveChunks(chunks: readonly CommentaryChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const { db } = requireTransaction();
    await db.insert(financeCommentaryChunks).values(
      chunks.map((chunk) => {
        const state = chunk.toState();
        return { ...state, embedding: [...state.embedding] };
      }),
    );
  }

  async list(input: {
    limit: number;
    offset: number;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<Commentary>> {
    const { db } = requireTransaction();

    // Filtre `occurred_on` uzerinde: yorumlar bir DONEM hakkindadir, dolayisiyla
    // dogal filtre yazilma tarihi degil ILGILI DONEMDIR. DAHIL sinirlar.
    const filters: SQL[] = [];
    if (input.from !== null) filters.push(gte(financeCommentaries.occurredOn, input.from));
    if (input.to !== null) filters.push(lte(financeCommentaries.occurredOn, input.to));
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await db
      .select()
      .from(financeCommentaries)
      .where(where)
      // En yeni DONEM once; `id` tie-breaker (ayni gune iki yorum olagandir ve
      // kararsiz siralama sayfalamayi bozar).
      .orderBy(desc(financeCommentaries.occurredOn), desc(financeCommentaries.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(financeCommentaries)
      .where(where);

    return {
      items: rows.map((row) => Commentary.fromPersistence(row)),
      total: counted?.total ?? 0,
    };
  }

  async countUnindexed(): Promise<number> {
    const { db } = requireTransaction();
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(financeCommentaries)
      .leftJoin(
        financeCommentaryChunks,
        eq(financeCommentaryChunks.commentaryId, financeCommentaries.id),
      )
      .where(isNull(financeCommentaryChunks.id));

    return counted?.total ?? 0;
  }

  /**
   * Is listesi TURETILMISTIR: parcanin YOKLUGU is listesinin KENDISIDIR.
   *
   * Ayri bir "onarilacaklar" tablosu ve deneme sayaci YOK — sayac/backoff
   * OTOMATIK ve sonsuz bir donguyu dizginlemek icin vardir (outbox, gunluk
   * rapor); burada tetikleyici ACIK bir istektir ve oran sinirina tabidir.
   *
   * ⚠️ JOIN YOK — `findUnindexed` (Projeler) proje adini getirmek icin
   * `projects` tablosuna JOIN yapiyordu. Burada baglam basligi denormalize bir
   * ad TASIMADIGI icin ihtiyac yok; `occurred_on` zaten satirin kendi
   * kolonudur.
   */
  async findUnindexed(limit: number): Promise<UnindexedCommentary[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        commentaryId: financeCommentaries.id,
        occurredOn: financeCommentaries.occurredOn,
        body: financeCommentaries.body,
      })
      .from(financeCommentaries)
      .leftJoin(
        financeCommentaryChunks,
        eq(financeCommentaryChunks.commentaryId, financeCommentaries.id),
      )
      .where(isNull(financeCommentaryChunks.id))
      .orderBy(financeCommentaries.createdAt)
      .limit(limit);

    return rows;
  }

  /**
   * ANLAMSAL arama — `finance-commentaries` katkicisinin (Slice 6) tek sorgusu.
   *
   * ⚠️ `cosineDistance` (`<=>`) kullanilir cunku HNSW index'i
   * `vector_cosine_ops` ile kuruldu (migration `0025`). Operator ayrisirsa index
   * DEVRE DISI kalir ve sorgu tam tarama yapar — sessiz bir performans coku.
   *
   * `WHERE tenant_id` YOK: daraltmayi RLS yapar.
   */
  async findSimilarChunks(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarCommentaryChunk[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        content: financeCommentaryChunks.content,
        commentaryId: financeCommentaryChunks.commentaryId,
      })
      .from(financeCommentaryChunks)
      .orderBy(asc(cosineDistance(financeCommentaryChunks.embedding, [...input.embedding])))
      .limit(input.limit);

    return rows;
  }
}
