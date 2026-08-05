import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { TenantId } from '../domain/tenant-id.value-object';
import { chunkText } from '../../../shared/chunking';
import { Note } from '../domain/note.entity';
import { NoteChunk } from '../domain/note-chunk.entity';
import { NoteChunkId } from '../domain/note-chunk-id.value-object';
import { NoteId } from '../domain/note-id.value-object';
import { type DailyReportRunRepository } from './daily-report-run.repository.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from './enforce-rate-limit';
import { type RateLimitRepository } from './rate-limit.repository.port';
import { type NoteChunkRepository } from './note-chunk.repository.port';
import { type NoteRepository } from './note.repository.port';

export interface CreateNoteCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ. */
  readonly tenantId: string;
  readonly authorUserId: string;
  readonly title: string | null;
  readonly body: string;
}

export interface CreateNoteResult {
  readonly noteId: string;
  /** Uretilen parca sayisi — istemciye indekslemenin gerceklestigini soyler. */
  readonly chunkCount: number;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface CreateNoteDependencies {
  readonly noteRepository: NoteRepository;
  readonly noteChunkRepository: NoteChunkRepository;
  readonly dailyReportRunRepository: DailyReportRunRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik not olusturma payi (ADR-0029 §5). Config'ten gelir. */
  readonly rateLimit: number;
}

/**
 * Not olusturur ve AI icin indeksler (ADR-0029 §4).
 *
 * ============================================================================
 * IKI TRANSACTION, ARALARINDA AG CAGRISI — ADR-0029 §4'un tam metni
 * ============================================================================
 *   T1  not kaydi + gunluk rapor "tembel seed"i
 *       ↓  transaction KAPALI: chunking + embedding
 *   T2  parcalarin yazilmasi
 *
 * Embedding PAHALI bir ag cagrisidir (OpenAI'a HTTP). Tek transaction olsaydi
 * veritabani baglantisi o cagri boyunca TUTULURDU — havuzda bir baglanti,
 * saglayicinin gecikmesi kadar mesgul kalirdi. Bu, `LoginUseCase`'in Argon2'yi
 * transaction disinda calistirmasiyla ayni ilkedir.
 *
 * BEDELI DURUSTCE: T1 commit olduktan sonra embedding coker ise not KALIR ama
 * parcasi olmaz — yani `/ask` onu asla bulamaz. Not SILINMEZ (T1 zaten commit,
 * geri alinamaz) ve hata yuzeye cikar (5xx). Bu bilinen bir sinirdir; yetim
 * notlar `notes LEFT JOIN note_chunks WHERE chunk IS NULL` ile tespit
 * edilebilir kalir ve yeniden-indeksleme isi ayri bir slice'tir.
 * ============================================================================
 *
 * ============================================================================
 * TEMBEL SEED NEDEN T1'DE
 * ============================================================================
 * Gunluk rapor NOTLARI ozetler, parcalari degil (ADR-0030 §2.2). Dolayisiyla
 * "bu tenant'in bugun raporlanacak bir aktivitesi var" gercegi, notun
 * kendisiyle AYNI ANDA dogru olur. T2 coksse bile rapor uretilmelidir.
 * ============================================================================
 */
export class CreateNoteUseCase {
  constructor(private readonly deps: CreateNoteDependencies) {}

  async execute(command: CreateNoteCommand): Promise<CreateNoteResult> {
    const tenantId = TenantId.create(command.tenantId);
    const now = this.deps.clock.now();

    // Domain dogrulamasi ONCE: saf, I/O'suz ve BEDAVA. Gecersiz bir govde
    // kotadan DUSMEMELIDIR — kullanici 422 aldigi bir istek icin saatlik
    // payini kaybetmemeli.
    const note = this.#buildNote(command, tenantId, now);

    // --- T0: oran siniri ----------------------------------------------------
    // Govde parcalanmadan, TEK BIR embedding cagrisi yapilmadan: uzun bir not
    // ONLARCA cagri demektir ve reddedilecek bir istek icin bunun BIR TANESI
    // bile yapilmamalidir.
    await enforceRateLimit(this.deps, {
      tenantId,
      userId: command.authorUserId,
      action: 'create_note',
      limit: this.deps.rateLimit,
    });

    // --- T1 -----------------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.noteRepository.save(note);
      await this.deps.dailyReportRunRepository.ensureScheduled({
        id: this.deps.idGenerator.nextId(),
        tenantId,
        reportDate: utcDate(now),
      });
    });

    // --- Transaction DISINDA: chunking + embedding --------------------------
    const chunks = await this.#buildChunks(note, now);

    // --- T2 -----------------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.noteChunkRepository.saveAll(chunks);
    });

    return { noteId: note.id.value, chunkCount: chunks.length };
  }

  /**
   * Notu parcalara boler ve her parca icin embedding uretir.
   *
   * Parcalar SIRAYLA islenir, paralel DEGIL: ayni saglayiciya es zamanli istek
   * yagdirmak oran sinirlarini tetikler (outbox tuketicisiyle ayni gerekce).
   * Bir notun parca sayisi kucuktur; paralellestirmenin kazanci, oran siniri
   * riskini haklı cikarmaz.
   */
  async #buildChunks(note: Note, now: Date): Promise<NoteChunk[]> {
    const contents = chunkText(note.body);
    const chunks: NoteChunk[] = [];

    for (const [index, content] of contents.entries()) {
      chunks.push(
        NoteChunk.create({
          id: NoteChunkId.create(this.deps.idGenerator.nextId()),
          tenantId: note.tenantId,
          noteId: note.id,
          chunkIndex: index,
          content,
          embedding: await this.#embed(content),
          createdAt: now,
        }),
      );
    }

    return chunks;
  }

  #buildNote(command: CreateNoteCommand, tenantId: TenantId, now: Date): Note {
    return Note.create({
      id: NoteId.create(this.deps.idGenerator.nextId()),
      tenantId,
      authorUserId: UserId.create(command.authorUserId),
      title: command.title,
      body: command.body,
      createdAt: now,
    });
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

/**
 * `YYYY-MM-DD` (UTC).
 *
 * Tenant bazli saat dilimi KAPSAM DISI (ADR-0030 §2.3): rapor gunu her tenant
 * icin ayni UTC gunudur. `toISOString()` daima UTC dondurur — yerel saat
 * kullanmak, sunucunun saat dilimine gore degisen bir `report_date` uretirdi ve
 * idempotency anahtarini ongorulemez kilardi.
 */
function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
