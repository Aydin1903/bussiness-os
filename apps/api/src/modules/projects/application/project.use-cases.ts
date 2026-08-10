import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type CompanyDirectory } from '../../crm/crm.public';
import {
  Project,
  type ProjectFields,
  type ProjectPatch,
  type ProjectState,
  type ProjectStatus,
} from '../domain/project.entity';
import { ProjectCompanyNotFoundError, ProjectNotFoundError } from '../domain/projects.error';
import {
  type ListPage,
  type ProjectListRow,
  type ProjectRepository,
} from './project.repository.port';
import { today } from './today';

/**
 * Proje yasam dongusu (ADR-0033 §1, §2).
 *
 * ============================================================================
 * BES USE CASE TEK DOSYADA — `CompanyUseCases` ile ayni gerekce
 * ============================================================================
 * Besi de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction sinirlari,
 * ayni "bulunamadi -> 404" kurali.
 *
 * ============================================================================
 * CROSS-MODUL OKUMA: `CompanyDirectory` (ADR-0033 §2)
 * ============================================================================
 * Sirket ADI `projects.projects`e KOPYALANMAZ; her okumada CRM'in public
 * yuzeyinden cozulur. Kopyalansaydi sirket yeniden adlandirildiginda proje
 * listesi eski adi gostermeye devam ederdi.
 *
 * Izin kapisi (`company:read`) dizinin ICINDEDIR, burada DEGIL — unutan tek
 * modul bir sizinti kapisi acardi. Buradan bakildiginda tek gorunen sey sudur:
 * ad gelmediyse `null`, ve sebebi SORULMAZ (silinmis olabilir, gorulemiyor
 * olabilir; ikisi ayirt edilmez ve edilmemelidir).
 */
export interface ProjectDependencies {
  readonly repository: ProjectRepository;
  readonly companyDirectory: CompanyDirectory;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class ProjectUseCases {
  constructor(private readonly deps: ProjectDependencies) {}

  async create(input: {
    tenantId: string;
    role: string;
    fields: ProjectFields;
  }): Promise<ProjectState> {
    await this.#assertCompanyVisible(input.fields.companyId, input.role);

    const project = Project.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(project),
    );

    return project.toState();
  }

  /**
   * Sayfali liste — repository PROJEKSIYON doner, entity degil.
   *
   * Sirket adlari TEK sorguda cozulur (`CompanyDirectory` toplu calisir); satir
   * basina cagri N+1 olurdu.
   */
  async list(input: {
    limit: number;
    offset: number;
    status: ProjectStatus | null;
    role: string;
  }): Promise<ListPage<ProjectListRow>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list({ ...input, today: today(this.deps.clock) }),
    );

    return { items: await this.#withCompanyNames(page.items, input.role), total: page.total };
  }

  async get(input: {
    id: string;
    role: string;
  }): Promise<ProjectState & { companyName: string | null }> {
    const project = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(input.id),
    );

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    const state = project.toState();
    const [withName] = await this.#withCompanyNames([state], input.role);
    // Dizi tek elemanla girdi, tek elemanla cikar; `?? ` savunma katmani.
    return withName ?? { ...state, companyName: null };
  }

  /**
   * KISMI guncelleme.
   *
   * Okuma ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`'te son yazan kazanir (bilinen sinir).
   */
  async update(input: { id: string; role: string; changes: ProjectPatch }): Promise<ProjectState> {
    // Sirket kontrolu transaction'in DISINDA ve ONCESINDE: `CompanyDirectory`
    // KENDI transaction'ini acar (`TaskUseCases`in atama kontrolunde verilen
    // ayni karar — ic ice transaction kismi commit riski uretir).
    if (input.changes.companyId !== undefined) {
      await this.#assertCompanyVisible(input.changes.companyId, input.role);
    }

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new ProjectNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
  }

  /**
   * SERT silme; gorevler ve ilerleme notlari `ON DELETE CASCADE` ile birlikte
   * gider (ADR-0033 §8) — yani AI HAFIZASINDAN DA siler. `project:delete`in
   * `project:write`tan ayri tutulmasinin sebebi budur.
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new ProjectNotFoundError();
    }
  }

  /**
   * Verilen `companyId` cagiran icin GORUNUR mu (ADR-0033 §2).
   *
   * `null` gecerlidir ve kontrol edilmez: ic proje mesrudur.
   *
   * ⚠️ "Sirket yok", "baska tenant'in" ve "`company:read` tasimiyorsun" AYNI
   * hatayi verir — dizin ucunu ayirt etmez (bkz. `crm.public.ts`). Sonucu:
   * goremedigi bir sirkete proje baglayamaz, ve reddin sebebinden o sirketin
   * VAR OLDUGUNU cikaramaz.
   */
  async #assertCompanyVisible(companyId: string | null, role: string): Promise<void> {
    if (companyId === null) {
      return;
    }

    const names = await this.deps.companyDirectory.findNames({ ids: [companyId], role });
    if (!names.has(companyId)) {
      throw new ProjectCompanyNotFoundError();
    }
  }

  /**
   * Satirlara sirket adini ekler — TEK toplu sorgu.
   *
   * Ad bulunamayanlar `null` alir ve satir listeden DUSMEZ: sarkan bir
   * isaretci (silinmis sirket) tolere edilen normal bir durumdur (ADR-0033
   * §2d), `company:read` yoklugu da oyle.
   */
  async #withCompanyNames<T extends { readonly companyId: string | null }>(
    rows: readonly T[],
    role: string,
  ): Promise<(T & { companyName: string | null })[]> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.companyId === null ? [] : [row.companyId]))),
    ];
    const names = await this.deps.companyDirectory.findNames({ ids, role });

    return rows.map((row) => ({
      ...row,
      companyName: row.companyId === null ? null : (names.get(row.companyId) ?? null),
    }));
  }
}
