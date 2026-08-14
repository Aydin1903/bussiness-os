import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type ProjectRepository,
  type RiskyProjectRow,
} from '../application/project.repository.port';
import { type OverdueTaskRow, type TaskRepository } from '../application/task.repository.port';
import { today } from '../application/today';
import { type ProjectStatus } from '../domain/project.entity';
import { PROJECT_READ } from '../projects.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const PROJECT_STATUS_SOURCE = 'project-status';

/** En fazla kac proje satiri. Yapisal katki HER SORUDA gonderilir. */
const PROJECT_LIMIT = 3;

/** En fazla kac gecikmis gorev satiri. */
const OVERDUE_TASK_LIMIT = 2;

/**
 * ============================================================================
 * SKOR SABIT DEGIL, RISKE GORE — CRM'in duz 0.95'inden BILINCLI SAPMA
 * ============================================================================
 * `CrmPipelineContributor` her satira sabit 0.95 verir. Bu, tek yapisal
 * katkiciyken calisiyordu. Ikinci yapisal katkici gelince ARITMETIK degisti:
 *
 *   global top-K = 8 (`KNOWLEDGE_RETRIEVAL_LIMIT`)
 *   CRM yapisal 3 satir @0.95  +  Projeler yapisal 5 satir @0.95  =  8
 *
 * Yani sabit skorla iki yapisal katkici, sekiz yuvanin TAMAMINI kaplayabilir
 * ve soru ne kadar anlatisal olursa olsun anlamsal icerik disari duserdi.
 * Anlamsal katkicilarin en iyi parcasi 1.0 alir, IKINCISI 0.89 — yani yalnizca
 * her kaynagin EN IYI parcasi hayatta kalirdi.
 *
 * Cozum modul basina KOTA DEGIL (ADR-0031 §5.1 onu acikca reddetti): skoru
 * ANLAMLI kilmak. Port zaten "0..1, yuksek = daha alakali" diyor.
 *
 *   gecikmis gorevi var  -> 0.95  (gercekten alarm)
 *   durgun               -> 0.90  (dikkat)
 *   sadece acik, sorunsuz -> 0.75  (bilgi; anlamsal icerige yenilir)
 *
 * Sonuc kendi kendini duzenler: SAGLIKLI bir tenant'ta yapisal satirlar
 * yuvalari anlatisal icerige birakir, SORUNLU bir tenant'ta one cikar.
 *
 * ⚠️ CRM'in duz 0.95'ine DOKUNULMADI (kapsam disi) — yani bugun iki yapisal
 * katkici FARKLI skor politikalari izliyor. Tutarsizlik bilincli ve Slice 6
 * kapanis denetimine madde olarak yazildi.
 * ============================================================================
 */
const SCORE_OVERDUE = 0.95;
const SCORE_STALE = 0.9;
const SCORE_OPEN = 0.75;

const STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planning: 'Planlaniyor',
  in_progress: 'Devam Ediyor',
  completed: 'Tamamlandi',
  cancelled: 'Iptal',
};

/**
 * Projeler'in YAPISAL katkisi (ADR-0033 §6.1).
 *
 * ============================================================================
 * KATKICI VEKTOR TABANLI OLMAK ZORUNDA DEGIL
 * ============================================================================
 * "Hangi isler gecikti?" sorusunun cevabi bir ilerleme notunda YAZMAZ; `due_on`
 * kolonunda yazar. Yalnizca anlatisal veriyi gomseydik model bu soruyu bayat
 * notlardan TAHMIN EDEREK cevaplardi ve kendinden emin sekilde yanilirdi.
 *
 * ============================================================================
 * DURGUNLUK TURETILIR — `last_activity_at` KOLONU YOK (ADR-0033 §6.2)
 * ============================================================================
 * Deger her cagride uc kaynaktan hesaplanir: projenin kendi damgalari, son
 * gorev hareketi, son not. Kolona yazmak ikinci bir dogruluk kaynagi yaratirdi
 * ve bir tazeleme yolu unutuldugunda hata SESSIZ olurdu: canli bir proje
 * "durgun" gorunur ve AI yanlis uyarirdi.
 */
@Injectable()
export class ProjectStatusContributor implements RetrievalContributor {
  readonly source = PROJECT_STATUS_SOURCE;
  /** ADR-0036: kolonlardan TURETILEN yapisal ozet — havuzda taban yuva hakki. */
  readonly contributionKind = 'structural' as const;
  readonly permission = PROJECT_READ;

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly taskRepository: TaskRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    /** Bu kadar gun hareketsiz kalan proje DURGUN sayilir (config). */
    private readonly staleDays: number,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki deterministiktir; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const now = this.clock.now();
    const day = today(this.clock);

    const { projects, lastNotes, overdueTasks } =
      await this.transactionManager.runInCurrentTenantTransaction(async () => {
        const risky = await this.projectRepository.findRiskyOpenProjects({
          limit: PROJECT_LIMIT,
          today: day,
        });

        // ⚠️ AYRI SORGU — birinci sorguyla birlestirilemez: `tasks` ve
        // `progress_notes` ikisi de bire-coktur ve ayni sorguda JOIN'lenirse
        // satirlar carpilir, gorev sayaclari SESSIZCE siser.
        const notes = await this.projectRepository.findLastNoteActivity(
          risky.map((row) => row.projectId),
        );

        const overdue = await this.taskRepository.findMostOverdue({
          limit: OVERDUE_TASK_LIMIT,
          today: day,
        });

        return { projects: risky, lastNotes: notes, overdueTasks: overdue };
      });

    return [
      ...projects.map((row) =>
        toProjectFragment(row, lastNotes.get(row.projectId) ?? null, now, this.staleDays),
      ),
      ...overdueTasks.map((row) => toOverdueTaskFragment(row, now)),
    ];
  }
}

/**
 * Bir projeyi TEK SATIRLIK dogal dile cevirir.
 *
 * JSON ya da tablo DEGIL — `describeOpportunity` ile ayni gerekce: JSON
 * sozdizimine token harcar; tek buyuk tablo ATOMIK olurdu (top-K'da ya tamami
 * girer ya hicbiri) ve `reference` tek bir kayda isaret edemezdi.
 */
function toProjectFragment(
  row: RiskyProjectRow,
  lastNoteAt: Date | null,
  now: Date,
  staleDays: number,
): ContextFragment {
  const lastActivityAt = latest([
    row.createdAt,
    row.statusChangedAt,
    row.lastTaskActivityAt,
    lastNoteAt,
  ]);
  const idleDays = daysBetween(lastActivityAt, now);
  const isStale = idleDays >= staleDays;

  const parts = [
    row.name,
    STATUS_LABELS[row.status],
    `${String(daysBetween(row.statusChangedAt, now))} gundur bu durumda`,
  ];

  if (row.overdueTaskCount > 0) {
    // GECIKMIS olani ACIKCA soyle: modelin tarihlerden kendi cikarim yapmasini
    // beklemek guvenilmez ("bugun ne?" sorusuna cevap veremez).
    parts.push(
      `${String(row.openTaskCount)} acik gorev (${String(row.overdueTaskCount)} tanesi GECIKMIS)`,
    );
  } else {
    parts.push(`${String(row.openTaskCount)} acik gorev`);
  }

  parts.push(
    isStale
      ? `son hareket ${String(idleDays)} gun once — DURGUN`
      : `son hareket ${String(idleDays)} gun once`,
  );

  return {
    content: parts.join(' · '),
    score: scoreFor({ hasOverdue: row.overdueTaskCount > 0, isStale }),
    source: PROJECT_STATUS_SOURCE,
    reference: { kind: 'project', id: row.projectId },
  };
}

/**
 * Bir gecikmis gorevi TEK SATIRLIK dogal dile cevirir.
 *
 * ⚠️ ATANAN KISININ ADI YOK, yalnizca atanip atanmadigi (ADR-0033 §6 bilinen
 * siniri): elimizde `assignee_user_id` var ve adi cozmek Identity/uyelik
 * dizini ister — henuz olmayan bir cross-modul yuzey. Ham UUID yazmak modele
 * hicbir sey soylemezdi. "ATANMAMIS" ise gercek bir aksiyon sinyalidir:
 * geciken ve sahibi olmayan is.
 *
 * `projectName` `null` olabilir — PROJESIZ gorev ("Yapilacaklar" kutusu,
 * ADR-0033 §3) mesrudur ve AI'in gozunden dusmemelidir.
 */
function toOverdueTaskFragment(row: OverdueTaskRow, now: Date): ContextFragment {
  const due = new Date(`${row.dueOn}T00:00:00.000Z`);
  const parts = [
    row.projectName ?? 'Yapilacaklar (projesiz)',
    row.title,
    `son tarih ${row.dueOn} (${String(daysBetween(due, now))} gun GECIKMIS)`,
    row.assigneeUserId === null ? 'ATANMAMIS' : 'atanmis',
  ];

  return {
    content: parts.join(' · '),
    // Gecikmis gorev tanimi geregi alarmdir.
    score: SCORE_OVERDUE,
    source: PROJECT_STATUS_SOURCE,
    reference: { kind: 'task', id: row.taskId },
  };
}

function scoreFor(input: { hasOverdue: boolean; isStale: boolean }): number {
  if (input.hasOverdue) {
    return SCORE_OVERDUE;
  }
  return input.isStale ? SCORE_STALE : SCORE_OPEN;
}

/** En yeni zaman damgasi; `null`lar elenir. Liste hep en az bir deger tasir. */
function latest(values: readonly (Date | null)[]): Date {
  const present = values.filter((value): value is Date => value !== null);
  return present.reduce((max, value) => (value > max ? value : max));
}

/** Tam gun farki. Negatifse 0 (gelecek tarih "gecikmis" degildir). */
function daysBetween(from: Date, to: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay));
}
