import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { ConversationAccessDeniedError } from '../domain/knowledge.error';
import { TenantId } from '../domain/tenant-id.value-object';
import { type ConversationRepository } from './conversation.repository.port';
import { EmbeddingFailedError, type EmbeddingPort } from './embedding.port';
import { KNOWLEDGE_SYSTEM_PROMPT } from './knowledge-prompt';
import { CompletionFailedError, type LLMPort, type LlmMessage } from './llm.port';
import { type NoteChunkSearch, type SimilarChunk } from './note-chunk-search.port';

export interface AskKnowledgeCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ. */
  readonly tenantId: string;
  readonly userId: string;
  readonly question: string;
  /** Opsiyonel (ADR-0030 §1.2). `null` ise yeni konusma acilir. */
  readonly conversationId: string | null;
}

export interface AskKnowledgeResult {
  readonly answer: string;
  /** Cevabin dayandigi notlarin id'leri — alaka sirasinda, TEKILLESTIRILMIS. */
  readonly sourceNoteIds: readonly string[];
  /** Verilen ya da yeni acilan konusmanin id'si. */
  readonly conversationId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface AskKnowledgeDependencies {
  readonly noteChunkSearch: NoteChunkSearch;
  readonly conversationRepository: ConversationRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly llmPort: LLMPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  /** Cekilecek parca sayisi. Config'ten gelir (ADR-0030 §1.2: sabitlenmez). */
  readonly retrievalLimit: number;
  /** Gecmisten alinacak TEKIL mesaj sayisi. Config'ten gelir. */
  readonly historyMessages: number;
}

/**
 * Kurumsal hafizaya soru sorar (ADR-0029 §4 okuma akisi + ADR-0030 §1).
 *
 * ============================================================================
 * IKI AG CAGRISI, IKISI DE TRANSACTION DISINDA
 * ============================================================================
 *   embed(soru)              -> ag · transaction YOK
 *   T1  retrieval + gecmis   -> transaction
 *   complete(...)            -> ag · transaction YOK
 *   T2  konusma + iki mesaj  -> transaction
 *
 * ADR-0029 §4'un `notes` akisindaki ilkenin aynisi: pahali bir cagri boyunca
 * veritabani baglantisi TUTULMAZ. Burada cagri IKI tane ve ikisi de disarida.
 * ============================================================================
 *
 * ============================================================================
 * KONUSMA T2'DE ACILIR, T1'DE DEGIL
 * ============================================================================
 * Yeni bir konusmanin zaten gecmisi yoktur — T1'de var olmasina gerek yok. Ve
 * LLM cagrisi cokerse BOS bir konusma satiri kalmasin: `messages` tablosunun
 * retention borcu zaten kayitli (ROADMAP §8.3), oraya bir de yetim konusma
 * eklemek gereksiz.
 *
 * IKI MESAJ BIRLIKTE yazilir. LLM cokerse HICBIRI yazilmaz — cevapsiz bir soru,
 * bir sonraki istegin gecmisini kirletir ve model "kendi cevaplamadigi bir
 * soruyu" baglam sanirdi.
 * ============================================================================
 */
export class AskKnowledgeUseCase {
  constructor(private readonly deps: AskKnowledgeDependencies) {}

  async execute(command: AskKnowledgeCommand): Promise<AskKnowledgeResult> {
    const tenantId = TenantId.create(command.tenantId);
    const question = command.question.trim();

    // --- Ag · transaction YOK ------------------------------------------------
    const questionEmbedding = await this.#embed(question);

    // --- T1: sahiplik + retrieval + gecmis -----------------------------------
    const { chunks, history } = await this.#gatherContext(command, tenantId, questionEmbedding);

    // --- Ag · transaction YOK ------------------------------------------------
    const answer = await this.#complete(question, chunks, history);

    // --- T2: konusma + iki mesaj --------------------------------------------
    const { conversationId } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      () =>
        this.deps.conversationRepository.appendTurn({
          tenantId,
          userId: command.userId,
          conversationId: command.conversationId,
          newConversationId: this.deps.idGenerator.nextId(),
          messages: [
            { id: this.deps.idGenerator.nextId(), role: 'user', content: question },
            { id: this.deps.idGenerator.nextId(), role: 'assistant', content: answer },
          ],
        }),
    );

    return { answer, sourceNoteIds: distinctNoteIds(chunks), conversationId };
  }

  /** T1 — tek transaction: sahiplik, retrieval ve gecmis birlikte okunur. */
  #gatherContext(
    command: AskKnowledgeCommand,
    tenantId: TenantId,
    questionEmbedding: number[],
  ): Promise<{ chunks: readonly SimilarChunk[]; history: LlmMessage[] }> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // Sahiplik ONCE dogrulanir: erisimi olmayan bir konusma icin pahali
      // retrieval yapmanin anlami yok.
      await this.#assertConversationAccess(command.conversationId, command.userId);

      return {
        chunks: await this.deps.noteChunkSearch.findSimilar({
          tenantId,
          embedding: questionEmbedding,
          limit: this.deps.retrievalLimit,
        }),
        history: await this.#loadHistory(command.conversationId),
      };
    });
  }

  /**
   * Verilen konusmanin istegi yapan kullaniciya ait oldugunu dogrular.
   *
   * ============================================================================
   * RLS TENANT'I KORUR, KULLANICIYI KORUMAZ
   * ============================================================================
   * `knowledge.conversations` politikasi `tenant_id` uzerindedir. Ayni
   * tenant'taki BASKA bir kullanicinin konusma id'si RLS'e TAKILMAZ ve gecmisi
   * baglama girerdi — yani bir kullanici, meslektasinin gecmis sorularini
   * modele okutabilirdi. Kullanici siniri bu yuzden BURADA uygulanir.
   *
   * UC DURUM AYNI SONUCU verir (P2): konusma yok · baska tenant · baska
   * kullanici. Ayirt etmek "bu id gercek mi" sorusuna cevap vermek olurdu.
   *
   * YAN FAYDA: bu kontrol olmadan, var olmayan bir `conversationId` T2'de
   * yabanci anahtar ihlaline dusup 500 uretiyordu. Artik 403 doner.
   * ============================================================================
   */
  async #assertConversationAccess(conversationId: string | null, userId: string): Promise<void> {
    if (conversationId === null) {
      return;
    }

    const ownerUserId = await this.deps.conversationRepository.findOwnerUserId(conversationId);
    if (ownerUserId !== userId) {
      throw new ConversationAccessDeniedError();
    }
  }

  /** Konusma verilmemisse gecmis YOKTUR; bosuna sorgu acilmaz. */
  async #loadHistory(conversationId: string | null): Promise<LlmMessage[]> {
    if (conversationId === null || this.deps.historyMessages === 0) {
      return [];
    }

    return this.deps.conversationRepository.findRecentMessages({
      conversationId,
      limit: this.deps.historyMessages,
    });
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(question: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(question);
    } catch (error) {
      throw new EmbeddingFailedError(describe(error));
    }
  }

  /**
   * Cevabi uretir.
   *
   * `context` YALNIZCA chunk METINLERIDIR — not id'leri modele GONDERILMEZ.
   * Model onlari cevabina yazamaz (ve uyduramaz); kaynak listesi retrieval'in
   * dondurdugu gercek satirlardan TURETILIR (`distinctNoteIds`). Modele kaynak
   * atfi yaptirmak, uydurma bir id'nin yanita girmesine kapi acardi.
   */
  async #complete(
    question: string,
    chunks: readonly SimilarChunk[],
    history: readonly LlmMessage[],
  ): Promise<string> {
    try {
      return await this.deps.llmPort.complete({
        systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
        userMessage: question,
        context: chunks.map((chunk) => chunk.content),
        history,
      });
    } catch (error) {
      throw new CompletionFailedError(describe(error));
    }
  }
}

/**
 * Kaynak not id'leri — ALAKA SIRASI korunarak tekillestirilir.

 * Ayni nottan birden fazla parca gelmesi olagandir (uzun bir not, birkac
 * chunk). Istemciye ayni id'yi tekrar tekrar gondermek gurultudur; siralamayi
 * bozmak ise "en alakali kaynak" bilgisini kaybettirir. `Set` ekleme sirasini
 * korur, bu yuzden ikisi birden saglanir.
 */
function distinctNoteIds(chunks: readonly SimilarChunk[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.noteId))];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
