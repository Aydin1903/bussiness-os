import { chunkText } from '../../../shared/chunking';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { toCalendarDay } from '../domain/calendar-day';
import {
  Commentary,
  CommentaryChunk,
  withCommentaryHeader,
  type CommentaryState,
} from '../domain/commentary.entity';
import { FINANCE_CREATE_COMMENTARY_ACTION } from '../finance.rate-limits';
import { type ListPage } from './category.repository.port';
import { type CommentaryRepository } from './commentary.repository.port';

export interface CommentaryDependencies {
  readonly repository: CommentaryRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik yorum payi. Config'ten gelir. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA yorum. */
  readonly reindexBatchSize: number;
}

export interface CreateCommentaryResult {
  readonly commentary: CommentaryState;
  readonly chunkCount: number;
}

/**
 * Finansal yorum yasam dongusu — Finans'in AI'a ILK KEZ dokundugu yer.
 *
 * ============================================================================
 * IKI TRANSACTION, ARADA AG CAGRISI (ADR-0029 §4) — DORDUNCU KEZ
 * ============================================================================
 *   T0  oran siniri sayaci    -> transaction (kendi basina, commit)
 *   T1  yorum kaydi           -> transaction
 *   chunking + embedding      -> AG · transaction YOK
 *   T2  parcalar              -> transaction
 *
 * Pahali bir ag cagrisi boyunca veritabani baglantisi TUTULMAZ.
 *
 * ============================================================================
 * "PARCASIZ YORUM" MUMKUNDUR — ama ONARILABILIR
 * ============================================================================
 * T1 commit olduktan sonra embedding cokerse ortaya yorumu olan ama parcasi
 * olmayan bir kayit cikar. Hata YUZEYE CIKAR (502) ve yorum SILINMEZ —
 * istemciye "kaydedildi ancak indekslenemedi" denir; genel bir hata donmek
 * kullaniciyi metni yeniden yazmaya ve MUKERRER kayda iterdi.
 *
 * Onarim ucu (`POST /finance/reindex`) ILK GUNDEN vardir.
 *
 * ============================================================================
 * ⚠️ BU MODULDE ONARIM YALNIZCA EKSIK PARCA ICINDIR
 * ============================================================================
 * CRM ve Projeler'de `reindex`in IKI isi vardi: eksik parcalari uretmek VE
 * baslikta denormalize edilmis bayat adi (sirket/proje) tazelemek. Burada
 * baslikta ad YOKTUR (sabit etiket + kaydin kendi tarihi), dolayisiyla
 * bayatlayacak bir sey de yok. Bu bir eksiklik degil, gomulen verinin
 * tabiatinin sonucudur.
 * ============================================================================
 */
export class CommentaryUseCases {
  constructor(private readonly deps: CommentaryDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    /** `null` ise BUGUNE duser — yorum cogu zaman yazildigi gun icindir. */
    occurredOn: string | null;
    body: string;
  }): Promise<CreateCommentaryResult> {
    // --- T0 ------------------------------------------------------------------
    // Embedding'den ONCE: reddedilecek bir istek TEK KURUS harcamamali.
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: FINANCE_CREATE_COMMENTARY_ACTION,
      limit: this.deps.rateLimit,
    });

    const now = this.deps.clock.now();

    // --- T1: yorum -----------------------------------------------------------
    // ⚠️ EBEVEYN DOGRULAMASI YOK — `ProgressNoteUseCases`ten fark. Yorumun
    // baglanacagi bir kayit yoktur (ADR-0034 §1.1), dolayisiyla T1'de yalnizca
    // yazma var.
    const commentary = Commentary.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      authorUserId: input.userId,
      occurredOn: input.occurredOn ?? toCalendarDay(now),
      body: input.body,
      now,
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveCommentary(commentary),
    );

    const state = commentary.toState();

    // --- Ag · transaction YOK ------------------------------------------------
    const chunks = await this.#buildChunks({
      commentaryId: state.id,
      tenantId: state.tenantId,
      occurredOn: state.occurredOn,
      body: state.body,
    });

    // --- T2: parcalar --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveChunks(chunks),
    );

    return { commentary: state, chunkCount: chunks.length };
  }

  async list(input: {
    limit: number;
    offset: number;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<CommentaryState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((item) => item.toState()), total: page.total };
  }

  /** Parcasiz yorum SAYISI — is listesi turetilmistir. */
  async countUnindexed(): Promise<number> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.countUnindexed(),
    );
  }

  /**
   * Parcasiz yorumlari onarir.
   *
   * Oran siniri `create_commentary` kovasini PAYLASIR: ayni maliyet profili, ve
   * ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.
   *
   * IDEMPOTENCY BEDAVA: `UNIQUE (commentary_id, chunk_index)` (migration
   * `0025`) zaten var; es zamanli iki onarimda ikincisi kisitla reddedilir ve
   * o yorum `failed` sayilir — VERI BOZULMAZ.
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ repaired: number; failed: number }> {
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: FINANCE_CREATE_COMMENTARY_ACTION,
      limit: this.deps.rateLimit,
    });

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her yorum AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her seyi
        // geri alirdi.
        const chunks = await this.#buildChunks({
          commentaryId: item.commentaryId,
          tenantId: input.tenantId,
          occurredOn: item.occurredOn,
          body: item.body,
        });

        await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
          this.deps.repository.saveChunks(chunks),
        );
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  /**
   * Metni parcalara boler, HER PARCAYA BAGLAM BASLIGI ekler ve gomer.
   *
   * Baslik gomulen metnin PARCASIDIR — yalnizca gosterim degil.
   */
  async #buildChunks(input: {
    commentaryId: string;
    tenantId: string;
    occurredOn: string;
    body: string;
  }): Promise<CommentaryChunk[]> {
    const parts = chunkText(input.body);
    const chunks: CommentaryChunk[] = [];

    for (const [index, part] of parts.entries()) {
      const content = withCommentaryHeader({ occurredOn: input.occurredOn, content: part });

      chunks.push(
        CommentaryChunk.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          commentaryId: input.commentaryId,
          chunkIndex: index,
          content,
          embedding: await this.#embed(content),
        }),
      );
    }

    return chunks;
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}
