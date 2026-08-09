import { type TenantAccessQuery } from '../../tenant/tenant.public';
import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  TaskAssigneeNotMemberError,
  TaskNotFoundError,
  TaskProjectNotFoundError,
} from '../domain/projects.error';
import { Task, type TaskFields, type TaskPatch, type TaskState } from '../domain/task.entity';
import { type ListPage, type ProjectRepository } from './project.repository.port';
import { type TaskListFilter, type TaskRepository } from './task.repository.port';
import { today } from './today';

/**
 * Gorev yasam dongusu (ADR-0033 §3, §4).
 *
 * `ProjectUseCases` ile ayni sekil; iki ayri dosyadalar cunku iki AYRI
 * kaynagin CRUD'udur ve gorevlerin kendi dogrulama zinciri vardir (proje +
 * atanan).
 */
export interface TaskDependencies {
  readonly repository: TaskRepository;
  readonly projectRepository: ProjectRepository;
  /**
   * Tenant modulunun PUBLIC yuzeyi (`tenant.public.ts`).
   *
   * ⚠️ Bu, Projeler'in ikinci cross-modul bagimliligidir ama BIRINCISIYLE AYNI
   * SINIFTA DEGIL: CRM bir IS modulu, Tenant ise platform zincirinin ilk halkasi
   * (ARCHITECTURE §6.2). Kimlik ve uyelik zaten her modulun altinda duruyor;
   * Identity de Tenant'i buradan tuketiyor.
   */
  readonly tenantAccess: TenantAccessQuery;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class TaskUseCases {
  constructor(private readonly deps: TaskDependencies) {}

  async create(input: {
    tenantId: string;
    projectId: string | null;
    fields: TaskFields;
  }): Promise<TaskState> {
    // Atama kontrolu transaction'in DISINDA ve ONCESINDE.
    //
    // ⚠️ Ic ice transaction YASAK: `resolveMemberAccess` KENDI
    // `runInTenantTransaction`ini acar (bkz. `ResolveTenantAccessQuery`) ve
    // transaction siniri use case'tedir (MT §13.3 kural 2). Kendi
    // transaction'imizin icinden cagirmak ic ice transaction ve kismi commit
    // riski uretirdi.
    await this.#assertAssigneeIsMember(input.tenantId, input.fields.assigneeUserId);

    const task = Task.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#assertProjectExists(input.projectId);
      await this.deps.repository.save(task);
    });

    return task.toState();
  }

  async list(
    input: Omit<TaskListFilter, 'today'> & { limit: number; offset: number },
  ): Promise<ListPage<TaskState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list({ ...input, today: today(this.deps.clock) }),
    );

    return { items: page.items.map((task) => task.toState()), total: page.total };
  }

  async get(id: string): Promise<TaskState> {
    const task = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (task === null) {
      throw new TaskNotFoundError();
    }

    return task.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * ⚠️ Atama kontrolu, gorevin VAR OLUP OLMADIGI bilinmeden once yapilir
   * (yukaridaki ic ice transaction gerekcesi). Bedeli: var olmayan bir goreve
   * gecersiz bir atama gonderilirse 404 yerine 422 doner. Kabul edildi —
   * alternatifi transaction'i acip kapatip yeniden acmakti ve o, okuma ile
   * yazmayi FARKLI transaction'lara bolerdi.
   */
  async update(input: { tenantId: string; id: string; changes: TaskPatch }): Promise<TaskState> {
    if (input.changes.assigneeUserId !== undefined) {
      await this.#assertAssigneeIsMember(input.tenantId, input.changes.assigneeUserId);
    }

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new TaskNotFoundError();
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
      throw new TaskNotFoundError();
    }
  }

  /**
   * Proje VAR MI — yalnizca `projectId` verildiyse.
   *
   * `null` gecerlidir ve kontrol edilmez: projesiz gorev mesrudur (ADR-0033 §3).
   * Okuma RLS altindadir, yani baska tenant'in projesi "yok" gorunur ve ayni
   * hatayi alir — varligi sizdirilmaz.
   */
  async #assertProjectExists(projectId: string | null): Promise<void> {
    if (projectId === null) {
      return;
    }

    const project = await this.deps.projectRepository.findById(projectId);
    if (project === null) {
      throw new TaskProjectNotFoundError();
    }
  }

  /**
   * Atanan kisi bu tenant'in AKTIF uyesi mi (ADR-0033 §4).
   *
   * `null` = atamayi kaldir; kontrol gerekmez.
   *
   * ⚠️ BILINEN SINIR — kontrol ile yazma ARASINDA yaris var: kullanici tam bu
   * arada tenant'tan cikarilirsa gorev yine de ona atanmis olur. Kapatmanin tek
   * yolu uyelik satirini ayni transaction'da KILITLEMEKTI; bu, baska bir
   * modulun tablosuna kilit koymak demek (Mutlak Kural 5-6) ve bedeli kazancin
   * cok ustunde. Sonucu zararsizdir: ad zaten cozulemez ve gorev yeniden
   * atanabilir.
   */
  async #assertAssigneeIsMember(tenantId: string, assigneeUserId: string | null): Promise<void> {
    if (assigneeUserId === null) {
      return;
    }

    const access = await this.deps.tenantAccess.resolveMemberAccess({
      userId: assigneeUserId,
      tenantId,
    });

    // FAIL CLOSED: `granted` disindaki HER sonuc reddedilir. Sebep
    // (`no-membership` / `membership-inactive` / `tenant-inactive`) cagirana
    // TASINMAZ — hangisinin dondugu, bir id'nin sistemde kayitli olup
    // olmadigini sizdirirdi (bkz. `TaskAssigneeNotMemberError`).
    if (!access.granted) {
      throw new TaskAssigneeNotMemberError();
    }
  }
}
