import { type Task, type TaskStatus } from '../domain/task.entity';
import { type ListPage } from './project.repository.port';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/**
 * Gorev listesi filtresi.
 *
 * ============================================================================
 * `projectId` UC DURUM TASIR, IKI DEGIL
 * ============================================================================
 * "Hepsi" · "su proje" · "PROJESIZ OLANLAR". Ucuncusu ADR-0033 §3'un
 * "Yapilacaklar kutusu"dur ve bir filtre degeriyle ifade EDILEMEZ: `null`
 * gondermek "filtre yok" ile karisirdi.
 *
 * Bu yuzden iki AYRI alan var ve ikisi BIRLIKTE gonderilemez (DTO seviyesinde
 * reddedilir). Alternatif — `projectId: 'none'` gibi sihirli bir dize — tipi
 * `string`e genisletir ve UUID dogrulamasini kaybettirirdi.
 */
export interface TaskListFilter {
  readonly status: TaskStatus | null;
  readonly projectId: string | null;
  /** `true` = YALNIZCA projesiz gorevler ("Yapilacaklar" kutusu). */
  readonly withoutProject: boolean;
  readonly assigneeUserId: string | null;
  /**
   * `true` = yalnizca GECIKMIS gorevler.
   *
   * Yuklem: `due_on IS NOT NULL AND status <> 'done' AND due_on < today`.
   * Ilk iki parca migration `0021`'in KISMI INDEX'iyle birebir eslesir; ayrisirsa
   * index devre disi kalir (CRM'in `0017`'de ogrendigi ders).
   */
  readonly overdue: boolean;
  /**
   * `YYYY-MM-DD` — bugun. `CURRENT_DATE` KULLANILMAZ.
   *
   * Zaman DISARIDAN gelir (DEVELOPMENT_RULES 3.2): `Clock`tan okunur, use
   * case'te bicimlenir ve buraya gecirilir. `CURRENT_DATE` sorguyu test
   * edilemez kilardi ve sunucunun saat dilimine baglardi.
   */
  readonly today: string;
}

/**
 * `projects.tasks` kaliciligi.
 *
 * HICBIR METOT `tenantId` ALMAZ — daraltmayi RLS yapar (migration `0021`).
 * Gerekce `ProjectRepository`de; burada tekrarlanmaz.
 */
export interface TaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  list(input: TaskListFilter & { limit: number; offset: number }): Promise<ListPage<Task>>;
  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;

  /**
   * Proje id -> (acik gorev sayisi, gecikmis gorev sayisi).
   *
   * Proje LISTESI icin; `CompanyListRow`un `contactCount` /
   * `openOpportunityCount` sayaclariyla ayni desen ve ayni gerekce. "Acik"
   * kapanmislari (`done`) DISLAR: sorulan soru "su an kac isim var", "toplam
   * kac is yaptim" degil.
   *
   * Yalnizca SAYFADAKI id'ler icin cagrilir — N+1 degil, sabit iki sorgu.
   */
  countsByProject(input: {
    projectIds: readonly string[];
    today: string;
  }): Promise<Map<string, { open: number; overdue: number }>>;

  /**
   * EN COK GECIKMIS gorevler — yapisal katkinin ucuncu sorgusu (ADR-0033 §6.1).
   *
   * En eski `due_on` once: "en cok geciken" ilk gorunur.
   */
  findMostOverdue(input: { limit: number; today: string }): Promise<OverdueTaskRow[]>;
}

/**
 * Yapisal katkinin gorev satiri.
 *
 * ⚠️ `projectName` NULLABLE cunku gorev PROJESIZ olabilir ("Yapilacaklar"
 * kutusu, ADR-0033 §3). Sorgu bu yuzden `LEFT JOIN` kullanmak ZORUNDADIR —
 * `INNER` olsaydi projesiz gecikmis gorevler AI'in gozunden sessizce
 * kaybolurdu.
 *
 * ⚠️ `assigneeUserId` var ama ADI YOK (ADR-0033 §6 bilinen siniri): ad
 * cozmek Identity/uyelik dizini ister ve o yuzey henuz yok. Katkici bu yuzden
 * yalnizca "atanmis" / "ATANMAMIS" der — asil aksiyon sinyali zaten budur.
 */
export interface OverdueTaskRow {
  readonly taskId: string;
  readonly title: string;
  readonly dueOn: string;
  readonly assigneeUserId: string | null;
  readonly projectName: string | null;
}
