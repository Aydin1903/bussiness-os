import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  Company,
  type CompanyFields,
  type CompanyPatch,
  type CompanyState,
} from '../domain/company.entity';
import { CompanyNotFoundError } from '../domain/crm.error';
import { type CompanyRepository, type ListPage } from './company.repository.port';

/**
 * Sirket yasam dongusu (ADR-0031 §1).
 *
 * ============================================================================
 * DORT USE CASE TEK DOSYADA — Knowledge'dan SAPMA, gerekcesiyle
 * ============================================================================
 * Knowledge her use case'i ayri dosyaya koydu cunku her biri FARKLI bir akis:
 * `CreateNote` embedding cagirir, `AskKnowledge` iki ag cagrisi yapar,
 * `ReindexNotes` toplu onarim yurutur. Aralarinda paylasilan tek sey yoktu.
 *
 * Burada dordu de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction
 * sinirlari, ayni "bulunamadi -> 404" kurali. Dort dosyaya bolmek, her birinde
 * ayni uc satirlik bagimlilik blogunu tekrarlamak olurdu.
 *
 * ⚠️ Bu sapma AI ya da coklu-adim bir akis eklendiginde YENIDEN DEGERLENDIRILIR
 * (Slice 6'da `interactions` embedding uretecek ve KENDI dosyasini alacak).
 * ============================================================================
 */
export interface CompanyDependencies {
  readonly repository: CompanyRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class CompanyUseCases {
  constructor(private readonly deps: CompanyDependencies) {}

  async create(input: { tenantId: string; fields: CompanyFields }): Promise<CompanyState> {
    const company = Company.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(company),
    );

    return company.toState();
  }

  async list(input: { limit: number; offset: number }): Promise<ListPage<CompanyState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((company) => company.toState()), total: page.total };
  }

  async get(id: string): Promise<CompanyState> {
    const company = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (company === null) {
      throw new CompanyNotFoundError();
    }

    return company.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * Okuma ve yazma AYNI transaction'dadir: arada baska bir istek satiri
   * degistirirse en azindan tutarli bir taban uzerinde calisilmis olur.
   * ⚠️ Bu bir KILIT DEGILDIR — es zamanli iki `PATCH`'te son yazan kazanir
   * (bilinen sinir, bkz. `Company` sinif yorumu).
   */
  async update(input: { id: string; changes: CompanyPatch }): Promise<CompanyState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new CompanyNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
  }

  /**
   * SERT silme; kisiler `ON DELETE CASCADE` ile birlikte gider (ADR-0031 §7).
   *
   * Silinen satir sayisi `0` ise kayit yoktur YA DA baska tenant'indir — ikisi
   * ayirt EDILMEZ (bkz. `CompanyNotFoundError`).
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new CompanyNotFoundError();
    }
  }
}
