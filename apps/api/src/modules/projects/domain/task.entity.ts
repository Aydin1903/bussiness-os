import {
  BlankTaskTitleError,
  InvalidProjectsTimestampError,
  InvalidTaskStatusError,
} from './projects.error';

/**
 * Gorev (ADR-0033 §1, §3, §4).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2).
 *
 * ============================================================================
 * `projectId` OLUSTURMADA VERILIR, `update` ILE DEGISTIRILEMEZ
 * ============================================================================
 * Gorevi baska bir projeye tasimak bir TASIMA islemidir, kismi guncelleme
 * degil — `Contact.companyId` ve `Opportunity.companyId` icin verilmis ayni
 * karar (ADR-0031, `crm.dto.ts`). Gerekce burada daha da guclu: `project_id`
 * gorevin CASCADE ile hangi projeyle birlikte silinecegini belirler. Sessizce
 * degistirilebilseydi, bir `PATCH` gorevin silinme kaderini de degistirirdi.
 *
 * ⚠️ BILINEN SINIR: bugun gorevi baska projeye tasimanin YOLU YOK (sil + yeniden
 * olustur haric). Gercek bir talep gelince ayri bir uc (`POST .../move`) yazilir;
 * o gun karar, "hangi kaynak degisiyor"un acikca gorunmesi yonundedir.
 *
 * ============================================================================
 * `statusChangedAt` YOK — `Project`ten BILINCLI FARK
 * ============================================================================
 * Projede o kolon "bu proje 40 gundur ayni durumda" sinyalini tasir ve Slice
 * 4'un yapisal katkicisi onu okur. Gorev KISA OMURLUDUR; "ne kadardir bu
 * durumda" sorusunun gorevdeki karsiligi `dueOn`'dur (ADR-0033 §5). Kolon
 * basina bedel, kazanci karsilamiyor.
 *
 * `Project` ile ayni iyimser-eszamanlilik sinirini tasir (son yazan kazanir).
 */
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value);
}

/**
 * Kapanmis gorev durumu — "acik isler" ve "gecikmis" sorgulari bunu DISLAR.
 *
 * Tek tanimdan gelmesi, `CLOSED_STAGES`'in CRM'de yaptigi isin aynisi: yuklem
 * uc yerde tekrarlanir (liste filtresi, sayaclar, kismi index) ve uclu ayni
 * kumeden okumak zorundadir. Migration `0021`'in kismi index yuklemi bununla
 * BIREBIR eslesir.
 */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['done'];

export interface TaskFields {
  readonly title: string;
  readonly status: TaskStatus;
  /** `YYYY-MM-DD`. Takvim gunu, an DEGIL. */
  readonly dueOn: string | null;
  /** `null` = ATANMAMIS — gecerli ve anlamli bir durum. */
  readonly assigneeUserId: string | null;
}

export type TaskPatch = {
  readonly [K in keyof TaskFields]?: TaskFields[K] | undefined;
};

export interface TaskState extends TaskFields {
  readonly id: string;
  readonly tenantId: string;
  /** `null` = PROJESIZ gorev ("Yapilacaklar" kutusu, ADR-0033 §3). */
  readonly projectId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Task {
  private constructor(private readonly state: TaskState) {}

  static create(input: {
    id: string;
    tenantId: string;
    projectId: string | null;
    fields: TaskFields;
    now: Date;
  }): Task {
    const title = input.fields.title.trim();
    if (title === '') {
      throw new BlankTaskTitleError();
    }
    assertStatus(input.fields.status);

    return new Task({
      id: input.id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      ...input.fields,
      title,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; DOGRULAMA YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: TaskState): Task {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidProjectsTimestampError();
    }
    return new Task(state);
  }

  /**
   * KISMI guncelleme (PATCH).
   *
   * `undefined` = "dokunma", `null` = "temizle". `assigneeUserId: null`
   * gorevin atamasini KALDIRIR ve bu mesru bir islemdir.
   *
   * ⚠️ Atananin GECERLILIGI burada dogrulanmaz: uyelik kontrolu bir
   * VERITABANI sorgusu gerektirir ve `domain` katmani framework'suzdur
   * (CLAUDE.md dizin kurallari). Kontrol use case'tedir.
   */
  update(changes: TaskPatch, now: Date): Task {
    const current = this.state;

    const title = (changes.title ?? current.title).trim();
    if (title === '') {
      throw new BlankTaskTitleError();
    }

    const status = changes.status ?? current.status;
    assertStatus(status);

    return new Task({
      ...current,
      title,
      status,
      dueOn: changes.dueOn === undefined ? current.dueOn : changes.dueOn,
      assigneeUserId:
        changes.assigneeUserId === undefined ? current.assigneeUserId : changes.assigneeUserId,
      updatedAt: now,
    });
  }

  toState(): TaskState {
    return this.state;
  }
}

function assertStatus(status: string): void {
  if (!isTaskStatus(status)) {
    throw new InvalidTaskStatusError(status);
  }
}
