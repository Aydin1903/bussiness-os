import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type InteractionRepository } from '../application/interaction.repository.port';
import { INTERACTION_READ } from '../crm.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const CRM_INTERACTIONS_SOURCE = 'crm-interactions';

/**
 * CRM'in ANLAMSAL katkisi (ADR-0031 §5.1).
 *
 * `KnowledgeRetrievalContributor` ile SIMETRIKTIR: ayni port, ayni desen,
 * yalnizca kaynak tablo ve izin farkli. Iki modul birbirinin semasini GORMEZ;
 * birlestirmeyi platform yapar.
 *
 * Dondurulen `content` BAGLAM BASLIGI tasir (`[Sirket · Tarih] ...`) cunku
 * gomulen sey tam olarak odur (Slice 6). Yani "Acme ile ne konustuk?" sorusu,
 * gorusme metninde "Acme" gecmese bile eslesebilir.
 */
@Injectable()
export class CrmInteractionsContributor implements RetrievalContributor {
  readonly source = CRM_INTERACTIONS_SOURCE;
  readonly permission = INTERACTION_READ;

  constructor(
    private readonly repository: InteractionRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const chunks = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarChunks({ embedding: input.embedding, limit: input.limit }),
    );

    return chunks.map((chunk, index) => ({
      content: chunk.content,
      // Repository skor DONDURMEZ; yalnizca kosinus mesafesine gore SIRALI bir
      // liste verir. Siralamayi korumak icin sentetik ve AZALAN bir skor
      // uretilir — `KnowledgeRetrievalContributor` ile ayni formul.
      //
      // ⚠️ Bu skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR
      // (ADR-0031'in "skorlar kalibre degil" bilinen siniri). Iki anlamsal
      // katkici artik gercekten yan yana calisiyor; kalibrasyon ihtiyaci bu
      // slice ile SOMUT hale geldi.
      score: 1 - index / (chunks.length + 1),
      source: CRM_INTERACTIONS_SOURCE,
      reference: { kind: 'interaction', id: chunk.interactionId },
    }));
  }
}
