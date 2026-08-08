import { calendarDayDelta, formatCalendarDay } from '@/lib/format/datetime';
import { Mark } from './signals';

/**
 * Takip tarihi ve GECİKME işareti.
 *
 * ============================================================================
 * "GECİKMİŞ" İŞARETİNİ İSTEMCİ KOYAR — bu backend'in açık kararı
 * ============================================================================
 * `GET /crm/follow-ups` yalnızca KRONOLOJİK sıralar; hangi satırın geciktiğini
 * söylemez. Gerekçe: sunucunun `CURRENT_DATE`'i ile kullanıcının takvim günü
 * aynı olmak zorunda değildir. Farklı bir dilimdeki kullanıcı için sunucu
 * "bugün" derken kullanıcı hâlâ "dün"dedir; kararı kullanıcının takvimine
 * bırakmak tek doğru davranış.
 *
 * ============================================================================
 * ÜÇ HÂL, ÜÇ AĞIRLIK
 * ============================================================================
 *   geçmiş  → terracotta metin + "N gün gecikti"  (dikkat ister)
 *   bugün   → terracotta metin + "bugün"          (bugün yapılacak)
 *   gelecek → sessiz mono tarih                   (sırada bekliyor)
 *
 * Gecikme `--danger` ile boyanmaz: geciken bir takip bir HATA değil, bir
 * yapılacak iştir. Sistemde dikkat çeken renk zaten terracottadır ve rozet
 * onunla yazılır.
 */
export function FollowUpMark({ day }: { day: string }) {
  const delta = calendarDayDelta(day);
  const date = formatCalendarDay(day);

  // Tarih okunamadıysa hiçbir iddia edilmez — "gecikti" demek yanlış olabilirdi.
  if (delta === null) {
    return <Mark quiet>{date}</Mark>;
  }

  if (delta < 0) {
    return (
      <Mark>
        {date} · {-delta} gün gecikti
      </Mark>
    );
  }

  if (delta === 0) {
    return <Mark>{date} · bugün</Mark>;
  }

  return <Mark quiet>{date}</Mark>;
}

/** Takip GECİKMİŞ mi — liste sıralaması ve vurgusu bunu kullanır. */
export function isOverdue(day: string): boolean {
  const delta = calendarDayDelta(day);
  return delta !== null && delta < 0;
}
