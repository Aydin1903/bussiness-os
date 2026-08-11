import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  Category,
  type CategoryFields,
  type CategoryPatch,
  type CategoryState,
  type FinanceDirection,
} from '../domain/category.entity';
import { CategoryNotFoundError } from '../domain/finance.error';
import { type CategoryRepository, type ListPage } from './category.repository.port';

/**
 * Kategori yasam dongusu (ADR-0034 §3).
 *
 * ============================================================================
 * BES USE CASE TEK DOSYADA — `ProjectUseCases` / `CompanyUseCases` ile ayni
 * ============================================================================
 * Besi de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction sinirlari,
 * ayni "bulunamadi -> 404" kurali.
 *
 * ============================================================================
 * BURADA CROSS-MODUL OKUMA YOK
 * ============================================================================
 * `ProjectUseCases` `CompanyDirectory`'yi tasiyor; bu dosya hicbir modulu
 * bilmiyor. Finans'in cross-modul referanslari (`companyId` / `projectId`)
 * ISLEM kaydindadir (§4) ve Slice 3'te yazilir — kategori tumuyle modul icidir.
 */
export interface CategoryDependencies {
  readonly repository: CategoryRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class CategoryUseCases {
  constructor(private readonly deps: CategoryDependencies) {}

  async create(input: { tenantId: string; fields: CategoryFields }): Promise<CategoryState> {
    const category = Category.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(category),
    );

    return category.toState();
  }

  async list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    includeArchived: boolean;
  }): Promise<ListPage<CategoryState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((category) => category.toState()), total: page.total };
  }

  async get(id: string): Promise<CategoryState> {
    const category = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (category === null) {
      throw new CategoryNotFoundError();
    }

    return category.toState();
  }

  /**
   * KISMI guncelleme — ad ve ARSIV durumu.
   *
   * ⚠️ `direction` BURADAN GECMEZ: entity onu `update()` imzasinda hic kabul
   * etmiyor (gerekce `Category` sinif yorumunda). Yani "yonu degistirme"
   * istegi tip seviyesinde imkansizdir, calisma zamaninda reddedilen bir sey
   * degil.
   *
   * Okuma ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`'te son yazan kazanir (bilinen sinir).
   */
  async update(input: { id: string; changes: CategoryPatch }): Promise<CategoryState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new CategoryNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
  }

  /**
   * SERT silme.
   *
   * ⚠️ Slice 2'den itibaren KULLANIMDAKI bir kategori silinemez: repository FK
   * ihlalini `CategoryInUseError`'a cevirir ve filtre onu 409'a tasir. Dogru
   * eylem o zaman ARSIVLEMEKTIR (`PATCH { isArchived: true }`) — silmek gecen
   * ayin raporunu bugun baska bir sey soyler hale getirirdi (ADR-0034 §3e).
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new CategoryNotFoundError();
    }
  }
}
