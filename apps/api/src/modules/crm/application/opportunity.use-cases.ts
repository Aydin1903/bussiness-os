import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  OpportunityCompanyNotFoundError,
  OpportunityContactNotFoundError,
  OpportunityNotFoundError,
} from '../domain/crm.error';
import {
  Opportunity,
  type OpportunityFields,
  type OpportunityPatch,
  type OpportunityStage,
  type OpportunityState,
} from '../domain/opportunity.entity';
import { type CompanyRepository, type ListPage } from './company.repository.port';
import { type ContactRepository } from './contact.repository.port';
import { type FollowUpRow, type OpportunityRepository } from './opportunity.repository.port';

/** Firsat yasam dongusu. Dosya birlestirme gerekcesi: bkz. `CompanyUseCases`. */
export interface OpportunityDependencies {
  readonly repository: OpportunityRepository;
  readonly companyRepository: CompanyRepository;
  readonly contactRepository: ContactRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class OpportunityUseCases {
  constructor(private readonly deps: OpportunityDependencies) {}

  /**
   * Firsat olusturur.
   *
   * Sirketin (ve verildiyse kisinin) VARLIGI once dogrulanir — FK ihlaline
   * birakmak istemciye 500 dondururdu. RLS sayesinde BASKA tenant'in kaydi da
   * "bulunamadi" sayilir; varligi sizmaz.
   */
  async create(input: {
    tenantId: string;
    companyId: string;
    fields: OpportunityFields;
  }): Promise<OpportunityState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#assertRelations(input.companyId, input.fields.contactId);

      const opportunity = Opportunity.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        companyId: input.companyId,
        fields: input.fields,
        now: this.deps.clock.now(),
      });

      await this.deps.repository.save(opportunity);
      return opportunity.toState();
    });
  }

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    stage: OpportunityStage | null;
  }): Promise<ListPage<OpportunityState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((item) => item.toState()), total: page.total };
  }

  async get(id: string): Promise<OpportunityState> {
    const opportunity = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (opportunity === null) {
      throw new OpportunityNotFoundError();
    }

    return opportunity.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * Asama gecisleri SERBESTTIR (bkz. `Opportunity` sinif yorumu) ve
   * `stageChangedAt` yalnizca gercek degisimde ilerler — o karar entity'de,
   * tek yerde verilir.
   */
  async update(input: { id: string; changes: OpportunityPatch }): Promise<OpportunityState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new OpportunityNotFoundError();
      }

      if (input.changes.contactId != null) {
        await this.#assertContact(input.changes.contactId);
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new OpportunityNotFoundError();
    }
  }

  /** Takipler gorunumu — TURETILMIS sorgu, tablo YOK (ADR-0031 §3). */
  async listFollowUps(input: { limit: number; offset: number }): Promise<ListPage<FollowUpRow>> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listFollowUps(input),
    );
  }

  async #assertRelations(companyId: string, contactId: string | null): Promise<void> {
    const company = await this.deps.companyRepository.findById(companyId);
    if (company === null) {
      throw new OpportunityCompanyNotFoundError();
    }

    if (contactId !== null) {
      await this.#assertContact(contactId);
    }
  }

  async #assertContact(contactId: string): Promise<void> {
    const contact = await this.deps.contactRepository.findById(contactId);
    if (contact === null) {
      throw new OpportunityContactNotFoundError();
    }
  }
}
