import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type CompanyDirectory } from '../../crm/crm.public';
import {
  Campaign,
  assertEmbeddingDimensions,
  touchesEmbeddedFields,
  withCampaignHeader,
  type CampaignChanges,
  type CampaignState,
  type CampaignStatus,
} from '../domain/campaign.entity';
import { CampaignCompanyNotFoundError, CampaignNotFoundError } from '../domain/marketing.error';
import { MARKETING_EMBEDDING_ACTION } from '../marketing.rate-limits';
import {
  type CampaignSummaryRow,
  type ListPage,
  type MarketingRepository,
  type UnindexedCampaign,
} from './marketing.repository.port';

/**
 * ⚠️ Ad KOLONDA SAKLANMAZ, her okumada CRM'den cozulur (ADR-0047 §6.1).
 *
 * Kopyalansaydi sirket yeniden adlandirildiginda kampanya listesi eski adi
 * gostermeye devam ederdi. ADR-0041'in `customer_name` istisnasi burada
 * GECERLI DEGILDIR: orada ad GONDERILMIS BIR BELGEDE donmustu; burada
 * dondurulmus bir sey yok.
 */
export interface CampaignRow extends CampaignState {
  readonly companyName: string | null;
}

/** Duvarin baktigi pencere — ekranin "son N gun" metni SUNUCUDAN gelir. */
export const SUMMARY_WINDOW_DAYS = 30;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CampaignSummary extends CampaignSummaryRow {
  readonly windowDays: number;
}

export interface MarketingDependencies {
  readonly repository: MarketingRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly companyDirectory: CompanyDirectory;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly rateLimit: number;
  readonly reindexBatchSize: number;
}

export class MarketingUseCases {
  constructor(private readonly deps: MarketingDependencies) {}

  async createCampaign(input: {
    tenantId: string;
    userId: string;
    role: string;
    name: string;
    channel: string | null;
    startsOn: string;
    endsOn: string | null;
    status: string;
    resultNote: string | null;
    crmCompanyId: string | null;
  }): Promise<CampaignRow> {
    const campaign = Campaign.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      name: input.name,
      channel: input.channel,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      status: input.status,
      resultNote: input.resultNote,
      crmCompanyId: input.crmCompanyId,
      now: this.deps.clock.now(),
    });

    const state = campaign.toState();
    await this.#assertCompanyVisible(state.crmCompanyId, input.role);

    const content = campaign.embeddableContent();
    // ⚠️ SONUC NOTSUZ kayit saglayiciya HIC GITMEZ ve sayaci da TUKETMEZ (§8).
    if (content !== null) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.insertCampaign(campaign),
    );

    // ⚠️ Embedding transaction'in DISINDA: saglayici cokerse KAYIT SILINMEZ
    // (ADR-0035'in karari) — 502 doner, `reindex` ile onarilir.
    if (content !== null) {
      await this.#embed(state.id, content);
    }

    return this.#withCompanyName(state, input.role);
  }

  /**
   * ⚠️ HER DURUMDA GUNCELLENEBILIR — `done` DAHIL (ADR-0047 §2.2).
   *
   * ============================================================================
   * ⚠️ YENIDEN GOMME KOSULLUDUR — VE BASARISIZLIGI VEKTORU `NULL`'A CEKER
   * ============================================================================
   * Yalnizca GOMULEN BIR ALAN degistiyse yeniden gomulur (§4.2). Durum gecisi
   * (`draft→active→done`) her kampanyada en az iki `PATCH` demektir ve hicbiri
   * metni degistirmez — kosulsuz gomme, para harcayan ama HICBIR SEY
   * DEGISTIRMEYEN cagrilar uretirdi.
   *
   * ⚠️ Gomme cokerse satir KAYDEDILMIS KALIR ama `embedding` `NULL`'A CEKILIR
   * (§4.2.1). Gerekce hatanin seklidir: bayat bir vektor DOLU gorunur,
   * `reindex`in `NULL` arayan sorgusu onu BULAMAZ ve `/ask` ESKI ICERIKLE
   * cevap verir — hata SESSIZDIR. `NULL` ise GORUNUR.
   */
  async updateCampaign(input: {
    tenantId: string;
    userId: string;
    role: string;
    id: string;
    changes: CampaignChanges;
  }): Promise<CampaignRow> {
    await this.#assertCompanyVisible(input.changes.crmCompanyId ?? null, input.role);

    const updated = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const found = await this.deps.repository.findCampaignById(input.id);
      if (found === null) {
        throw new CampaignNotFoundError();
      }

      const next = found.update(input.changes, this.deps.clock.now());
      const changed = await this.deps.repository.updateCampaign(next);
      if (changed === 0) {
        throw new CampaignNotFoundError();
      }
      return next;
    });

    const state = updated.toState();

    if (touchesEmbeddedFields(input.changes)) {
      await this.#reembed(input.tenantId, input.userId, state.id, updated.embeddableContent());
    }

    return this.#withCompanyName(state, input.role);
  }

  /**
   * ⚠️ BIR KATKICI DEGILDIR (ADR-0047 §9.1).
   *
   * `missingResultCount`, `campaign-gap` katkicisinin saydigi AYNI kumedir —
   * ama bu sayi yalnizca EKRANA gider: havuza girmez, taban yuvasi tuketmez,
   * T2'yi etkilemez. ⚠️ ADR-0045'in kapanis denetimi bu ayrimi SONRADAN
   * kesfetmek zorunda kalmisti; burada ONCEDEN yaziya geciyor.
   */
  async getSummary(): Promise<CampaignSummary> {
    const now = this.deps.clock.now();
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * MILLISECONDS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.summarize({ today, since }),
    );

    return { ...row, windowDays: SUMMARY_WINDOW_DAYS };
  }

  async listCampaigns(input: {
    limit: number;
    offset: number;
    status: CampaignStatus | null;
    role: string;
  }): Promise<ListPage<CampaignRow>> {
    const { role, ...query } = input;

    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listCampaigns(query),
    );

    const states = page.items.map((item) => item.toState());
    return { items: await this.#withCompanyNames(states, role), total: page.total };
  }

  async getCampaign(input: { id: string; role: string }): Promise<CampaignRow> {
    const state = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const found = await this.deps.repository.findCampaignById(input.id);
      if (found === null) {
        throw new CampaignNotFoundError();
      }
      return found.toState();
    });

    return this.#withCompanyName(state, input.role);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const deleted = await this.deps.repository.deleteCampaignById(id);
      if (deleted === 0) {
        throw new CampaignNotFoundError();
      }
    });
  }

  /**
   * ⚠️ ISI IKI KATLIDIR ve ADR-0045'ten FARKLIDIR (§8):
   *   a) ilk gomme sirasinda basarisiz olan kayitlar,
   *   b) ⚠️ `PATCH` sirasinda `NULL`'a cekilenler (§4.2.1).
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ repaired: number; failed: number }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexedCampaigns(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await this.#embed(item.id, toEmbeddableContent(item));
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  /**
   * Gomulen alan degistiginde vektoru tazeler.
   *
   * ⚠️ Icerik `null` olduysa (sonuc notu SILINDIYSE) vektor de SILINIR: aksi
   * halde artik var olmayan bir metnin vektoru aramada yasamaya devam ederdi.
   */
  async #reembed(
    tenantId: string,
    userId: string,
    id: string,
    content: string | null,
  ): Promise<void> {
    if (content === null) {
      await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
        this.deps.repository.clearCampaignEmbedding(id),
      );
      return;
    }

    await this.#enforceEmbeddingBudget(tenantId, userId);

    try {
      await this.#embed(id, content);
    } catch (error) {
      // ⚠️ §4.2.1 — BAYAT VEKTOR BIRAKILMAZ. Once temizle, sonra hatayi
      // yukari birak: kullanici 502 gorur, kayit durur, `reindex` onarir.
      await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
        this.deps.repository.clearCampaignEmbedding(id),
      );
      throw error;
    }
  }

  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: MARKETING_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  async #embed(id: string, content: string): Promise<void> {
    const embedding = await this.#callEmbedding(content);
    assertEmbeddingDimensions(embedding);

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.setCampaignEmbedding({ id, embedding }),
    );
  }

  async #callEmbedding(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * ⚠️ Okuma `company:read` IZNINE BAGLIDIR ve kapi dizinin ICINDEDIR
   * (ADR-0033 §2c). Izinsiz bir rol icin ad `null` doner — kampanya modulu
   * CRM adlarini sizdiran bir YAN KAPI olamaz.
   */
  async #assertCompanyVisible(crmCompanyId: string | null, role: string): Promise<void> {
    if (crmCompanyId === null) {
      return;
    }

    const names = await this.deps.companyDirectory.findNames({ ids: [crmCompanyId], role });
    if (!names.has(crmCompanyId)) {
      throw new CampaignCompanyNotFoundError();
    }
  }

  async #withCompanyName(state: CampaignState, role: string): Promise<CampaignRow> {
    const [row] = await this.#withCompanyNames([state], role);
    return row ?? { ...state, companyName: null };
  }

  async #withCompanyNames(states: readonly CampaignState[], role: string): Promise<CampaignRow[]> {
    const ids = [
      ...new Set(
        states.map((state) => state.crmCompanyId).filter((id): id is string => id !== null),
      ),
    ];

    // ⚠️ TOPLU cagri — sayfadaki N kampanya icin N+1 sorgu ACILMAZ.
    const names =
      ids.length === 0 ? new Map<string, string>() : await this.#resolveNames(ids, role);

    return states.map((state) => ({
      ...state,
      // ⚠️ Sarkan `crm_company_id` TOLERE EDILIR (BESINCI sarkan isaretci):
      // silinen sirketin id'si satirda kalir ve ad `null` doner — ekran
      // patlamaz.
      companyName: state.crmCompanyId === null ? null : (names.get(state.crmCompanyId) ?? null),
    }));
  }

  async #resolveNames(ids: readonly string[], role: string): Promise<ReadonlyMap<string, string>> {
    return this.deps.companyDirectory.findNames({ ids, role });
  }
}

function toEmbeddableContent(item: UnindexedCampaign): string {
  return withCampaignHeader({
    name: item.name,
    channel: item.channel,
    startsOn: item.startsOn,
    endsOn: item.endsOn,
    resultNote: item.resultNote,
  });
}
