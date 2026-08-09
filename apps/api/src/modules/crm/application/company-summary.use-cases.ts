import { type Clock } from '../../../shared/clock.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { CompletionFailedError, type LLMPort } from '../../../shared/llm.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { CRM_GENERATE_COMPANY_SUMMARY_ACTION } from '../crm.rate-limits';
import { CLAIM_STALE_AFTER_MS, isStale, sourceWatermarkOf } from '../domain/company-summary.entity';
import {
  CompanyNotFoundError,
  NoInteractionsToSummarizeError,
  SummaryGenerationInProgressError,
} from '../domain/crm.error';
import {
  buildSummaryContext,
  COMPANY_SUMMARY_SYSTEM_PROMPT,
  COMPANY_SUMMARY_USER_MESSAGE,
} from './company-summary-prompt';
import {
  type CompanySummaryRepository,
  type StoredCompanySummary,
} from './company-summary.repository.port';

export interface CompanySummaryDependencies {
  readonly repository: CompanySummaryRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly llmPort: LLMPort;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
  /** Saatlik ozet uretme payi. */
  readonly rateLimit: number;
  /** Ozete girecek EN FAZLA gorusme sayisi — token tavaninin birinci freni. */
  readonly contextInteractionLimit: number;
  /** Tek bir gorusmeden alinacak EN FAZLA karakter — ikinci fren. */
  readonly contextCharsPerInteraction: number;
}

export interface CompanySummaryView {
  readonly summary: string | null;
  readonly generatedAt: string | null;
  /** Saklanan ozet bugunku kaynaklarla uyumsuz mu. Ozet yoksa `false`. */
  readonly stale: boolean;
  /** Su anda baska bir istek uretiyor mu. */
  readonly generating: boolean;
  /** Ozetlenecek gorusme var mi — arayuz "uret" dugmesini buna gore acar. */
  readonly summarizable: boolean;
}

export interface GenerateSummaryResult extends CompanySummaryView {
  /**
   * Model GERCEKTEN cagrildi mi.
   *
   * `false` ise israf freni devreye girdi: watermark degismemisti ve mevcut
   * ozet donduruldu. Arayuz bunu kullaniciya "zaten guncel" diye soyler —
   * yoksa "yenile"ye basip hicbir sey degismemesi bir hata gibi gorunurdu.
   */
  readonly regenerated: boolean;
}

/**
 * Musteri ozeti — CRM'in AI ile IKINCI temasi (ADR-0032).
 *
 * ============================================================================
 * ISTEK-TETIKLEMELI ONBELLEK, WORKER DEGIL
 * ============================================================================
 * ADR-0030'un gunluk raporu bir worker'dir cunku is ZAMANA baglidir (her gun,
 * kimse istemese de). Burada is TALEBE baglidir: ozet, birisi o musteriye
 * bakarken lazimdir. Worker kurmak, hicbir zaman acilmayacak musteri
 * sayfalari icin her gece para harcamak olurdu.
 *
 * Bunun mimari sonucu buyuk: worker olmadigi icin BYPASSRLS rolu, `SECURITY
 * DEFINER` fonksiyon ve zamanlayici YOK. Migration `0012` bunlarin hepsini
 * getirmisti; `0019` tek bir tablodur.
 *
 * ============================================================================
 * UC FREN, UCU DE FARKLI BIR ISRAFI KESER
 * ============================================================================
 *   1. ORAN SINIRI (T0)     -> saatte kac kez uretilebilecegi
 *   2. ISRAF FRENI          -> kaynaklar degismediyse model HIC cagrilmaz
 *   3. BAGLAM TAVANI        -> tek cagrida kac token harcanacagi
 *
 * Ucu birbirinin yerine gecmez: oran siniri istek SAYISINI baglar (ADR-0029
 * §5'in bilinen siniri — token harcamasini degil), israf freni GEREKSIZ
 * cagriyi keser, baglam tavani ise GEREKLI cagrinin buyuklugunu.
 *
 * ============================================================================
 * TRANSACTION SIRASI — ag cagrisi hicbirinin icinde degil
 * ============================================================================
 *   T0  oran siniri sayaci      -> kendi transaction'i, commit
 *   T1  kaynaklar + claim       -> transaction
 *   LLM cagrisi                 -> AG · transaction YOK
 *   T2  ozeti yaz, claim'i birak-> transaction
 *
 * `InteractionUseCases` ile birebir ayni desen ve ayni gerekce: pahali bir ag
 * cagrisi boyunca veritabani baglantisi TUTULMAZ.
 */
export class CompanySummaryUseCases {
  constructor(private readonly deps: CompanySummaryDependencies) {}

  /**
   * Onbellekten okur. ASLA model cagirmaz, oran sinirina TABI DEGILDIR.
   *
   * Sayfa her acildiginda calisir; ucretli olsaydi musteri sayfasina bakmak
   * para harcamak olurdu ve kullanici bakmaktan kacinirdi — yani ozelligin
   * kendisi kullanilmaz hale gelirdi.
   */
  async get(companyId: string): Promise<CompanySummaryView> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const identity = await this.deps.repository.findCompanyIdentity(companyId);
      if (identity === null) {
        // RLS sayesinde BASKA tenant'in sirketi de "bulunamadi" sayilir.
        throw new CompanyNotFoundError();
      }

      const [stored, facts] = await Promise.all([
        this.deps.repository.find(companyId),
        this.deps.repository.collectSourceFacts(companyId),
      ]);

      return this.#view({
        stored,
        currentWatermark: sourceWatermarkOf(facts),
        summarizable: facts.interactionCount > 0,
        now: this.deps.clock.now(),
      });
    });
  }

  async generate(input: {
    tenantId: string;
    userId: string;
    companyId: string;
  }): Promise<GenerateSummaryResult> {
    // --- T0 ------------------------------------------------------------------
    // Modelden ONCE: reddedilecek bir istek TEK KURUS harcamamali.
    await enforceRateLimit(this.deps, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: CRM_GENERATE_COMPANY_SUMMARY_ACTION,
      limit: this.deps.rateLimit,
    });

    const now = this.deps.clock.now();

    // --- T1: kaynaklar, israf freni, claim -----------------------------------
    // T1 iki sonuctan BIRINI dondurur ve ayrim tipte gorunur: ya is bitmistir
    // (israf freni), ya da yapilacak is vardir. Optional alanlarla tek bir
    // nesne dondurmek, cagiranin "hangisi dolu" diye tahmin etmesini gerektirir.
    type Prepared =
      | { readonly kind: 'cached'; readonly view: CompanySummaryView }
      | {
          readonly kind: 'work';
          readonly identity: { name: string; industry: string | null };
          readonly watermark: string;
          readonly interactions: readonly { occurredOn: string; body: string }[];
          readonly openOpportunities: readonly {
            title: string;
            stage: string;
            estimatedValue: string | null;
          }[];
        };

    const prepared: Prepared = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const identity = await this.deps.repository.findCompanyIdentity(input.companyId);
        if (identity === null) {
          throw new CompanyNotFoundError();
        }

        const facts = await this.deps.repository.collectSourceFacts(input.companyId);
        if (facts.interactionCount === 0) {
          // Model CAGRILMAZ, satir bile ACILMAZ.
          throw new NoInteractionsToSummarizeError();
        }

        const watermark = sourceWatermarkOf(facts);
        const stored = await this.deps.repository.find(input.companyId);

        // --- ISRAF FRENI ---
        // Kaynaklar degismemis ve elde uretilmis bir ozet varsa is YOKTUR.
        if (stored?.generatedAt != null && stored.sourceWatermark === watermark) {
          return {
            kind: 'cached',
            view: this.#view({ stored, currentWatermark: watermark, summarizable: true, now }),
          };
        }

        const claimed = await this.deps.repository.claim({
          companyId: input.companyId,
          tenantId: input.tenantId,
          staleBefore: new Date(now.getTime() - CLAIM_STALE_AFTER_MS),
          now,
        });
        if (!claimed) {
          throw new SummaryGenerationInProgressError();
        }

        const [interactions, openOpportunities] = await Promise.all([
          this.deps.repository.recentInteractions({
            companyId: input.companyId,
            limit: this.deps.contextInteractionLimit,
          }),
          this.deps.repository.openOpportunities(input.companyId),
        ]);

        return { kind: 'work', identity, watermark, interactions, openOpportunities };
      },
    );

    if (prepared.kind === 'cached') {
      return { ...prepared.view, regenerated: false };
    }

    const work = prepared;

    // --- Ag · transaction YOK ------------------------------------------------
    let summary: string;
    try {
      summary = await this.deps.llmPort.complete({
        systemPrompt: COMPANY_SUMMARY_SYSTEM_PROMPT,
        userMessage: COMPANY_SUMMARY_USER_MESSAGE,
        context: buildSummaryContext({
          companyName: work.identity.name,
          industry: work.identity.industry,
          openOpportunities: work.openOpportunities,
          interactions: work.interactions.map((interaction) => ({
            occurredOn: interaction.occurredOn,
            body: this.#truncate(interaction.body),
          })),
        }),
      });
    } catch (error: unknown) {
      // Claim BIRAKILIR. Birakilmasaydi coken bir istek satiri iki dakika
      // kilitli birakirdi ve kullanici "tekrar dene" dedigunde 409 alirdi:
      // hatanin ustune ikinci bir hata.
      await this.#releaseQuietly(input.companyId);
      throw error;
    }

    const trimmed = summary.trim();
    if (trimmed === '') {
      // Bos metni YAZMAYIZ: `company_summaries_summary_when_generated`
      // kisiti zaten reddederdi, ama hata orada 500 olarak cikardi.
      // Burada 502 olur ve dogru seyi soyler: saglayici cevap veremedi.
      await this.#releaseQuietly(input.companyId);
      throw new CompletionFailedError('model bos cevap dondurdu');
    }

    // --- T2 ------------------------------------------------------------------
    const completedAt = this.deps.clock.now();
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.repository.complete({
        companyId: input.companyId,
        summary: trimmed,
        sourceWatermark: work.watermark,
        now: completedAt,
      });
    });

    return {
      summary: trimmed,
      generatedAt: completedAt.toISOString(),
      // Az once bu watermark ile uretildi: tanimi geregi taze.
      stale: false,
      generating: false,
      summarizable: true,
      regenerated: true,
    };
  }

  #view(input: {
    stored: StoredCompanySummary | null;
    currentWatermark: string;
    summarizable: boolean;
    now: Date;
  }): CompanySummaryView {
    const stored = input.stored;

    if (stored === null) {
      return {
        summary: null,
        generatedAt: null,
        stale: false,
        generating: false,
        summarizable: input.summarizable,
      };
    }

    const claimFresh =
      stored.generatingAt !== null &&
      input.now.getTime() - stored.generatingAt.getTime() < CLAIM_STALE_AFTER_MS;

    return {
      summary: stored.summary,
      generatedAt: stored.generatedAt?.toISOString() ?? null,
      stale: isStale({
        storedWatermark: stored.sourceWatermark,
        generatedAt: stored.generatedAt,
        currentWatermark: input.currentWatermark,
      }),
      generating: claimFresh,
      summarizable: input.summarizable,
    };
  }

  /** Bir gorusme metnini baglam tavanina sigdirir. */
  #truncate(body: string): string {
    const limit = this.deps.contextCharsPerInteraction;
    return body.length <= limit ? body : `${body.slice(0, limit)}…`;
  }

  /**
   * Claim'i birakir; birakma HATASI yutulur.
   *
   * Bu yol zaten bir hata yolundadir. Birakma da coktugunde ASIL hatayi
   * ikincil bir hatayla degistirmek, kullaniciya yanlis sebebi gostermek
   * olurdu — claim iki dakika sonra zaten kendiliginden bayatlar.
   */
  async #releaseQuietly(companyId: string): Promise<void> {
    try {
      await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
        await this.deps.repository.releaseClaim(companyId);
      });
    } catch {
      // Bilincli olarak yutulur — yukaridaki gerekce.
    }
  }
}
