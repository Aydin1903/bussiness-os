import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';

import { projects } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type ListPage,
  type ProjectListRow,
  type ProjectRepository,
} from '../application/project.repository.port';
import { TASK_REPOSITORY, type TaskRepository } from '../application/task.repository.port';
import { isProjectStatus, Project, type ProjectStatus } from '../domain/project.entity';
import { InvalidProjectStatusError } from '../domain/projects.error';

/**
 * `ProjectRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0020`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleProjectRepository implements ProjectRepository {
  /**
   * ⚠️ Proje repository'si GOREV repository'sine bagimlidir — ters degil.
   *
   * Sayaclar `projects.tasks`tan turer ve o sorgu gorev tarafinin bilgisidir
   * (kapanmis durum kumesi, kismi index'le eslesen yuklem). Buraya ikinci bir
   * `tasks` sorgusu yazmak, ayni yuklemin IKI kopyasini uretirdi ve biri
   * degistiginde digeri sessizce ayrisirdi.
   *
   * Yon tek ve dongusuzdur: `TaskRepository` `projects` tablosuna dokunmaz.
   */
  constructor(@Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository) {}

  async save(project: Project): Promise<void> {
    const { db } = requireTransaction();
    const state = project.toState();

    // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
    //
    // ⚠️ `companyId` SET LISTESINDE YOK ve bu bilincli: bu slice'ta kolon
    // yazilmiyor (ADR-0033 §2, Slice 4). Listeye eklemek, bugun her zaman
    // `null` olan bir degeri mevcut satirin uzerine yazip veriyi SESSIZCE
    // silme riski dogururdu.
    await db
      .insert(projects)
      .values(state)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: state.name,
          status: state.status,
          description: state.description,
          startedOn: state.startedOn,
          dueOn: state.dueOn,
          statusChangedAt: state.statusChangedAt,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Project | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toProject(row);
  }

  async list(input: {
    limit: number;
    offset: number;
    status: ProjectStatus | null;
    today: string;
  }): Promise<ListPage<ProjectListRow>> {
    const { db } = requireTransaction();

    // Siralamada `id` TIE-BREAKER'dir: ayni milisaniyede olusan iki kayitta
    // kararsiz siralama, sayfalamada bir kaydin iki kez ya da HIC gorunmemesi
    // demektir (ADR-0029'un liste ucunda ogrenilen ders).
    //
    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir. Yalnizca sayfaya uygulansaydi
    // `total`, filtrelenmemis toplami dondururdu ve arayuzun sayfalayicisi
    // var olmayan sayfalar gosterirdi — sessiz ve fark edilmesi zor bir hata.
    const filter = input.status === null ? undefined : eq(projects.status, input.status);

    const rows = await db
      .select()
      .from(projects)
      .where(filter)
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(filter);

    // Sayaclar yalnizca SAYFADAKI id'ler icin — N+1 degil, sabit iki sorgu
    // (gerekce `TaskRepository.countsByProject`ta).
    const counts = await this.taskRepository.countsByProject({
      projectIds: rows.map((row) => row.id),
      today: input.today,
    });

    return {
      items: rows.map((row) => {
        const count = counts.get(row.id);
        return {
          ...toProject(row).toState(),
          // Haritada YOKSA sifir: hic gorevi olmayan proje listeden DUSMEZ.
          openTaskCount: count?.open ?? 0,
          overdueTaskCount: count?.overdue ?? 0,
        };
      }),
      total: counted?.total ?? 0,
    };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db.delete(projects).where(eq(projects.id, id)).returning({
      id: projects.id,
    });
    return deleted.length;
  }
}

/** Satiri entity'ye cevirir; `status` daraltmasi tek yerde yapilir. */
function toProject(row: typeof projects.$inferSelect): Project {
  return Project.fromPersistence({ ...row, status: toStatus(row.status) });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi. Yuklem
 * kullanilir ve uymayan deger domain hatasi firlatir.
 *
 * Pratikte ULASILMAZ: satir migration `0020`'nin `projects_status_valid` CHECK
 * kisitindan gecmistir. Savunma katmani — `toStage` ile birebir ayni desen.
 */
function toStatus(value: string): ProjectStatus {
  if (!isProjectStatus(value)) {
    throw new InvalidProjectStatusError(value);
  }
  return value;
}
