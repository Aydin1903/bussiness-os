import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { NOTE_READ } from '../knowledge.permissions';
import { type NoteChunkSearch } from '../application/note-chunk-search.port';
import { TenantId } from '../domain/tenant-id.value-object';

/** Bu katkicinin koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const KNOWLEDGE_SOURCE = 'knowledge';

/**
 * Knowledge'in kurumsal hafizaya ANLAMSAL katkisi (ADR-0031 §5.1).
 *
 * ============================================================================
 * MODUL KENDI SEMASINA BAKAR — BASKASININKINE DEGIL
 * ============================================================================
 * Bu sinif `knowledge.note_chunks`'tan baska hicbir seye dokunmaz. Platform
 * onu cagirir ama ICINE bakmaz; CRM geldiginde kendi katkicisini kaydeder ve
 * ikisi birbirini GORMEZ. Mutlak Kural 5-6 ile "tek kurumsal hafiza" vaadi
 * ayni anda boyle saglanir.
 *
 * ============================================================================
 * `permission` NEDEN `note:read`
 * ============================================================================
 * Katkinin icerigi NOTLARDIR; onlari gormeyi saglayan izin `note:read`'dir.
 * `context:ask` DEGIL — o "soru sorabilir mi" sorusudur ve bu katkiciya
 * ozgu degildir.
 *
 * Pratik sonucu: `note:read` tasimayan bir kullanici (bugun `viewer`)
 * `/ask`'i cagirabilse bile cevaba Knowledge icerigi GIRMEZ ve bu katkici
 * HIC CAGRILMAZ.
 * ============================================================================
 */
@Injectable()
export class KnowledgeRetrievalContributor implements RetrievalContributor {
  readonly source = KNOWLEDGE_SOURCE;
  readonly permission = NOTE_READ;

  constructor(
    private readonly search: NoteChunkSearch,
    private readonly transactionManager: TransactionManager,
    /** Tenant kimligini istek baglamindan veren fonksiyon. */
    private readonly currentTenantId: () => string,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi. Her katkici kendi okumasini yonetir.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const tenantId = TenantId.create(this.currentTenantId());

    const chunks = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.search.findSimilar({ tenantId, embedding: input.embedding, limit: input.limit }),
    );

    return chunks.map((chunk, index) => ({
      content: chunk.content,
      // `NoteChunkSearch` bugun skor DONDURMEZ; yalnizca kosinus mesafesine
      // gore SIRALI bir liste verir. Siralamayi korumak icin sentetik ve
      // AZALAN bir skor uretiliyor.
      //
      // ⚠️ Bu skor kaynaklar arasi karsilastirma icin ANLAMLI DEGILDIR —
      // ADR-0031'in "skorlar kalibre degil" bilinen sinirinin somut hali.
      // Ikinci katkici (CRM) geldiginde gercek mesafe degeri port'a
      // tasinmalidir; tek katkiciyla bu ayrim gozlenemez.
      score: 1 - index / (chunks.length + 1),
      source: KNOWLEDGE_SOURCE,
      reference: { kind: 'note', id: chunk.noteId },
    }));
  }
}
