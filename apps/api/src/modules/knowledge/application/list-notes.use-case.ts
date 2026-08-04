import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type NoteListPage, type NoteRepository } from './note.repository.port';

export interface ListNotesQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface ListNotesDependencies {
  readonly noteRepository: NoteRepository;
  readonly transactionManager: TransactionManager;
  /** Onizleme uzunlugu. Config'ten gelir; kodda sabitlenmez. */
  readonly previewLength: number;
}

/**
 * Tenant'in notlarini sayfali listeler (ADR-0029, liste ucu notu).
 *
 * ============================================================================
 * GOVDE KIRPILIR — bu bir performans ayari degil, SOZLESME
 * ============================================================================
 * Bir not 500.000 karaktere kadar cikabilir (`MAX_BODY_LENGTH`). 20 notun tam
 * govdesi tek yanitta megabaytlar demektir; hem sunucu belleginde hem agda.
 *
 * Liste ekraninin ihtiyaci ONIZLEMEDIR. Tam metin ayri bir NOT DETAY ucunun
 * isidir ve o uc bu slice'ta YOK — bilinen sinir olarak kayitli.
 *
 * `bodyLength` bu yuzden yanittadir: istemci "bu metin kirpildi mi" sorusunu
 * TAHMIN ETMEZ, bilir.
 * ============================================================================
 *
 * Transaction siniri burada: RLS politikasi tenant context'i olmadan HATA
 * verir (MT §12.6 madde 4), sessizce bos donmez.
 */
export class ListNotesUseCase {
  constructor(private readonly deps: ListNotesDependencies) {}

  execute(query: ListNotesQuery): Promise<NoteListPage> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.noteRepository.listForTenant({
        limit: query.limit,
        offset: query.offset,
        previewLength: this.deps.previewLength,
      }),
    );
  }
}
