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
}
