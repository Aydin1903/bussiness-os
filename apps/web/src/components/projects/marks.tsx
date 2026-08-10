import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from '@business-os/contracts';
import type { ProjectStatus, TaskStatus } from '@business-os/contracts';

import { Mark } from '@/components/module-kit/marks';
import { calendarDayDelta, formatCalendarDay } from '@/lib/format/datetime';

/**
 * Projeler'in KENDİNE ÖZGÜ kart işaretleri.
 *
 * Genel olan `Mark` ve `CountMark` `module-kit`ten gelir; buradakiler bu
 * modülün sözlüğünü taşır (durum, son tarih) ve orada yeri yok.
 */

/**
 * Durum rozeti — `StagePill`'in Projeler karşılığı.
 *
 * ⚠️ RENK TEK BAŞINA BİLGİ TAŞIMAZ (FRONTEND §4.8'in renk körlüğü kuralı):
 * rozetin İÇİNDE durumun adı yazar. Kapanmış durumlar sessiz, açık durumlar
 * imza rengiyle çizilir — yani "hangisiyle uğraşıyorum" bir bakışta okunur.
 */
export function StatusPill({ status }: { status: ProjectStatus }) {
  const closed = status === 'completed' || status === 'cancelled';

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-[10px] py-[3px]',
        'font-mono text-[9.5px] font-semibold tracking-[0.09em] uppercase',
        closed ? 'bg-fill text-fg-3' : 'bg-tint text-ink',
      ].join(' ')}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

/** Görev durumu — aynı reçete, görev sözlüğü. */
export function TaskStatusPill({ status }: { status: TaskStatus }) {
  const done = status === 'done';

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-[10px] py-[3px]',
        'font-mono text-[9.5px] font-semibold tracking-[0.09em] uppercase',
        done ? 'bg-fill text-fg-3' : 'bg-tint text-ink',
      ].join(' ')}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * "3 gün GECİKTİ" · "Son tarih: 12 Ağustos" · (tarihsizse hiçbir şey).
 *
 * ============================================================================
 * GECİKME UYARIDIR, TARİH DEĞİL
 * ============================================================================
 * Geçmiş bir tarih `Mark`'ın UYANIK hâlini alır (imza rengi); gelecek bir
 * tarih SESSİZ kalır. `--danger` kullanılmaz: geciken bir iş HATA değil,
 * yapılacak iştir (`signals.tsx`'in aynı kuralı).
 *
 * Tarihsiz görev hiçbir şey çizmez — "son tarih yok" yazmak, boş bir alanı
 * doldurulmuş gibi göstermek olurdu.
 */
export function DueMark({ day, done }: { day: string | null; done: boolean }) {
  if (day === null) {
    return null;
  }

  const delta = calendarDayDelta(day);

  // Tarih okunamadıysa gün sayısı UYDURULMAZ; tarihin kendisi yazılır.
  if (delta === null) {
    return <Mark quiet>Son tarih: {formatCalendarDay(day)}</Mark>;
  }

  // ⚠️ BİTMİŞ görev gecikmiş SAYILMAZ: geçmiş tarihli ama tamamlanmış bir işi
  // uyarı gibi göstermek, gerçek gecikmeleri görünmez kılardı. Backend'in
  // `overdue` yüklemi de `status <> 'done'` taşır; iki taraf aynı tanımı
  // kullanmak zorunda.
  if (done || delta >= 0) {
    return <Mark quiet>Son tarih: {formatCalendarDay(day)}</Mark>;
  }

  return <Mark>{-delta} gün GECİKTİ</Mark>;
}
