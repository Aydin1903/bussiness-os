import { type PermissionChecker } from '../../authz/authz.public';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { CompletionFailedError, type LLMPort, type LlmMessage } from '../../../shared/llm.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { normalizeUuidV7 } from '../../../shared/uuid-v7';
import { ConversationAccessDeniedError } from '../domain/context.error';
import { ASK_SYSTEM_PROMPT } from './ask-prompt';
import { type ConversationRepository } from './conversation.repository.port';
import { parseCompletion } from './follow-up-parser';
import { CONTEXT_ASK_ACTION } from '../context.rate-limits';
import {
  type ContextFragment,
  type RetrievalContributor,
  type RetrievalContributorRegistry,
} from './retrieval-contributor.port';
import {
  type CandidateRanking,
  selectFragments,
  type RankedCandidate,
  type SelectFragmentsResult,
} from './select-fragments';
import {
  type RetrievalScoreEntry,
  type RetrievalSelectionRecorder,
  type RetrievalSourceRecord,
  type RetrievalSourceStatus,
} from './retrieval-selection-recorder.port';

export interface AskCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ. */
  readonly tenantId: string;
  readonly userId: string;
  /** Kullanicinin BU tenant'taki rolu — katkici elemesi bunun uzerinden yapilir. */
  readonly role: string;
  readonly question: string;
  /** Opsiyonel (ADR-0030 §1.2). `null` ise yeni konusma acilir. */
  readonly conversationId: string | null;
}

/** Cevabin dayandigi tek kaynak (ADR-0031 §5.1). */
export interface AnswerSource {
  /** Hangi modulden geldi (`knowledge`, ileride `crm`). */
  readonly source: string;
  /** Kaynagin turu (`note`, ileride `interaction` / `opportunity`). */
  readonly kind: string;
  readonly id: string;
}

export interface AskResult {
  readonly answer: string;
  /**
   * Cevabin dayandigi kaynaklar — alaka sirasinda, TEKILLESTIRILMIS.
   *
   * `sourceNoteIds` DEGIL: uc artik platformundur ve gelen referans bir not
   * olmak zorunda degil (ADR-0031 §5.1). Ikinci bir kirilmayi Slice 7'ye
   * birakmamak icin ad bugunden dogru konuldu.
   */
  readonly sources: readonly AnswerSource[];
  readonly conversationId: string;
  /**
   * Modelin onerdigi takip sorulari (ADR-0029 §4).
   *
   * AYRI bir LLM cagrisi DEGIL: ayni `complete()` ciktisindan ayrilir.
   */
  readonly followUps: readonly string[];
  /**
   * Cagrilip HATA VEREN katkicilarin etiketleri (ADR-0031 §5.5).
   *
   * ⚠️ IZNI OLMADIGI ICIN ELENEN katkici BURAYA GIRMEZ. Ikisi farkli seydir:
   * "alamadik" ile "goremezsin". Yetkisi olmayan kullaniciya bir kaynagin
   * ADINI soylemek, goremedigi verinin VARLIGINI sizdirirdi. Eleme SESSIZDIR.
   */
  readonly degradedSources: readonly string[];
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface AskDependencies {
  readonly contributors: RetrievalContributorRegistry;
  readonly permissionChecker: PermissionChecker;
  readonly conversationRepository: ConversationRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly llmPort: LLMPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Cekilecek TOPLAM parca sayisi. Config'ten gelir. */
  readonly retrievalLimit: number;
  /** Gecmisten alinacak TEKIL mesaj sayisi. Config'ten gelir. */
  readonly historyMessages: number;
  /** Saatlik soru payi (ADR-0029 §5). Config'ten gelir. */
  readonly rateLimit: number;
  /**
   * Secim kararinin gozlemlenebilirlik kaydi (ADR-0046).
   *
   * ⚠️ HICBIR KARARI ETKILEMEZ — yalnizca olan biteni kaydeder. Kaydin varligi
   * ya da yoklugu, modele giden parcalari DEGISTIRMEZ; `record` `void` doner ve
   * ASLA FIRLATMAZ.
   */
  readonly selectionRecorder: RetrievalSelectionRecorder;
}

/**
 * Kurumsal hafizaya soru sorar — TEK uc, TUM moduller (ADR-0031 §5).
 *
 * ============================================================================
 * NEDEN PLATFORMDA, MODULDE DEGIL
 * ============================================================================
 * CLAUDE.md'nin kurucu ornegi ("son 6 ayimizi analiz et") CRM, Finans ve
 * Projeler'e BIRLIKTE bakmayi gerektirir. Modul basina `/ask` ucu bu cumleyi
 * YAPISAL OLARAK imkansiz kilardi ve kullaniciya "bunu hangi modulden
 * sorayim" yukunu devrederdi — ki bu tam olarak reddedilen chatbot
 * cercevesidir.
 *
 * Modul sinirlari yine de korunur: hicbir modul digerinin semasini okumaz.
 * Her modul KENDI semasindan `RetrievalContributor` ile katki verir, platform
 * yalnizca birlestirir.
 *
 * ============================================================================
 * IKI AG CAGRISI, IKISI DE TRANSACTION DISINDA
 * ============================================================================
 *   T0  oran siniri sayaci   -> transaction (kendi basina, hemen commit)
 *   embed(soru)              -> ag · transaction YOK
 *   T1  sahiplik + gecmis    -> transaction
 *   katkicilar (PARALEL)     -> her biri kendi transaction'ini yonetir
 *   complete(...)            -> ag · transaction YOK
 *   T2  konusma + iki mesaj  -> transaction
 * ============================================================================
 */
export class AskUseCase {
  constructor(private readonly deps: AskDependencies) {}

  async execute(command: AskCommand): Promise<AskResult> {
    // Kimlik bicimi EN BASTA dogrulanir — transaction acilmadan, tek kurus
    // harcanmadan. Deger dogrulanmis token'dan gelir, yani buraya bozuk bir
    // id ulasmasi beklenmez; bu bir SAVUNMA KATMANIDIR (Knowledge'in
    // `TenantId.create` cagrisinin yerini tutar, ama `shared/` uzerinden —
    // platform bir is modulunun value object'ine baglanamaz).
    assertUuid(command.tenantId, 'tenantId');

    const question = command.question.trim();

    // --- T0: oran siniri ----------------------------------------------------
    // Embedding'den ONCE: reddedilecek bir istek TEK KURUS harcamamali.
    await enforceRateLimit(this.deps, {
      tenantId: command.tenantId,
      userId: command.userId,
      action: CONTEXT_ASK_ACTION,
      limit: this.deps.rateLimit,
    });

    // --- Ag · transaction YOK ------------------------------------------------
    const questionEmbedding = await this.#embed(question);

    // --- T1: sahiplik + gecmis ----------------------------------------------
    const history = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // Sahiplik ONCE dogrulanir: erisimi olmayan bir konusma icin pahali
      // retrieval yapmanin anlami yok.
      await this.#assertConversationAccess(command.conversationId, command.userId);
      return this.#loadHistory(command.conversationId);
    });

    // --- Katkicilar ----------------------------------------------------------
    const { fragments, degradedSources } = await this.#gather(command, questionEmbedding, question);

    // --- Ag · transaction YOK ------------------------------------------------
    const completion = await this.#complete(question, fragments, history);
    const { answer, followUps } = parseCompletion(completion);

    // --- T2: konusma + iki mesaj --------------------------------------------
    const { conversationId } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      () =>
        this.deps.conversationRepository.appendTurn({
          tenantId: command.tenantId,
          userId: command.userId,
          conversationId: command.conversationId,
          newConversationId: this.deps.idGenerator.nextId(),
          messages: [
            { id: this.deps.idGenerator.nextId(), role: 'user', content: question },
            { id: this.deps.idGenerator.nextId(), role: 'assistant', content: answer },
          ],
        }),
    );

    return {
      answer,
      sources: distinctSources(fragments),
      conversationId,
      followUps,
      degradedSources,
    };
  }

  /**
   * Katkicilari ELER, PARALEL cagirir ve sonuclari birlestirir.
   *
   * ============================================================================
   * IZIN ELEMESI PAHALI ISTAN ONCE
   * ============================================================================
   * Izni olmayan katkici HIC CAGRILMAZ — yalnizca sonucu atilmaz. Sonradan
   * filtrelemek hem bosa is hem de gereksiz bir sizinti yuzeyi olurdu.
   *
   * Filtre olmasaydi birlesik hafiza yetkilendirmeyi delen bir YAN KAPI
   * olurdu: kullanici goremedigi bir kaydin icerigini, onu ozetleyen cevap
   * uzerinden okurdu. RLS bunu yakalamaz (tenant sinirini korur, tenant
   * ICINDEKI izin sinirini degil).
   *
   * ============================================================================
   * MODUL BASINA KOTA YOK — GLOBAL TOP-K + YAPISAL TABAN
   * ============================================================================
   * Bir musteri sorusunda en alakali parcalarin HEPSI tek bir modulden
   * gelebilir. Sabit MODUL kotasi ("her modulden 4"), en iyi kanitlari en
   * kotuleriyle degistirirdi ve ADR-0031 §5.1 onu bu yuzden reddetti.
   *
   * ⚠️ ADR-0036: saf skor siralamasinin USTUNE bir TABAN eklendi. Havuzun
   * `ceil(K/3)` kadari, AYRI yapisal kaynaklara birer yuva olarak garanti
   * edilir. Sebep olculdu (ADR-0035 §6.3): anlamsal skorlar merdivensiz olarak
   * ~1.0 doner, yapisal skorlar 0.95'te tavanlidir — yani yapisal kaynaklar
   * veri zenginlestikce SISTEMATIK olarak elenir. Bu, modul kotasi DEGILDIR:
   * kaynak TURU basina ve yalnizca bir TABAN (tavan degil).
   *
   * Karar burada degil `select-fragments.ts`te yasar — girdi/cikti olarak
   * sinanabilir olmasi icin.
   *
   * ⚠️ BILINEN SINIR: skorlar kaynaklar arasinda HALA KALIBRE DEGIL (ADR-0031).
   * ADR-0036 kalibrasyon yapmaz, kalibrasyonsuzlugun en gorunur sonucunu
   * telafi eder.
   * ============================================================================
   */
  async #gather(
    command: AskCommand,
    embedding: number[],
    question: string,
  ): Promise<{ fragments: ContextFragment[]; degradedSources: string[] }> {
    const registered = this.deps.contributors.all();

    // ⚠️ IZIN ELEMESI BURADA — ve elenenler ARTIK KAYBOLMUYOR (ADR-0046 §4.2).
    // Once yalnizca `allowed` hesaplaniyordu; `forbidden` olanlar hicbir yerde
    // gorunmuyordu ve _"bu tenant'ta neden hic finans sesi yok"_ sorusu
    // cevapsiz kaliyordu.
    const allowed = registered.filter((contributor) =>
      this.deps.permissionChecker.can(command.role, contributor.permission),
    );
    const forbidden = registered.filter((contributor) => !allowed.includes(contributor));

    const degradedSources: string[] = [];
    // ⚠️ `null` = katkici COKTU. Bos dizi ile KARISTIRILMAMALI: bos dizi
    // "cagrildi, soyleyecek seyi yoktu" (`empty`), `null` "cagrildi ve coktu"
    // (`degraded`) demektir — ve ADR-0042 tam olarak bu ayrimi yapamadigi icin
    // kapandi.
    const results = await Promise.all(
      allowed.map(async (contributor): Promise<ContextFragment[] | null> => {
        try {
          return await contributor.contribute({
            question,
            embedding,
            limit: this.deps.retrievalLimit,
          });
        } catch {
          // Bir katkicinin cokmesi TUM istegi cokertmez: bir modulun yavas ya
          // da bozuk sorgusu sistemin tamamini durdurmamalidir. Ama SESSIZCE
          // de atlanmaz — kullanici eksik ama kendinden emin bir cevap alirdi.
          degradedSources.push(contributor.source);
          return null;
        }
      }),
    );

    // ⚠️ Adaylar KATKICI ile BIRLIKTE tasinir: taban garantisi, parcanin kendi
    // `source` alanina degil, KATKICI KAYDINA dayanir. Ikisi uretimde ayni
    // sabittir; ama garantiyi parcanin beyanina baglamak, bir modulun yanlis
    // etiket yazmasi hâlinde onu SESSIZCE kaybettirirdi.
    const candidates = allowed.flatMap((contributor, index) =>
      (results[index] ?? []).map((fragment) => ({
        fragment,
        source: contributor.source,
        contributionKind: contributor.contributionKind,
      })),
    );

    const selection = selectFragments({
      candidates,
      limit: this.deps.retrievalLimit,
      question,
    });

    // ⚠️ KAYIT SECIMDEN SONRA VE CEVAPTAN ONCE — ama hicbirini ETKILEMEZ
    // (ADR-0046).
    //
    // ⚠️ `try/catch` `ai.call` DESENINDEN BIR ADIM DAHA ILERI ve bilincli:
    // port'un sozlesmesi zaten "`record` ASLA FIRLATMAZ" diyor, ama buradaki
    // savunma IKI seyi birden kapsiyor:
    //
    //   1. sozlesmeyi IHLAL EDEN bir kayitci (yanlis yazilmis bir adapter),
    //   2. ⚠️ `#recordSelection`IN KENDI KODUNDAKI bir hata — ki o kod HER
    //      `/ask` cagrisinda kosar ve bir teshis satiri ugruna kullanicinin
    //      sorusunu cevapsiz birakmasi KABUL EDILEMEZ.
    //
    // ADR-0046'nin cumlesi: _"kayit tutmak, kaydedilen isin BASARISINI
    // etkilememelidir."_ O soz burada, cagri yerinde de tutuluyor.
    try {
      this.#recordSelection({ allowed, forbidden, results, candidates, selection });
    } catch {
      // Kasitli olarak yutuluyor. Burada tekrar loglamak, log'un kendisinin
      // bozuk oldugu bir durumda sonsuz donguye girebilirdi.
    }

    return { fragments: selection.fragments, degradedSources };
  }

  /**
   * Secim kararini kaydeder (ADR-0046).
   *
   * ============================================================================
   * ⚠️ DORT DURUM — VE `empty` ILE `returned` AYRIMI BU METODUN SEBEBIDIR
   * ============================================================================
   * ADR-0042 su soruyu cevaplayamadan kapandi: _"`project-status` ve
   * `appointment-schedule` ELENDI Mi, yoksa BOS MU DONDU — BILINMIYOR."_
   *
   * Fark, T2 esiginin GIRDISIDIR: T2 _"SATIR DONDUREN yapisal kaynak
   * sayisi"_ni sayar, kayitli olani degil.
   *
   *   `returned`  -> `rows.length >= 1`   (T2'ye SAYILIR)
   *   `empty`     -> `rows.length === 0`  (T2'ye SAYILMAZ)
   *   `forbidden` -> izin yok, HIC cagrilmadi
   *   `degraded`  -> `null` dondu, yani COKTU
   *
   * ⚠️ `forbidden` LOGA yazilir ama API'ye SIZMAZ: `AskResult` sekli
   * degismedi ve `degradedSources` yalnizca gercekten COKENLERI tasiyor
   * (ADR-0031 §5.3 CAGIRAN icindir, OPERATOR icin degil).
   */
  #recordSelection(input: {
    allowed: readonly RetrievalContributor[];
    forbidden: readonly RetrievalContributor[];
    results: readonly (ContextFragment[] | null)[];
    candidates: readonly RankedCandidate[];
    selection: SelectFragmentsResult;
  }): void {
    const called = input.allowed.map((contributor, index) =>
      toSourceRecord({
        contributor,
        rows: input.results[index] ?? null,
        candidates: input.candidates,
        selected: input.selection.selected,
        rankings: input.selection.rankings,
      }),
    );

    // ⚠️ Izin yuzunden HIC CAGRILMAYANLAR: `rowCount` `null` cunku sayilacak
    // bir sey yok. LOGA yazilir, API'ye SIZMAZ (§4.2).
    const blocked: RetrievalSourceRecord[] = input.forbidden.map((contributor) => ({
      source: contributor.source,
      kind: contributor.contributionKind,
      status: 'forbidden',
      rowCount: null,
      selectedCount: 0,
      scores: [],
    }));

    this.deps.selectionRecorder.record({
      limit: this.deps.retrievalLimit,
      structuralFloor: input.selection.structuralFloor,
      selectedCount: input.selection.fragments.length,
      candidateCount: input.candidates.length,
      sources: [...called, ...blocked],
    });
  }

  /** Verilen konusmanin istegi yapan kullaniciya ait oldugunu dogrular. */
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
   * `context` YALNIZCA parca METINLERIDIR — kaynak id'leri modele GONDERILMEZ.
   * Model onlari cevabina yazamaz (ve uyduramaz); kaynak listesi katkicilarin
   * dondurdugu gercek referanslardan TURETILIR.
   */
  async #complete(
    question: string,
    fragments: readonly ContextFragment[],
    history: readonly LlmMessage[],
  ): Promise<string> {
    try {
      return await this.deps.llmPort.complete({
        systemPrompt: ASK_SYSTEM_PROMPT,
        userMessage: question,
        context: fragments.map((fragment) => fragment.content),
        history,
      });
    } catch (error) {
      throw new CompletionFailedError(describe(error));
    }
  }
}

/**
 * Kaynaklar — ALAKA SIRASI korunarak tekillestirilir.
 *
 * Ayni kayittan birden fazla parca gelmesi olagandir (uzun bir not, birkac
 * chunk). Istemciye ayni referansi tekrar gondermek gurultudur; siralamayi
 * bozmak ise "en alakali kaynak" bilgisini kaybettirir. `Map` ekleme sirasini
 * korur, bu yuzden ikisi birden saglanir.
 */
function distinctSources(fragments: readonly ContextFragment[]): AnswerSource[] {
  const seen = new Map<string, AnswerSource>();

  for (const fragment of fragments) {
    const key = `${fragment.source}|${fragment.reference.kind}|${fragment.reference.id}`;
    if (!seen.has(key)) {
      seen.set(key, {
        source: fragment.source,
        kind: fragment.reference.kind,
        id: fragment.reference.id,
      });
    }
  }

  return [...seen.values()];
}

/**
 * Bicimsel dogrulama. Basarisizsa AKIS HIC BASLAMAZ.
 *
 * `InvalidContextIdError` gibi ayri bir domain hatasi ACILMADI: bu durum
 * dogrulanmis token'dan gelen bir degerde OLUSAMAZ ve olustuysa bir
 * PROGRAMLAMA hatasidir — 500 dogru cevaptir, ozel bir HTTP eslemesi degil.
 */
function assertUuid(value: string, field: string): void {
  if (normalizeUuidV7(value) === null) {
    throw new TypeError(`Gecersiz ${field}: UUID bekleniyordu.`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cagrilan BIR katkicinin kaydini kurar (ADR-0046 §4.1).
 *
 * ⚠️ SAF FONKSIYON ve sinifin DISINDA: `#recordSelection` yalnizca
 * birlestirir. Kayit kurma mantigi burada durunca hem okunur hem de
 * `status` turetiminin tek yeri olur.
 *
 * ⚠️ `status` SATIR SAYISINDAN turetilir, katkicinin BEYANINDAN degil:
 *
 *   `rows === null`     -> `degraded` (COKTU; `rowCount` "bilinmiyor")
 *   `rows.length === 0` -> ⚠️ `empty` (cagrildi, soyleyecek seyi YOKTU)
 *   aksi halde          -> `returned` (T2'ye SAYILAN tek durum)
 */
function toSourceRecord(input: {
  contributor: RetrievalContributor;
  rows: ContextFragment[] | null;
  candidates: readonly RankedCandidate[];
  selected: ReadonlySet<RankedCandidate>;
  rankings: ReadonlyMap<RankedCandidate, CandidateRanking>;
}): RetrievalSourceRecord {
  const { contributor, rows } = input;

  if (rows === null) {
    return {
      source: contributor.source,
      kind: contributor.contributionKind,
      status: 'degraded',
      // ⚠️ `null`, "sifir" DEGIL "bilinmiyor" demektir: coken bir katkici hic
      // satir uretmedi, yani sayilacak bir sey YOK (`AiTokenUsage` disiplini).
      rowCount: null,
      selectedCount: 0,
      scores: [],
    };
  }

  const scores: RetrievalScoreEntry[] = input.candidates
    .filter((candidate) => candidate.source === contributor.source)
    .map((candidate) => ({
      // ⚠️ UC ONDALIGA yuvarlanir (ADR-0046 §4.4): `0.9500000000000001` gibi
      // bir kayan nokta artigi, "band ici beraberlik var mi" sorusunu GOZLE
      // OKUNAMAZ hale getirir — ve bu verinin tek tuketicisi bir INSANDIR.
      // Secim ZATEN yapilmis oldugu icin yuvarlama siralamayi DEGISTIREMEZ.
      score: Math.round(candidate.fragment.score * 1000) / 1000,
      // ⚠️ `affinity` ve `lot` SECIMDEN gelir, burada YENIDEN HESAPLANMAZ
      // (ADR-0049 §5). Kayit tarafinda ikinci bir hesap, formul degistigi gun
      // ESKI degeri yazmaya devam ederdi ve o sapma SESSIZ olurdu.
      affinity: Math.round((input.rankings.get(candidate)?.affinity ?? 0) * 1000) / 1000,
      lot: input.rankings.get(candidate)?.lot ?? 0,
      selected: input.selected.has(candidate),
    }));

  const status: RetrievalSourceStatus = rows.length === 0 ? 'empty' : 'returned';

  return {
    source: contributor.source,
    kind: contributor.contributionKind,
    status,
    rowCount: rows.length,
    selectedCount: scores.filter((entry) => entry.selected).length,
    scores,
  };
}
