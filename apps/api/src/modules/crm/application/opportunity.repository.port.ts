import { type Opportunity, type OpportunityStage } from '../domain/opportunity.entity';
import { type ListPage } from './company.repository.port';

export const OPPORTUNITY_REPOSITORY = Symbol('OPPORTUNITY_REPOSITORY');

/** Takipler gorunumunun tek satiri — firsat ENTITY'si DEGIL, bir projeksiyon. */
export interface FollowUpRow {
  readonly opportunityId: string;
  readonly title: string;
  readonly stage: OpportunityStage;
  readonly companyId: string;
  readonly nextFollowUpOn: string;
}

/**
 * Yapisal katkinin tek satiri (ADR-0031 §5.4).
 *
 * Bir firsatin AI'a anlatilacak hali; entity DEGIL, bir PROJEKSIYON.
 */
export interface PipelineRow {
  readonly opportunityId: string;
  readonly companyName: string;
  readonly title: string;
  readonly stage: OpportunityStage;
  readonly estimatedValue: string | null;
  readonly currency: string | null;
  readonly stageChangedAt: Date;
  readonly nextFollowUpOn: string | null;
}

/**
 * `crm.opportunities` kaliciligi. Tenant daraltmasi RLS'in isidir
 * (bkz. `CompanyRepository`).
 */
export interface OpportunityRepository {
  save(opportunity: Opportunity): Promise<void>;
  findById(id: string): Promise<Opportunity | null>;
  list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    stage: OpportunityStage | null;
  }): Promise<ListPage<Opportunity>>;
  deleteById(id: string): Promise<number>;

  /**
   * TAKIPLER GORUNUMU — TURETILMIS, ayri bir tablo YOKTUR (ADR-0031 §3).
   *
   * Turetilebilir bir bilgiyi kaliciya yazmak ikinci bir dogruluk kaynagi
   * yaratir ve iki kaynak zamanla birbirini yalanlar (`daily_report_runs`ta
   * `status` kolonunun reddi, ADR-0030 §2.1 — ayni karar).
   *
   * GECIKMIS takipler DAHILDIR: en onemlileri onlardir. "Gecikmis" isaretini
   * istemci koyar; sunucu yalnizca kronolojik siralar.
   *
   * KAPANAN firsat listeden KENDILIGINDEN duser — elle silme isi yoktur.
   */
  listFollowUps(input: { limit: number; offset: number }): Promise<ListPage<FollowUpRow>>;

  /**
   * YAPISAL katki icin acik firsat anlik goruntusu (ADR-0031 §5.4).
   *
   * ============================================================================
   * SIRALAMA: ONCE GECIKMIS TAKIPLER, SONRA DEGER
   * ============================================================================
   * "Hangi anlasmalar takipte gecikti" sorusunun cevabi bir gorusme notunda
   * YAZMAZ; `next_follow_up_on` kolonunda yazar. Yalnizca anlatisal veriyi
   * gomseydik model bu soruyu bayat toplanti notlarindan TAHMIN EDEREK
   * cevaplardi — ve kendinden emin sekilde yanilirdi.
   *
   * KAPANMIS firsatlar (`won`/`lost`) DISLANIR: kapanmis bir anlasma
   * "yapilacak is" degildir.
   * ============================================================================
   */
  listOpenPipeline(input: { limit: number }): Promise<PipelineRow[]>;
}
