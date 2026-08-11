import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type Category, type FinanceDirection } from '../domain/category.entity';
import {
  ArchivedCategoryError,
  CategoryDirectionMismatchError,
  TransactionCategoryNotFoundError,
  TransactionNotFoundError,
} from '../domain/finance.error';
import {
  FinanceTransaction,
  type TransactionFields,
  type TransactionPatch,
  type TransactionState,
} from '../domain/transaction.entity';
import { type CategoryRepository, type ListPage } from './category.repository.port';
import { type TransactionListRow, type TransactionRepository } from './transaction.repository.port';

/**
 * Islem yasam dongusu (ADR-0034 §2, §3c).
 *
 * ============================================================================
 * BU DOSYANIN GERCEKTEN YENI ISI: KATEGORI ESLEŞMESI
 * ============================================================================
 * CRUD'un kendisi `CategoryUseCases`/`ProjectUseCases` ile ayni. Yeni olan tek
 * sey `#assertCategoryUsable`: bir islem bir kategoriye baglanacaksa kategori
 * (a) VAR olmali, (b) ARSIVLENMEMIS olmali, (c) YONU islemin yonuyle
 * UYUSMALIDIR.
 *
 * ⚠️ (c)'yi veritabani ZATEN imkansiz kiliyor (`0024`'un bilesik FK'si). Burada
 * tekrar kontrol edilmesinin sebebi GARANTI degil MESAJDIR: PostgreSQL'in FK
 * hatasi kriptiktir ve kullaniciya ne yaptigini soylemez. Yani dogru mesaji
 * uygulama uretir, GARANTIYI veritabani verir; ikisinden biri kaldirilirsa ya
 * mesaj anlasilmaz olur ya da uygulamayi atlayan bir yol sessizce bozuk veri
 * yazar.
 */
export interface TransactionDependencies {
  readonly repository: TransactionRepository;
  readonly categoryRepository: CategoryRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class TransactionUseCases {
  constructor(private readonly deps: TransactionDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    fields: TransactionFields;
  }): Promise<TransactionState> {
    // Entity ONCE kurulur: tutar/para birimi/tarih dogrulamasi bir veritabani
    // sorgusu ACMADAN once patlar. Gecersiz bir tutar icin kategori sorgusu
    // atmak, bos yere bir gidis-donus olurdu.
    const transaction = FinanceTransaction.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    const state = transaction.toState();

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#assertCategoryUsable(state.categoryId, state.direction, { forNewLink: true });
      await this.deps.repository.save(transaction);
    });

    return state;
  }

  async list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    categoryId: string | null;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<TransactionListRow>> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );
  }

  async get(id: string): Promise<TransactionState> {
    const transaction = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (transaction === null) {
      throw new TransactionNotFoundError();
    }

    return transaction.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * ⚠️ Kategori kontrolu, ISTEKTEKI degil BIRLESMIS duruma gore yapilir. Sebep:
   * kullanici yalnizca `direction`'i degistirebilir ve kategoriye hic
   * dokunmayabilir — ama o degisiklik MEVCUT kategoriyi gecersiz kilar. Yalnizca
   * "kategori gonderildiyse kontrol et" deseydik, bu yol veritabaninin kriptik
   * FK hatasina duserdi.
   *
   * Kontrol ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`'te son yazan kazanir (bilinen sinir).
   */
  async update(input: { id: string; changes: TransactionPatch }): Promise<TransactionState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new TransactionNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      const next = updated.toState();

      // ⚠️ `forNewLink` YALNIZCA kategori GERCEKTEN DEGISTIYSE true. Aksi halde
      // arsivlenmis bir kategoriye bagli eski bir kaydin tutarini duzeltmek
      // IMKANSIZ olurdu — arsivleme gecmisi dondurmak icin degil, YENI
      // secimleri engellemek icin var (ADR-0034 §3e).
      await this.#assertCategoryUsable(next.categoryId, next.direction, {
        forNewLink: next.categoryId !== existing.toState().categoryId,
      });

      await this.deps.repository.save(updated);
      return next;
    });
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new TransactionNotFoundError();
    }
  }

  /**
   * Kategori bu islem icin kullanilabilir mi (ADR-0034 §3c, §3e).
   *
   * `null` gecerlidir ve kontrol edilmez: kategorisiz kayit mesrudur.
   *
   * ⚠️ "Kategori yok" ile "baska tenant'in" AYIRT EDILMEZ — RLS ikincisini
   * zaten gorunmez kilar ve repository `null` doner. Ayirmak, bir id'nin baska
   * bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
   */
  async #assertCategoryUsable(
    categoryId: string | null,
    direction: FinanceDirection,
    options: { forNewLink: boolean },
  ): Promise<void> {
    if (categoryId === null) {
      return;
    }

    const category = await this.deps.categoryRepository.findById(categoryId);
    if (category === null) {
      throw new TransactionCategoryNotFoundError();
    }

    const state: ReturnType<Category['toState']> = category.toState();

    if (options.forNewLink && state.isArchived) {
      throw new ArchivedCategoryError();
    }

    if (state.direction !== direction) {
      throw new CategoryDirectionMismatchError();
    }
  }
}
