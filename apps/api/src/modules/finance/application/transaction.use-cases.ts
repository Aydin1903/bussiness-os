import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type CompanyDirectory } from '../../crm/crm.public';
import { type ProjectDirectory } from '../../projects/projects.public';
import { type Category, type FinanceDirection } from '../domain/category.entity';
import {
  ArchivedCategoryError,
  CategoryDirectionMismatchError,
  TransactionCategoryNotFoundError,
  TransactionCompanyNotFoundError,
  TransactionNotFoundError,
  TransactionProjectNotFoundError,
} from '../domain/finance.error';
import {
  FinanceTransaction,
  type TransactionFields,
  type TransactionPatch,
  type TransactionState,
} from '../domain/transaction.entity';
import { type CategoryRepository, type ListPage } from './category.repository.port';
import {
  type TransactionEnrichedRow,
  type TransactionRepository,
} from './transaction.repository.port';

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
  /**
   * CROSS-MODUL okuma yuzeyleri (ADR-0034 §4).
   *
   * ⚠️ Ikisi de PUBLIC INTERFACE'tir; CRM'in ve Projeler'in `domain`,
   * `application`, `infrastructure` katmanlari bu module KAPALIDIR
   * (`import/no-restricted-paths`, makine tarafindan zorlanir).
   *
   * ⚠️ Izin kapilari (`company:read` / `project:read`) DIZINLERIN ICINDEDIR,
   * burada DEGIL — unutan tek modul bir sizinti kapisi acardi. Buradan
   * gorunen tek sey sudur: ad gelmediyse `null`, ve sebebi SORULMAZ.
   */
  readonly companyDirectory: CompanyDirectory;
  readonly projectDirectory: ProjectDirectory;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class TransactionUseCases {
  constructor(private readonly deps: TransactionDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    role: string;
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

    // ⚠️ CROSS-MODUL kontroller transaction'in DISINDA ve ONCESINDE: iki dizin
    // de KENDI transaction'ini acar (`ProjectUseCases`in sirket kontrolunde
    // verilen ayni karar — ic ice transaction kismi commit riski uretir).
    await this.#assertExternalRefsVisible(state, input.role);

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#assertCategoryUsable(state.categoryId, state.direction, { forNewLink: true });
      await this.deps.repository.save(transaction);
    });

    return state;
  }

  /**
   * Sayfali liste — cross-modul adlar IKI TOPLU sorguyla cozulur.
   *
   * Satir basina cagri N+1 olurdu; her iki dizin de toplu calisir
   * (`ProjectUseCases.list`in ayni deseni).
   */
  async list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    categoryId: string | null;
    from: string | null;
    to: string | null;
    role: string;
  }): Promise<ListPage<TransactionEnrichedRow>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: await this.#withExternalNames(page.items, input.role), total: page.total };
  }

  async get(input: { id: string; role: string }): Promise<TransactionEnrichedRow> {
    const transaction = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(input.id),
    );

    if (transaction === null) {
      throw new TransactionNotFoundError();
    }

    // Tek kayit da ayni yoldan gecer: "ad cozme" kurali TEK yerde yasar.
    // `categoryName` burada `null`dur — tekil okuma `JOIN` yapmaz ve kategori
    // adi listede zaten cozuluyor; ihtiyac duyulursa ayri bir karardir.
    const row = { ...transaction.toState(), categoryName: null };
    const [enriched] = await this.#withExternalNames([row], input.role);

    return enriched ?? { ...row, companyName: null, projectName: null };
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
  async update(input: {
    id: string;
    role: string;
    changes: TransactionPatch;
  }): Promise<TransactionState> {
    // ⚠️ Cross-modul kontroller transaction'in DISINDA ve ONCESINDE — ve
    // YALNIZCA gonderilen alan icin. Mevcut (belki sarkan) bir isaretciyi her
    // guncellemede yeniden dogrulamak, silinmis bir sirkete bagli bir kaydin
    // TUTARINI duzeltmeyi imkansiz kilardi.
    if (input.changes.companyId !== undefined) {
      await this.#assertCompanyVisible(input.changes.companyId, input.role);
    }
    if (input.changes.projectId !== undefined) {
      await this.#assertProjectVisible(input.changes.projectId, input.role);
    }

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

  /** Yazma aninda IKI cross-modul isaretcinin de GORUNURLUGU (ADR-0034 §4). */
  async #assertExternalRefsVisible(
    fields: { companyId: string | null; projectId: string | null },
    role: string,
  ): Promise<void> {
    await this.#assertCompanyVisible(fields.companyId, role);
    await this.#assertProjectVisible(fields.projectId, role);
  }

  /**
   * Verilen `companyId` cagiran icin GORUNUR mu.
   *
   * `null` gecerlidir ve kontrol edilmez: musteriye bagli olmayan bir masraf
   * (kira, vergi, genel gider) mesrudur.
   *
   * ⚠️ "Sirket yok", "baska tenant'in" ve "`company:read` tasimiyorsun" AYNI
   * hatayi verir — dizin ucunu ayirt etmez. Sonucu: goremedigi bir sirkete
   * kayit baglayamaz, ve reddin sebebinden o sirketin VAR OLDUGUNU cikaramaz.
   */
  async #assertCompanyVisible(companyId: string | null, role: string): Promise<void> {
    if (companyId === null) {
      return;
    }

    const names = await this.deps.companyDirectory.findNames({ ids: [companyId], role });
    if (!names.has(companyId)) {
      throw new TransactionCompanyNotFoundError();
    }
  }

  /** Yukaridakiyle birebir ayni disiplin, ikinci hedef icin. */
  async #assertProjectVisible(projectId: string | null, role: string): Promise<void> {
    if (projectId === null) {
      return;
    }

    const names = await this.deps.projectDirectory.findNames({ ids: [projectId], role });
    if (!names.has(projectId)) {
      throw new TransactionProjectNotFoundError();
    }
  }

  /**
   * Satirlara sirket ve proje adini ekler — hedef basina TEK toplu sorgu.
   *
   * Ad bulunamayanlar `null` alir ve satir listeden DUSMEZ: sarkan bir
   * isaretci (silinmis sirket/proje) tolere edilen normal bir durumdur
   * (ADR-0034 §4.2), ilgili iznin yoklugu da oyle.
   *
   * ⚠️ Iki dizin AYRI cagrilir ve BIRLESTIRILMEZ: her biri KENDI izin kapisini
   * tasiyor. `company:read` tasiyip `project:read` tasimayan bir kullanici
   * sirket adini gorur, proje adini gormez — ve bu DOGRU davranistir.
   */
  async #withExternalNames<
    T extends { readonly companyId: string | null; readonly projectId: string | null },
  >(rows: readonly T[], role: string): Promise<(T & TransactionExternalNames)[]> {
    const companyIds = [
      ...new Set(rows.flatMap((row) => (row.companyId === null ? [] : [row.companyId]))),
    ];
    const projectIds = [
      ...new Set(rows.flatMap((row) => (row.projectId === null ? [] : [row.projectId]))),
    ];

    // Iki dizin PARALEL cagrilir: birbirini beklemeleri icin bir sebep yok.
    const [companyNames, projectNames] = await Promise.all([
      this.deps.companyDirectory.findNames({ ids: companyIds, role }),
      this.deps.projectDirectory.findNames({ ids: projectIds, role }),
    ]);

    return rows.map((row) => ({
      ...row,
      companyName: row.companyId === null ? null : (companyNames.get(row.companyId) ?? null),
      projectName: row.projectId === null ? null : (projectNames.get(row.projectId) ?? null),
    }));
  }
}

interface TransactionExternalNames {
  readonly companyName: string | null;
  readonly projectName: string | null;
}
