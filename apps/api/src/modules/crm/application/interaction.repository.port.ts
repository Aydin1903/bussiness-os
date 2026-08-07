import { type Interaction, type InteractionChunk } from '../domain/interaction.entity';
import { type ListPage } from './company.repository.port';

export const INTERACTION_REPOSITORY = Symbol('INTERACTION_REPOSITORY');

/** Anlamsal aramanin dondurdugu tek parca. */
export interface SimilarInteractionChunk {
  /** Parca metni — BAGLAM BASLIGI dahil (gomulen sey tam olarak budur). */
  readonly content: string;
  /** Hangi gorusmeden geldi — kaynak atfi bundan turer. */
  readonly interactionId: string;
}

/** Yeniden indekslenecek gorusme — is listesi TURETILMISTIR (ADR-0029). */
export interface UnindexedInteraction {
  readonly interactionId: string;
  readonly companyName: string;
  readonly occurredOn: string;
  readonly body: string;
}

/**
 * `crm.interactions` + `crm.interaction_chunks` kaliciligi.
 *
 * Tenant daraltmasi RLS'in isidir (bkz. `CompanyRepository`).
 */
export interface InteractionRepository {
  saveInteraction(interaction: Interaction): Promise<void>;
  /** Parcalar AYRI transaction'da yazilir (ADR-0029 §4, T2). */
  saveChunks(chunks: readonly InteractionChunk[]): Promise<void>;

  list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    opportunityId: string | null;
  }): Promise<ListPage<Interaction>>;

  /** Baglam basligi icin sirket adi gerekir; tek sorguda getirilir. */
  findCompanyName(companyId: string): Promise<string | null>;

  /**
   * PARCASIZ gorusmeler — `LEFT JOIN ... WHERE chunk IS NULL`.
   *
   * Is listesi TURETILMISTIR, saklanmaz: ayri bir "onarilacaklar" tablosu ve
   * deneme sayaci YOK. Parcanin YOKLUGU is listesinin KENDISIDIR (ADR-0029'un
   * yeniden indeksleme notu — ayni karar).
   */
  countUnindexed(): Promise<number>;
  findUnindexed(limit: number): Promise<UnindexedInteraction[]>;

  /**
   * ANLAMSAL arama (ADR-0031 §5.4 — `crm-interactions` katkicisi).
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar (migration
   * `0018`) ve cagiran zaten tenant transaction'i icindedir.
   * `DrizzleNoteChunkSearchRepository` ile birebir ayni gerekce.
   */
  findSimilarChunks(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarInteractionChunk[]>;
}
