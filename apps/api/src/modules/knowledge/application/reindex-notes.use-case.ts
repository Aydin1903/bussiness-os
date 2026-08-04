import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { chunkText } from '../domain/chunking';
import { NoteChunk } from '../domain/note-chunk.entity';
import { NoteChunkId } from '../domain/note-chunk-id.value-object';
import { NoteId } from '../domain/note-id.value-object';
import { TenantId } from '../domain/tenant-id.value-object';
import { EmbeddingFailedError, type EmbeddingPort } from './embedding.port';
import { enforceRateLimit } from './enforce-rate-limit';
import { type NoteChunkRepository } from './note-chunk.repository.port';
import { type NoteRepository, type UnindexedNote } from './note.repository.port';
import { type RateLimitRepository } from './rate-limit.repository.port';

export interface ReindexNotesCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ. */
  readonly tenantId: string;
  readonly userId: string;
}

export interface ReindexNotesResult {
  /** Bu turda basariyla indekslenen not sayisi. */
  readonly repaired: number;
  /** Denendi ama yine basarisiz oldu. */
  readonly failed: number;
  /** Bu turdan SONRA hala chunk'siz kalan not sayisi. */
  readonly remaining: number;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface ReindexNotesDependencies {
  readonly noteRepository: NoteRepository;
  readonly noteChunkRepository: NoteChunkRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Tek cagrida onarilacak EN FAZLA not. Config'ten gelir. */
  readonly batchSize: number;
  /** Saatlik not payi — `create_note` kovasi paylasilir. */
  readonly rateLimit: number;
}

/**
 * Chunk'i olmayan notlari yeniden indeksler (ADR-0029 bilinen sinir).
 *
 * ============================================================================
 * HANGI PROBLEMI COZUYOR
 * ============================================================================
 * `CreateNoteUseCase`'te T1 (not) commit edildikten SONRA embedding cokerse not
 * KALIR ama chunk'siz olur — ve chunk'siz bir notu AI HIC BULAMAZ. Kullaniciya
 * "not kaydedildi ancak indekslenemedi" denir (502), ama kayit sessizce
 * aranamaz durumda kalir.
 *
 * ============================================================================
 * IS LISTESI TURETILMISTIR, SAKLANMAZ
 * ============================================================================
 * "Onarilacaklar" diye bir tablo YOK: `notes LEFT JOIN note_chunks WHERE
 * note_chunks.id IS NULL` sorusu her seferinde yeniden sorulur.
 *
 * Bunun iki sonucu var, ikisi de istenen:
 *   1. Deneme sayaci/backoff GEREKMEZ — otomatik bir dongu yok, tetikleyici
 *      acik bir istek ve o istek oran sinirina tabi.
 *   2. MODEL DEGISIMINE ACIK — o gun yuklem "chunk'i yok"tan "chunk'i ESKI
 *      modelden"e doner, bu use case aynen kalir. (Bugun `note_chunks`'ta model
 *      kolonu YOK; o ekleme ayri bir istir ve bu slice'ta yapilmadi.)
 *
 * ============================================================================
 * TENANT-SCOPED — dar rol GEREKMEZ
 * ============================================================================
 * Hem tespit hem onarim aktif tenant'in verisi uzerinde calisir; RLS yeter,
 * `businessos_app` yeter. Tenant'lar ARASI bir supurucu 6. bir dar rol
 * gerektirirdi ve ADR-0030 §2.4'un "ertelenemez genellestirme" kuralini
 * tetiklerdi — bu yuzden supurucu BILEREK yapilmadi.
 *
 * ============================================================================
 * TRANSACTION DUZENI — `CreateNoteUseCase` ile ayni
 * ============================================================================
 *   T0  oran siniri                     -> kendi transaction'i
 *   T1  chunk'siz notlari oku           -> transaction
 *       her not icin: chunking + embed  -> ag, transaction YOK
 *       T2  o notun chunk'larini yaz    -> transaction
 *   T3  kalan sayisi                    -> transaction
 *
 * Her not KENDI T2'sini alir: biri cokerse digerleri yazilmis kalir. Tek bir
 * buyuk transaction, 10 notluk bir onarimda son notun hatasi yuzunden
 * dokuzunun da geri alinmasi demekti.
 *
 * IDEMPOTENT: `UNIQUE (note_id, chunk_index)` (migration 0011) es zamanli iki
 * onarimda ikincisini kisitla reddeder; o not "failed" sayilir, veri
 * BOZULMAZ. Kisit zaten "yeniden uretim idempotent olsun" diye konmustu.
 * ============================================================================
 */
export class ReindexNotesUseCase {
  constructor(private readonly deps: ReindexNotesDependencies) {}

  async execute(command: ReindexNotesCommand): Promise<ReindexNotesResult> {
    const tenantId = TenantId.create(command.tenantId);
    const now = this.deps.clock.now();

    // --- T0: oran siniri ----------------------------------------------------
    // `create_note` kovasi PAYLASILIR: ayni maliyet profili (embedding
    // cagrilari) ve ayni butce. Ayri bir kova, onarimi butcesiz bir yan kapiya
    // cevirirdi.
    await enforceRateLimit(this.deps, {
      tenantId,
      userId: command.userId,
      action: 'create_note',
      limit: this.deps.rateLimit,
    });

    // --- T1: is listesi -----------------------------------------------------
    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.noteRepository.listUnindexed(this.deps.batchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const note of pending) {
      if (await this.#reindexOne(note, tenantId, now)) {
        repaired += 1;
      } else {
        failed += 1;
      }
    }

    // --- T3: kalan ----------------------------------------------------------
    const remaining = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.noteRepository.countUnindexed(),
    );

    return { repaired, failed, remaining };
  }

  /** Tek notu onarir. Hata YUKARI CIKMAZ: bir not digerlerini durdurmaz. */
  async #reindexOne(note: UnindexedNote, tenantId: TenantId, now: Date): Promise<boolean> {
    try {
      // --- Ag · transaction YOK ---------------------------------------------
      const chunks = await this.#buildChunks(note, tenantId, now);

      // --- T2: yalnizca BU notun chunk'lari ---------------------------------
      await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
        this.deps.noteChunkRepository.saveAll(chunks),
      );

      return true;
    } catch {
      // Sebep yutulmuyor, SAYILIYOR: cagirana `failed` olarak doner ve istemci
      // "hala N not aranabilir degil" diyebilir. Tek tek hata sebeplerini
      // yuzeye cikarmak, bir toplu islem icin gurultu olurdu.
      return false;
    }
  }

  async #buildChunks(note: UnindexedNote, tenantId: TenantId, now: Date): Promise<NoteChunk[]> {
    const contents = chunkText(note.body);
    const chunks: NoteChunk[] = [];

    for (const [index, content] of contents.entries()) {
      chunks.push(
        NoteChunk.create({
          id: NoteChunkId.create(this.deps.idGenerator.nextId()),
          tenantId,
          noteId: NoteId.create(note.id),
          chunkIndex: index,
          content,
          embedding: await this.#embed(content),
          // Chunk'in olusma ani ONARIM anidir, notun yazilma ani degil.
          createdAt: now,
        }),
      );
    }

    return chunks;
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(content: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(content);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }
}
