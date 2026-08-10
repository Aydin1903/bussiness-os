import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ProgressNoteRepository } from '../application/progress-note.repository.port';
import { PROGRESS_NOTE_READ } from '../projects.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const PROJECT_NOTES_SOURCE = 'project-notes';

/**
 * Projeler'in ANLAMSAL katkisi (ADR-0033 §6).
 *
 * `CrmInteractionsContributor` ile SIMETRIKTIR: ayni port, ayni desen, yalnizca
 * kaynak tablo ve izin farkli. Uc modul birbirinin semasini GORMEZ;
 * birlestirmeyi platform yapar.
 *
 * Dondurulen `content` BAGLAM BASLIGI tasir (`[Proje · Tarih] ...`) cunku
 * gomulen sey tam olarak odur (Slice 3). Yani "Web sitesi projesinde ne oldu?"
 * sorusu, not metninde proje adi gecmese bile eslesebilir.
 */
@Injectable()
export class ProjectNotesContributor implements RetrievalContributor {
  readonly source = PROJECT_NOTES_SOURCE;
  readonly permission = PROGRESS_NOTE_READ;

  constructor(
    private readonly repository: ProgressNoteRepository,
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
      // Knowledge ve CRM'in anlamsal katkicilariyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). Artik UC anlamsal katkici yan
      // yana calisiyor; kalibrasyon ihtiyaci her modulle biraz daha buyuyor.
      score: 1 - index / (chunks.length + 1),
      source: PROJECT_NOTES_SOURCE,
      reference: { kind: 'progress_note', id: chunk.progressNoteId },
    }));
  }
}
