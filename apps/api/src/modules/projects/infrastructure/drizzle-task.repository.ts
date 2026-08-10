import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm';

import { projects, tasks } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/project.repository.port';
import {
  type OverdueTaskRow,
  type TaskListFilter,
  type TaskRepository,
} from '../application/task.repository.port';
import { InvalidTaskStatusError } from '../domain/projects.error';
import { CLOSED_TASK_STATUSES, isTaskStatus, Task, type TaskStatus } from '../domain/task.entity';

/**
 * `TaskRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0021`).
 */
@Injectable()
export class DrizzleTaskRepository implements TaskRepository {
  async save(task: Task): Promise<void> {
    const { db } = requireTransaction();
    const state = task.toState();

    // ⚠️ `projectId` SET LISTESINDE YOK: gorevi baska projeye tasimak bir
    // TASIMA islemidir, kismi guncelleme degil (bkz. `Task` sinif yorumu).
    // Listeye eklemek, bir `PATCH`in gorevin CASCADE kaderini sessizce
    // degistirmesine yol acardi.
    await db
      .insert(tasks)
      .values(state)
      .onConflictDoUpdate({
        target: tasks.id,
        set: {
          title: state.title,
          status: state.status,
          dueOn: state.dueOn,
          assigneeUserId: state.assigneeUserId,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Task | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toTask(row);
  }

  async list(input: TaskListFilter & { limit: number; offset: number }): Promise<ListPage<Task>> {
    const { db } = requireTransaction();
    const filter = buildFilter(input);

    // `id` TIE-BREAKER: ayni milisaniyede olusan iki kayitta kararsiz siralama,
    // sayfalamada bir kaydin iki kez ya da HIC gorunmemesi demektir.
    const rows = await db
      .select()
      .from(tasks)
      .where(filter)
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(input.limit)
      .offset(input.offset);

    // Filtre HEM sayfaya HEM sayaca uygulanir; ayrisirsa arayuzun sayfalayicisi
    // var olmayan sayfalar gosterirdi.
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(filter);

    return { items: rows.map(toTask), total: counted?.total ?? 0 };
  }

  /**
   * Proje id -> (acik, gecikmis) sayaclari.
   *
   * IKI SORGU, iliskili alt sorgu DEGIL ve N+1 DE DEGIL: yalnizca SAYFADAKI
   * id'ler icin iki gruplanmis sorgu atilir, yani istek sayisi sabittir ve
   * sayfa uzunlugundan bagimsizdir. `DrizzleCompanyRepository`nin sayac
   * haritalariyla birebir ayni desen ve ayni gerekce.
   */
  async countsByProject(input: {
    projectIds: readonly string[];
    today: string;
  }): Promise<Map<string, { open: number; overdue: number }>> {
    if (input.projectIds.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();
    const ids = [...input.projectIds];

    // `count(*)::int` ACIK ve gerekli: PostgreSQL `count` icin `bigint` doner ve
    // surucu onu JS'te STRING'e cevirir — `::int` olmadan sayac metin olurdu.
    const openRows = await db
      .select({ projectId: tasks.projectId, total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(inArray(tasks.projectId, ids), notInArray(tasks.status, [...CLOSED_TASK_STATUSES])),
      )
      .groupBy(tasks.projectId);

    // Yuklem migration `0021`'in KISMI INDEX'iyle birebir eslesir:
    // `due_on IS NOT NULL AND status <> 'done'`. Gun disaridan gelir.
    const overdueRows = await db
      .select({ projectId: tasks.projectId, total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, ids),
          isNotNull(tasks.dueOn),
          notInArray(tasks.status, [...CLOSED_TASK_STATUSES]),
          lt(tasks.dueOn, input.today),
        ),
      )
      .groupBy(tasks.projectId);

    const result = new Map<string, { open: number; overdue: number }>();
    // Haritada YOKSA sifir: gruplanmis sayim yalnizca EN AZ BIR satiri olan
    // projeyi dondurur (`LEFT JOIN` semantiginin ayni uygulamasi).
    for (const row of openRows) {
      if (row.projectId !== null) {
        result.set(row.projectId, { open: row.total, overdue: 0 });
      }
    }
    for (const row of overdueRows) {
      if (row.projectId !== null) {
        const current = result.get(row.projectId) ?? { open: 0, overdue: 0 };
        result.set(row.projectId, { ...current, overdue: row.total });
      }
    }

    return result;
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
    return deleted.length;
  }

  /**
   * EN COK GECIKMIS gorevler (ADR-0033 §6.1).
   *
   * ⚠️ `LEFT JOIN` ZORUNLU: `project_id` NULLABLE'dir ve `INNER JOIN` olsaydi
   * PROJESIZ gecikmis gorevler ("Faturayi gonder") AI'in gozunden SESSIZCE
   * kaybolurdu. Modulun karakteristik karari (§3) tam da burada kendini
   * gosteriyor: nullable ebeveyn, her okuma yolunda bilincli bir secim ister.
   *
   * Yuklem migration `0021`'in KISMI INDEX'iyle birebir eslesir.
   */
  async findMostOverdue(input: { limit: number; today: string }): Promise<OverdueTaskRow[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        taskId: tasks.id,
        title: tasks.title,
        dueOn: tasks.dueOn,
        assigneeUserId: tasks.assigneeUserId,
        projectName: projects.name,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          isNotNull(tasks.dueOn),
          notInArray(tasks.status, [...CLOSED_TASK_STATUSES]),
          lt(tasks.dueOn, input.today),
        ),
      )
      // EN ESKI once: "en cok geciken" ilk gorunur. `id` tie-breaker.
      .orderBy(asc(tasks.dueOn), asc(tasks.id))
      .limit(input.limit);

    // `due_on` kolonu NULLABLE ama yuklem (`isNotNull`) onu zaten garantiliyor;
    // tip sistemi bunu goremez. Zorlama (`as`) KULLANILMAZ (DEVELOPMENT_RULES
    // 2.3) — acik daraltma yapilir, boylece beklenmeyen bir `null` sessizce
    // gecmek yerine satiri DUSURUR.
    return rows.flatMap((row) => (row.dueOn === null ? [] : [{ ...row, dueOn: row.dueOn }]));
  }
}

/**
 * Filtreleri tek bir `WHERE`e cevirir.
 *
 * `undefined` doner (bos dizi degil) ki Drizzle `.where()`i tamamen atlasin;
 * bos bir `and()` bazi surumlerde gecersiz SQL uretir.
 */
function buildFilter(input: TaskListFilter): SQL | undefined {
  const parts: SQL[] = [];

  if (input.status !== null) {
    parts.push(eq(tasks.status, input.status));
  }
  if (input.projectId !== null) {
    parts.push(eq(tasks.projectId, input.projectId));
  }
  // "Yapilacaklar" kutusu — ADR-0033 §3. `projectId` ile BIRLIKTE gelemez;
  // DTO seviyesinde reddedilir.
  if (input.withoutProject) {
    parts.push(isNull(tasks.projectId));
  }
  if (input.assigneeUserId !== null) {
    parts.push(eq(tasks.assigneeUserId, input.assigneeUserId));
  }
  if (input.overdue) {
    parts.push(isNotNull(tasks.dueOn));
    parts.push(notInArray(tasks.status, [...CLOSED_TASK_STATUSES]));
    parts.push(lt(tasks.dueOn, input.today));
  }

  return parts.length === 0 ? undefined : and(...parts);
}

/** Satiri entity'ye cevirir; `status` daraltmasi tek yerde yapilir. */
function toTask(row: typeof tasks.$inferSelect): Task {
  return Task.fromPersistence({ ...row, status: toStatus(row.status) });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3). Pratikte ULASILMAZ:
 * satir `tasks_status_valid` CHECK kisitindan gecmistir. Savunma katmani.
 */
function toStatus(value: string): TaskStatus {
  if (!isTaskStatus(value)) {
    throw new InvalidTaskStatusError(value);
  }
  return value;
}
