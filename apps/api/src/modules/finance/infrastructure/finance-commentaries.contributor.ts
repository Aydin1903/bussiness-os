import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type CommentaryRepository } from '../application/commentary.repository.port';
import { COMMENTARY_READ } from '../finance.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const FINANCE_COMMENTARIES_SOURCE = 'finance-commentaries';

/**
 * Finans'in ANLAMSAL katkisi (ADR-0034 §6).
 *
 * `CrmInteractionsContributor` ve `ProjectNotesContributor` ile SIMETRIKTIR:
 * ayni port, ayni desen, yalnizca kaynak tablo ve izin farkli. Dort modul
 * birbirinin semasini GORMEZ; birlestirmeyi platform yapar.
 *
 * ============================================================================
 * ⚠️ BU KATKICI ISLEM ACIKLAMALARINI GORMEZ — VE BU BIR EKSIKLIK DEGIL
 * ============================================================================
 * `finance.transactions.description` EMBED EDILMEZ (ADR-0034 §6.1). Sebep tam
 * olarak BU DOSYANIN calistigi yerdedir: global top-K 8'dir ve artik DORT
 * anlamsal kaynak ayni havuzda siralanir. "Ocak kirasi", "Subat kirasi", "Mart
 * kirasi" birbirine neredeyse OZDES kisa vektorlerdir; bir kira sorusunda sekiz
 * yuvanin yarisini bunlar doldurur ve DIGER UC MODULUN en iyi parcalarini
 * disari iter.
 *
 * Yani bu, Finans'in degil `POST /ask`in karari — ve bedeli baska modullerin
 * cevap kalitesi olurdu.
 *
 * Sayisal sorularin ("gecen ay ne harcadik") cevabi zaten YAPISAL katkicidadir
 * (`finance-cashflow`).
 */
@Injectable()
export class FinanceCommentariesContributor implements RetrievalContributor {
  readonly source = FINANCE_COMMENTARIES_SOURCE;
  readonly permission = COMMENTARY_READ;

  constructor(
    private readonly repository: CommentaryRepository,
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
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // Knowledge, CRM ve Projeler'in anlamsal katkicilariyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). Artik DORT anlamsal katkici yan
      // yana calisiyor; ADR-0031'in "olcum verisi biriktiginde" dedigi gun
      // biraz daha yaklasti.
      score: 1 - index / (chunks.length + 1),
      source: FINANCE_COMMENTARIES_SOURCE,
      reference: { kind: 'commentary', id: chunk.commentaryId },
    }));
  }
}
