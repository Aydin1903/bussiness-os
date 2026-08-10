import { Mark } from '@/components/module-kit/marks';
import { calendarDayDelta, formatCalendarDay, localDay } from '@/lib/format/datetime';
import { quietCompanyDays, staleStageDays } from '@/lib/config/crm';

/**
 * Kart sinyalleri — BEDAVA akıllılık.
 *
 * ============================================================================
 * HİÇBİRİ AI ÇAĞIRMAZ
 * ============================================================================
 * Üçü de zaten elde olan veriden türer: takip tarihi, aşama değişim anı, son
 * görüşme günü. Bir model çağrısı yok, bir kuruş maliyet yok, gecikme yok —
 * ama kullanıcının "neye bakmalıyım" sorusunun cevabı büyük ölçüde bunlarda.
 *
 * ============================================================================
 * TEK GÖRSEL DİL: mono · küçük punto · nokta
 * ============================================================================
 * Üç sinyal de `Mark` üzerinden çizilir. Ayrı ayrı biçimlendirilseydi kartta
 * üç farklı "küçük yazı" belirir ve hiçbiri diğerinden daha önemli
 * görünmezdi. Ortak biçim, farkı YALNIZCA renge indirger:
 *
 *   sessiz (`fg-3`)  → bilgi. "3 gün önce görüşülmüş."
 *   uyanık (`ink`)   → dikkat. "34 gündür bekliyor."
 *
 * `--danger` HİÇBİRİNDE kullanılmaz: geciken bir takip ya da uzun süredir
 * beklemiş bir fırsat HATA değildir, yapılacak iştir. Sistemde dikkat çeken
 * renk zaten modülün imza rengidir.
 *
 * ⚠️ Bu cümle 2026-08-08'de düzeltildi: eskiden "zaten terracottadır" diyordu
 * ve modül başına renk geldiğinde YANLIŞ hâle geldi. Kural değişmedi (dikkat =
 * `--ink`), yalnızca o token'ın değeri artık modülündür — CRM'de çivit mavisi.
 * Terracotta bundan sonra yalnızca AI'ın sesidir (`--ai-ink`).
 */
/**
 * "Son temas: 3 gün önce" · "47 gündür temas yok" · "Henüz görüşülmedi".
 *
 * ⚠️ `null` ile `0` AYRI ŞEYLERDİR ve karıştırılırsa ekran yalan söyler:
 * hiç görüşülmemiş bir müşteri "bugün görüşüldü" gibi görünürdü. Bu yüzden
 * `null` kendi metnini alır ve UYARI SAYILMAZ — yeni eklenmiş bir müşteriyi
 * "ihmal edilmiş" diye işaretlemek haksızlık olurdu.
 */
export function LastContactMark({ day }: { day: string | null }) {
  if (day === null) {
    return <Mark quiet>Henüz görüşülmedi</Mark>;
  }

  const delta = calendarDayDelta(day);

  // Tarih okunamadıysa gün sayısı UYDURULMAZ; tarihin kendisi yazılır.
  if (delta === null) {
    return <Mark quiet>Son temas: {formatCalendarDay(day)}</Mark>;
  }

  const daysAgo = -delta;

  if (daysAgo <= 0) {
    return <Mark quiet>Son temas: bugün</Mark>;
  }

  if (daysAgo >= quietCompanyDays()) {
    return <Mark>{daysAgo} gündür temas yok</Mark>;
  }

  return <Mark quiet>Son temas: {daysAgo} gün önce</Mark>;
}

/**
 * "34 gündür bekliyor" — fırsat aynı aşamada ne kadar durdu.
 *
 * ============================================================================
 * EŞİĞİN ALTINDA HİÇBİR ŞEY ÇİZİLMEZ
 * ============================================================================
 * Her fırsata "3 gündür bu aşamada" yazmak bilgi değil gürültüdür ve gerçek
 * uyarıyı görünmez kılar. İşaret yalnızca eşik aşıldığında belirir; kartın
 * sessiz kalması "burada sorun yok" demektir.
 *
 * ⚠️ KAPANMIŞ fırsatlarda çizilmez: kazanılmış bir anlaşmanın 200 gündür
 * "kazanıldı" aşamasında durması beklenen şeydir, uyarı değil.
 *
 * Kaynak `stageChangedAt`'tir ve o alan yalnızca GERÇEK aşama değişiminde
 * ilerler (aynı aşamayı tekrar göndermek sinyali sıfırlamaz) — Slice 5'te
 * özellikle sağlanmıştı, okunduğu ikinci yer burası.
 */
export function StageAgeMark({
  stageChangedAt,
  closed,
}: {
  /** UTC ISO-8601. */
  stageChangedAt: string;
  closed: boolean;
}) {
  if (closed) {
    return null;
  }

  // Ana damgası önce YEREL takvim gününe indirgenir; "kaç gündür" sorusu bir
  // takvim sorusudur, saat farkı sorusu değil.
  const delta = calendarDayDelta(localDay(stageChangedAt));

  if (delta === null) {
    return null;
  }

  const days = -delta;

  return days >= staleStageDays() ? <Mark>{days} gündür bekliyor</Mark> : null;
}
