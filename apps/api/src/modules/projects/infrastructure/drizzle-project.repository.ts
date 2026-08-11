import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { progressNotes, projects, tasks } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type ListPage,
  type ProjectCountsRow,
  type ProjectRepository,
  type RiskyProjectRow,
} from '../application/project.repository.port';
import { TASK_REPOSITORY, type TaskRepository } from '../application/task.repository.port';
import {
  CLOSED_PROJECT_STATUSES,
  isProjectStatus,
  Project,
  type ProjectStatus,
} from '../domain/project.entity';
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
    // ⚠️ `companyId` SLICE 4'TE SET LISTESINE GIRDI. Slice 1-3 boyunca disarida
    // durmustu cunku API onu kabul etmiyordu; `crm.public.ts` geldigi icin artik
    // yaziliyor. `undefined` = dokunma / `null` = temizle ayrimi entity'de
    // cozulur, buraya gelen deger ZATEN nihai durumdur.
    await db
      .insert(projects)
      .values(state)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: state.name,
          status: state.status,
          description: state.description,
          companyId: state.companyId,
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
  }): Promise<ListPage<ProjectCountsRow>> {
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

  /**
   * `id -> ad` — `ProjectDirectoryQuery`nin (ADR-0034 §4) tek veri ihtiyaci.
   *
   * `DrizzleCompanyRepository.findNamesByIds` ile birebir ayni: TEK sorgu,
   * `WHERE tenant_id` YOK (RLS daraltir), bulunamayan id haritaya girmez.
   */
  async findNamesByIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, [...ids]));

    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /**
   * ACIK projeler, RISK sirasinda (ADR-0033 §6.1).
   *
   * ============================================================================
   * TEK SORGU, `LEFT JOIN` + `FILTER` — korelasyonlu ALT SORGU YOK
   * ============================================================================
   * `DrizzleCompanyRepository.list`in yorumu bunu bir kez ogretti: Drizzle'in
   * `sql` sablonuna gomulu iliskili alt sorgu entegrasyon testinde `null`
   * dondurmustu ve nasil render edildigi opak kalmisti. Burada tahmin yerine
   * okunur ve ongorulebilir bir sekil kullaniliyor.
   *
   * ⚠️ `LEFT JOIN` ZORUNLU: `INNER` olsaydi HIC GOREVI OLMAYAN proje listeden
   * dusserdi — ki "acilmis ama hicbir sey yapilmamis" tam olarak yapisal
   * katkinin gostermesi gereken durumdur.
   *
   * ⚠️ `progress_notes` BU SORGUYA KATILMAZ: iki bire-cok tabloyu ayni sorguda
   * JOIN'lemek satirlari carpar ve sayaclari sisirir (bkz. port yorumu).
   */
  async findRiskyOpenProjects(input: { limit: number; today: string }): Promise<RiskyProjectRow[]> {
    const { db } = requireTransaction();

    // Yuklemler `CLOSED_TASK_STATUSES` / `CLOSED_PROJECT_STATUSES` tek
    // tanimindan gelir; iki yerde ayri yazilsalardi biri degistiginde digeri
    // sessizce ayrisirdi.
    const openTask = sql`${tasks.id} IS NOT NULL AND ${tasks.status} <> 'done'`;
    const overdueTask = sql`${openTask} AND ${tasks.dueOn} IS NOT NULL AND ${tasks.dueOn} < ${input.today}`;

    const rows = await db
      .select({
        projectId: projects.id,
        name: projects.name,
        status: projects.status,
        statusChangedAt: projects.statusChangedAt,
        createdAt: projects.createdAt,
        openTaskCount: sql<number>`count(*) FILTER (WHERE ${openTask})::int`,
        overdueTaskCount: sql<number>`count(*) FILTER (WHERE ${overdueTask})::int`,
        lastTaskActivityAt: sql<Date | null>`max(${tasks.updatedAt})`,
      })
      .from(projects)
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .where(notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]))
      .groupBy(projects.id)
      // RISK sirasi: once gecikmis gorevi cok olan, sonra en uzun suredir ayni
      // durumda olan. `id` tie-breaker — kararsiz siralama, ayni soruya iki
      // farkli cevap demektir.
      .orderBy(
        sql`count(*) FILTER (WHERE ${overdueTask}) DESC`,
        projects.statusChangedAt,
        projects.id,
      )
      .limit(input.limit);

    return rows.map((row) => ({ ...row, status: toStatus(row.status) }));
  }

  /**
   * Proje id -> son ilerleme notu zamani.
   *
   * AYRI sorgu olmasinin sebebi kartezyen carpimdir (bkz. port yorumu).
   */
  async findLastNoteActivity(projectIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();
    const rows = await db
      .select({
        projectId: progressNotes.projectId,
        lastAt: sql<Date>`max(${progressNotes.createdAt})`,
      })
      .from(progressNotes)
      .where(inArray(progressNotes.projectId, [...projectIds]))
      .groupBy(progressNotes.projectId);

    return new Map(rows.map((row) => [row.projectId, row.lastAt]));
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
