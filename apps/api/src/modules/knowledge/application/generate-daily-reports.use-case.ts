import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { decideReportRetry } from '../domain/daily-report-retry.policy';
import {
  type ClaimedReportRun,
  type DailyReportRunRepository,
  type ReportNote,
} from './daily-report-run.repository.port';
import { DAILY_REPORT_SYSTEM_PROMPT, EMPTY_DAILY_REPORT_SUMMARY } from './daily-report-prompt';
import { type LLMPort } from './llm.port';

export interface DailyReportFailure {
  readonly id: string;
  readonly tenantId: string;
  readonly reason: string;
  readonly attemptCount: number;
  /** `true` ise kayit kuyruktan CIKARILDI ve ALARM gerektirir. */
  readonly deadLettered: boolean;
}

export interface GenerateDailyReportsResult {
  /** Bu turda kilitlenen kayit sayisi. */
  readonly claimed: number;
  /** `generated_at` yazilan kayit sayisi (LLM'li + bos olanlar). */
  readonly generated: number;
  /** Not bulunamadigi icin LLM CAGRILMADAN kapatilan kayit sayisi. */
  readonly empty: number;
  readonly failures: readonly DailyReportFailure[];
  readonly deadLettered: number;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface GenerateDailyReportsDependencies {
  readonly reportRepository: DailyReportRunRepository;
  readonly llmPort: LLMPort;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
  /** Tek turda islenecek en fazla kayit. Config'ten gelir. */
  readonly batchSize: number;
  /** Raporlarin vadesinin geldigi UTC saati (ADR-0030 §2.3). Config'ten gelir. */
  readonly hourUtc: number;
  /** Ozetlenecek pencere — ADR-0030 §2.2: son 24 saat. */
  readonly windowHours: number;
}

/**
 * Vadesi gelmis gunluk raporlari uretir (ADR-0030 §2).
 *
 * ============================================================================
 * UC TRANSACTION, IKI FARKLI YETKI MODELI
 * ============================================================================
 *   T1  claim              -> tenant context YOK   · dar rol (SECURITY DEFINER)
 *       her tenant icin:
 *   T2  notlari oku        -> TENANT CONTEXT VAR   · normal RLS, businessos_app
 *       complete(...)      -> ag · transaction YOK
 *   T3  mark / failure     -> tenant context YOK   · dar rol
 *
 * ⚠️ T2'nin AYRI olmasi bir tercih degil, ZORUNLULUK. `businessos_report_worker`
 * YALNIZCA `daily_report_runs`'a yetkilidir; `notes`'a erisemez ve
 * ERISEMEMELIDIR (ADR-0030 §2.4 sozlesmesi, Constraint 2 esdegeri testiyle
 * kanitli). Role bir "notlari oku" fonksiyonu eklemek o testi ve sozlesmeyi
 * kirardi. Bu yuzden notlar, DOGRU tenant context'i altinda, NORMAL RLS ile,
 * siradan uygulama rolu tarafindan okunur — asim yuzeyi bir milim buyumez.
 *
 * ============================================================================
 * KILIT LLM CAGRISINI KAPSAMAZ — bilincli
 * ============================================================================
 * `FOR UPDATE SKIP LOCKED` kilidi T1 bitince birakilir. Projede tekrarlanan
 * ders: pahali bir ag cagrisi boyunca veritabani baglantisi/kilidi TUTULMAZ.
 * (Outbox relay kilidi tutabiliyor cunku teslimat hizli; burada cagri saniyeler
 * suruyor.)
 *
 * Bedeli: cok-instance'li kurulumda iki instance ayni tenant icin rapor
 * uretebilir. Veri BOZULMAZ — `mark_daily_report_generated` `generated_at IS
 * NULL` ile idempotenttir ve `UNIQUE (tenant_id, report_date)` vardir; kayip
 * yalnizca bosa giden bir LLM cagrisidir. Kabul edildi (ADR-0030 §2.1'in
 * "gercek kuyruk gelene kadar" cercevesi).
 *
 * ============================================================================
 * BIR TENANT'IN HATASI DIGERLERINI DURDURMAZ
 * ============================================================================
 * Her kayit kendi `try/catch`'i icinde islenir. Aksi halde tek bir bozuk
 * tenant, o turdaki TUM sirketlerin raporunu engellerdi.
 * ============================================================================
 */
export class GenerateDailyReportsUseCase {
  constructor(private readonly deps: GenerateDailyReportsDependencies) {}

  async execute(): Promise<GenerateDailyReportsResult> {
    const now = this.deps.clock.now();

    // --- T1: claim · tenant context YOK -------------------------------------
    const claimed = await this.deps.transactionManager.runInTransaction(() =>
      this.deps.reportRepository.claimPending({
        limit: this.deps.batchSize,
        now,
        today: dueDate(now, this.deps.hourUtc),
      }),
    );

    return this.#processAll(claimed, now);
  }

  /** Her kayit KENDI try/catch'i icinde — biri digerini durdurmaz. */
  async #processAll(
    claimed: readonly ClaimedReportRun[],
    now: Date,
  ): Promise<GenerateDailyReportsResult> {
    const failures: DailyReportFailure[] = [];
    let generated = 0;
    let empty = 0;

    for (const run of claimed) {
      const outcome = await this.#processOne(run, now);

      if (outcome.kind === 'failed') {
        failures.push(outcome.failure);
        continue;
      }

      generated += 1;
      if (outcome.kind === 'empty') {
        empty += 1;
      }
    }

    return {
      claimed: claimed.length,
      generated,
      empty,
      failures,
      deadLettered: failures.filter((failure) => failure.deadLettered).length,
    };
  }

  async #processOne(
    run: ClaimedReportRun,
    now: Date,
  ): Promise<{ kind: 'generated' | 'empty' } | { kind: 'failed'; failure: DailyReportFailure }> {
    try {
      // --- T2: notlar · TENANT CONTEXT altinda, normal RLS ------------------
      const notes = await this.deps.transactionManager.runInTenantTransaction(run.tenantId, () =>
        this.deps.reportRepository.listNotesSince(this.#windowStart(now)),
      );

      // Bos gun: LLM CAGRILMAZ (bkz. `EMPTY_DAILY_REPORT_SUMMARY`), ama kayit
      // ISARETLENIR — atlanirsa her turda yeniden claim edilirdi.
      const summary =
        notes.length === 0 ? EMPTY_DAILY_REPORT_SUMMARY : await this.#summarize(notes);

      // --- T3: isaretle · tenant context YOK --------------------------------
      await this.deps.transactionManager.runInTransaction(() =>
        this.deps.reportRepository.markGenerated({ id: run.id, summary, generatedAt: now }),
      );

      return { kind: notes.length === 0 ? 'empty' : 'generated' };
    } catch (error) {
      return { kind: 'failed', failure: await this.#recordFailure(run, error, now) };
    }
  }

  /**
   * Ozeti uretir.
   *
   * `context` chunk'lar DEGIL, notlarin TAM metnidir: rapor "neye benziyor"
   * degil "ne oldu" sorusuna cevap verir ve gunun tamamini gormek zorundadir.
   * Bu yuzden `EmbeddingPort` bu akista HIC cagrilmaz (ADR-0030 §2.2).
   */
  async #summarize(notes: readonly ReportNote[]): Promise<string> {
    return this.deps.llmPort.complete({
      systemPrompt: DAILY_REPORT_SYSTEM_PROMPT,
      userMessage: 'Bu donemde eklenen notlari kisaca ozetle.',
      context: notes.map(toContextEntry),
    });
  }

  /** Basarisizlik KENDI transaction'inda yazilir — tur cokse bile kaybolmaz. */
  async #recordFailure(
    run: ClaimedReportRun,
    error: unknown,
    now: Date,
  ): Promise<DailyReportFailure> {
    const reason = error instanceof Error ? error.message : String(error);
    const decision = decideReportRetry({ previousAttemptCount: run.attemptCount, now });
    const deadLettered = decision.action === 'dead-letter';

    await this.deps.transactionManager.runInTransaction(() =>
      this.deps.reportRepository.recordFailure({
        id: run.id,
        attemptCount: decision.attemptCount,
        lastError: reason,
        nextAttemptAt: decision.action === 'retry' ? decision.nextAttemptAt : null,
        deadLetteredAt: deadLettered ? now : null,
      }),
    );

    return {
      id: run.id,
      tenantId: run.tenantId,
      reason,
      attemptCount: decision.attemptCount,
      deadLettered,
    };
  }

  #windowStart(now: Date): Date {
    return new Date(now.getTime() - this.deps.windowHours * 60 * 60_000);
  }
}

/**
 * Baslik ve govde BIRLIKTE gonderilir.
 *
 * Onboarding notlarinda baslik SORUNUN kendisidir ("Kac kisilik bir
 * ekipsiniz?"); basligi atmak, cevabi baglamsiz birakirdi.
 */
function toContextEntry(note: ReportNote): string {
  return note.title === null ? note.body : `${note.title}\n${note.body}`;
}

/**
 * Hangi gune kadarki raporlarin vadesi geldigi (ADR-0030 §2.3).
 *
 * ============================================================================
 * KARAR SQL'E GOMULMEZ
 * ============================================================================
 * `claim_daily_report_batch` bir `p_today` PARAMETRESI alir; esigi kendi
 * hesaplamaz. Migration yorumu bunu acikca sart kosuyor: "Zamanlayicinin sabit
 * UTC saatini gecip gecmedigi karari UYGULAMADADIR — SQL'e gomulmez ki
 * config'ten degistirilebilsin."
 *
 * Saat henuz gelmediyse BUGUNUN raporu vadesiz sayilir ve yalnizca DUNE kadarki
 * kayitlar alinir. Aksi halde worker, gun daha bitmeden "gunluk" rapor
 * uretirdi — sabah 06:00'da uretilen rapor, o gunun tamamini degil ilk
 * saatlerini ozetlerdi.
 * ============================================================================
 */
export function dueDate(now: Date, hourUtc: number): string {
  const due = new Date(now.getTime());

  if (now.getUTCHours() < hourUtc) {
    due.setUTCDate(due.getUTCDate() - 1);
  }

  return due.toISOString().slice(0, 10);
}
