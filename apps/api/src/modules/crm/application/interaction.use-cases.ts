import { chunkText } from '../../../shared/chunking';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { CRM_CREATE_INTERACTION_ACTION } from '../crm.rate-limits';
import { InteractionCompanyNotFoundError } from '../domain/crm.error';
import {
  Interaction,
  InteractionChunk,
  withContextHeader,
  type InteractionState,
} from '../domain/interaction.entity';
import { type CompanyRepository, type ListPage } from './company.repository.port';
import {
  type InteractionRepository,
  type UnindexedInteraction,
} from './interaction.repository.port';

export interface InteractionDependencies {
  readonly repository: InteractionRepository;
  readonly companyRepository: CompanyRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik gorusme payi. Config'ten gelir. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA gorusme. */
  readonly reindexBatchSize: number;
}

export interface CreateInteractionResult {
  readonly interaction: InteractionState;
  readonly chunkCount: number;
}

/**
 * Gorusme yasam dongusu — CRM'in AI'a ILK KEZ dokundugu yer.
 *
 * ============================================================================
 * IKI TRANSACTION, ARADA AG CAGRISI (ADR-0029 §4)
 * ============================================================================
 *   T0  oran siniri sayaci        -> transaction (kendi basina, commit)
 *   T1  gorusme kaydi             -> transaction
 *   chunking + embedding          -> AG · transaction YOK
 *   T2  parcalar                  -> transaction
 *
 * Pahali bir ag cagrisi boyunca veritabani baglantisi TUTULMAZ.
 *
 * ============================================================================
 * "PARCASIZ GORUSME" MUMKUNDUR — ama ONARILABILIR
 * ============================================================================
 * T1 commit olduktan sonra embedding cokerse ortaya gorusmesi olan ama
 * parcasi olmayan bir kayit cikar. Hata YUZEYE CIKAR (502) ve gorusme
 * SILINMEZ — istemciye "kaydedildi ancak indekslenemedi" denir; genel bir
 * hata donmek kullaniciyi metni yeniden yazmaya ve MUKERRER kayda iterdi.
 *
 * FARK: onarim ucu (`POST /crm/reindex`) ILK GUNDEN vardir. ADR-0029'da bu
 * bilinen sinir aylarca yalnizca TESPIT EDILEBILIR kalmisti.
 * ============================================================================
 */
export class InteractionUseCases {
  constructor(private readonly deps: InteractionDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    companyId: string;
    contactId: string | null;
    opportunityId: string | null;
    occurredOn: string;
    body: string;
  }): Promise<CreateInteractionResult> {
    // --- T0 ------------------------------------------------------------------
    // Embedding'den ONCE: reddedilecek bir istek TEK KURUS harcamamali.
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: CRM_CREATE_INTERACTION_ACTION,
      limit: this.deps.rateLimit,
    });

    // --- T1: gorusme + sirket dogrulamasi -----------------------------------
    const { interaction, companyName } =
      await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
        const name = await this.deps.repository.findCompanyName(input.companyId);
        if (name === null) {
          // RLS sayesinde BASKA tenant'in sirketi de "bulunamadi" sayilir;
          // varligi sizmaz. FK ihlaline birakmak 500 dondururdu.
          throw new InteractionCompanyNotFoundError();
        }

        const created = Interaction.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          companyId: input.companyId,
          contactId: input.contactId,
          opportunityId: input.opportunityId,
          authorUserId: input.userId,
          occurredOn: input.occurredOn,
          body: input.body,
          now: this.deps.clock.now(),
        });

        await this.deps.repository.saveInteraction(created);
        return { interaction: created, companyName: name };
      });

    const state = interaction.toState();

    // --- Ag · transaction YOK ------------------------------------------------
    const chunks = await this.#buildChunks({
      interactionId: state.id,
      tenantId: state.tenantId,
      companyName,
      occurredOn: state.occurredOn,
      body: state.body,
    });

    // --- T2: parcalar --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveChunks(chunks),
    );

    return { interaction: state, chunkCount: chunks.length };
  }

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    opportunityId: string | null;
  }): Promise<ListPage<InteractionState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((item) => item.toState()), total: page.total };
  }

  /** Parcasiz gorusme SAYISI — is listesi turetilmistir. */
  async countUnindexed(): Promise<number> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.countUnindexed(),
    );
  }

  /**
   * Parcasiz gorusmeleri onarir.
   *
   * Oran siniri `create_interaction` kovasini PAYLASIR: ayni maliyet profili,
   * ve ayri bir kova onarimi butcesiz bir yan kapiya cevirirdi.
   *
   * IDEMPOTENCY BEDAVA: `UNIQUE (interaction_id, chunk_index)` (migration
   * `0018`) zaten var; es zamanli iki onarimda ikincisi kisitla reddedilir ve
   * o gorusme `failed` sayilir — VERI BOZULMAZ.
   */
  async reindex(input: { tenantId: string; userId: string }): Promise<{
    repaired: number;
    failed: number;
  }> {
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: CRM_CREATE_INTERACTION_ACTION,
      limit: this.deps.rateLimit,
    });

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her gorusme AYRI ele alinir: birinin cokmesi digerlerini
        // engellemez. Toplu bir transaction, tek bir bozuk kayit yuzunden
        // onarilan her seyi geri alirdi.
        const chunks = await this.#buildChunks({
          interactionId: item.interactionId,
          tenantId: input.tenantId,
          companyName: item.companyName,
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
   * Baslik gomulen metnin PARCASIDIR — yalnizca gosterim degil. Sirket adi ve
   * tarih her parcada bulunur, boylece "Acme ile ne konustuk?" sorusu metinde
   * "Acme" gecmese bile eslesir (ADR-0031 Slice 6, PO onayi).
   */
  async #buildChunks(input: {
    interactionId: string;
    tenantId: string;
    companyName: string;
    occurredOn: string;
    body: string;
  }): Promise<InteractionChunk[]> {
    const parts = chunkText(input.body);
    const chunks: InteractionChunk[] = [];

    for (const [index, part] of parts.entries()) {
      const content = withContextHeader({
        companyName: input.companyName,
        occurredOn: input.occurredOn,
        content: part,
      });

      chunks.push(
        InteractionChunk.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.tenantId,
          interactionId: input.interactionId,
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

export type { UnindexedInteraction };
