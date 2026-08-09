import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  Project,
  type ProjectFields,
  type ProjectPatch,
  type ProjectState,
  type ProjectStatus,
} from '../domain/project.entity';
import { ProjectNotFoundError } from '../domain/projects.error';
import {
  type ListPage,
  type ProjectListRow,
  type ProjectRepository,
} from './project.repository.port';
import { today } from './today';

/**
 * Proje yasam dongusu (ADR-0033 §1).
 *
 * ============================================================================
 * BES USE CASE TEK DOSYADA — `CompanyUseCases` ile ayni gerekce
 * ============================================================================
 * Besi de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction sinirlari,
 * ayni "bulunamadi -> 404" kurali. Bes dosyaya bolmek, her birinde ayni uc
 * satirlik bagimlilik blogunu tekrarlamak olurdu.
 *
 * ⚠️ Bu sapma AI ya da coklu-adim bir akis eklendiginde YENIDEN DEGERLENDIRILIR
 * (Slice 3'te `progress_notes` embedding uretecek ve KENDI dosyasini alacak —
 * CRM'de `interactions`in aldigi gibi).
 * ============================================================================
 */
export interface ProjectDependencies {
  readonly repository: ProjectRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class ProjectUseCases {
  constructor(private readonly deps: ProjectDependencies) {}

  async create(input: { tenantId: string; fields: ProjectFields }): Promise<ProjectState> {
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
   * `openTaskCount` / `overdueTaskCount` `Project` entity'sinde YOKTUR (ve
   * olmamalidir): baska bir tablodan turer. `CompanyUseCases.list` ile ayni
   * karar; gerekce `project.repository.port.ts`te.
   */
  async list(input: {
    limit: number;
    offset: number;
    status: ProjectStatus | null;
  }): Promise<ListPage<ProjectListRow>> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list({ ...input, today: today(this.deps.clock) }),
    );
  }

  async get(id: string): Promise<ProjectState> {
    const project = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    return project.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * Okuma ve yazma AYNI transaction'dadir: arada baska bir istek satiri
   * degistirirse en azindan tutarli bir taban uzerinde calisilmis olur.
   * ⚠️ Bu bir KILIT DEGILDIR — es zamanli iki `PATCH`'te son yazan kazanir
   * (bilinen sinir, bkz. `Project` sinif yorumu).
   */
  async update(input: { id: string; changes: ProjectPatch }): Promise<ProjectState> {
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
   * SERT silme.
   *
   * ⚠️ Bu slice'ta cascade edecek bir COCUK YOK: `tasks` Slice 2'de,
   * `progress_notes` Slice 3'te aciliyor ve ikisi de `ON DELETE CASCADE`
   * tasiyacak (ADR-0033 §8). Yani bugun tek satir silen bu islem, Slice 3'ten
   * sonra AI HAFIZASINDAN DA SILEN bir isleme donusecek — `project:delete`in
   * `project:write`tan ayri tutulmasinin sebebi tam olarak budur.
   *
   * Silinen satir sayisi `0` ise kayit yoktur YA DA baska tenant'indir — ikisi
   * ayirt EDILMEZ (bkz. `ProjectNotFoundError`).
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new ProjectNotFoundError();
    }
  }
}
