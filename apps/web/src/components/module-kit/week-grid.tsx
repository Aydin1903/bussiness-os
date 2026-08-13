'use client';

import type { ReactNode } from 'react';

/**
 * HAFTALIK ZAMAN ARALIĞI GRİDİ — modül kitinin genel parçası.
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN "RANDEVU" KELİMESİNİ BİLMEZ
 * ============================================================================
 * Tek bir prop, tip ya da değişken adında "appointment" geçmez. Bildiği şey
 * şudur: bir hafta, ve o haftaya düşen ZAMAN ARALIĞI BLOKLARI.
 *
 * Kabul ölçütü ADR-0033 Slice 5a'nın kurduğu kuraldır ve SERTTİR: "ikinci modül
 * bir şeyin genel olup olmadığını öğrendiğimiz yerdir." Burada üçüncü bir
 * tüketici daha bugünden görünüyor — Projeler'in zaman çizelgesi ve ileride
 * İK'nın vardiya listesi aynı şekli ister. Bileşen randevuya özgü olsaydı o gün
 * ikinci bir kopya doğardı.
 *
 * ⚠️ Sınav basit: bu dosyada `serviceNote`, `noShow` ya da `contactName` gibi
 * bir alan görürsen bileşen modül klasörüne AİTTİR, buraya değil.
 *
 * ============================================================================
 * NEDEN KÜTÜPHANE YOK (ADR-0035 §7a)
 * ============================================================================
 * FullCalendar / `react-big-calendar` REDDEDİLDİ — bar grafikte `recharts`'ın
 * reddedildiği aynı gerekçe:
 *
 *   - Yüzeyin %90'ı kullanılmayacak: sürükle-bırak, kaynak havuzu, tekrar
 *     kuralları (RRULE), zaman dilimi motoru, altı görünüm. v1'in istediği tek
 *     şey yedi sütun, saat satırları ve doğru yere konmuş bloklar.
 *   - Tasarım dili çatışır: "Atölye" kendi tipografisini ve token'larını
 *     taşıyor; dışarıdan gelen CSS'i ezmek, bileşeni sıfırdan yazmaktan DAHA
 *     PAHALI olur.
 *   - ⚠️ Modül başına imza rengi mekanizması `--accent`/`--tint` token'larına
 *     dayanır. Dışarıdan gelen bir takvim kendi renklerini kullanır ve
 *     `data-module` alt ağaç override'ı ona İŞLEMEZ — sonuç, modülün renginde
 *     olmayan bir takvim olurdu ve hata SESSİZ olurdu.
 *
 * ============================================================================
 * ÇAKIŞAN BLOKLAR YAN YANA — ENGELLENMEZ (ADR-0035 §2e)
 * ============================================================================
 * Aynı ana düşen iki blok MEŞRUDUR: çakışma kontrolü bilinçli olarak yoktur
 * (tek takvimde çakışma bir hatadır, iki personelli bir işletmede NORMALDİR).
 * Grid bu yüzden çakışmayı GİZLEMEZ, GÖRÜNÜR kılar: her blok kendi şeridini
 * alır ve sütunu paylaşır. Biri diğerinin üstüne çizilseydi kullanıcı ikinci
 * kaydın varlığını HİÇ göremezdi.
 */

/**
 * Bloğun görsel tonu.
 *
 * ⚠️ Ton İSİMLERİ DURUM ADI DEĞİLDİR (`completed`, `no_show` gibi): o adlar
 * modülün sözlüğüdür ve bileşeni ona bağlardı. Buradaki isimler GÖRSEL
 * ROLLERDİR; hangi durumun hangi tonu aldığına çağıran karar verir.
 */
export type BlockTone = 'accent' | 'quiet' | 'danger' | 'muted';

/** Grid'in çizdiği tek birim — modülden bağımsız. */
export interface TimeBlock {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Blok üstünde görünen kısa metin. */
  readonly label: string;
  /** İkinci satır; dar bloklarda gizlenir. */
  readonly detail?: string;
  readonly tone: BlockTone;
}

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const DAYS = 7;

/** Pazartesi başlangıçlı gün adları — `Intl` yerine sabit: tek dil, tek satır. */
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/**
 * Ton → sınıf eşlemesi.
 *
 * ⚠️ `bg-accent`/`text-ink` MODÜLÜN rengini okur: `data-module` alt ağacında
 * `--accent` ezilmiştir ve bu bileşen o değeri hiç bilmeden kullanır. Kendi
 * renk sabitlerini yazsaydı modül rengi mekanizması bu ekranda ÇALIŞMAZDI.
 */
const TONE_CLASSES: Readonly<Record<BlockTone, string>> = {
  accent: 'bg-tint-2 text-ink border-l-[3px] border-l-accent',
  quiet: 'bg-fill text-fg-2 border-l-[3px] border-l-border-strong',
  danger: 'bg-danger/10 text-danger border-l-[3px] border-l-danger',
  muted: 'bg-fill/60 text-fg-3 border-l-[3px] border-l-border line-through',
};

/**
 * Haftanın başlangıcını (Pazartesi 00:00, YEREL) verir.
 *
 * ⚠️ YEREL SAAT KULLANILIR ve bu bilinçlidir: kullanıcı haftayı kendi
 * takviminde görür. Sunucu UTC döndürür (ADR-0035 §2c), çevrimi istemci yapar
 * ve bu fonksiyon o çevrimin yapıldığı yerdir.
 */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // `getDay()` Pazar=0 döndürür; Pazartesi'yi 0 yapmak için kaydırılır.
  const weekday = (start.getDay() + 6) % DAYS;
  start.setDate(start.getDate() - weekday);
  return start;
}

/** `weekStart`tan `days` gün sonrası — DST'ye dayanıklı (saat sıfırlanır). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Bir günün bloklarını ŞERİTLERE dağıtır — çakışanlar yan yana dursun diye.
 *
 * Açgözlü algoritma: bloklar başlangıca göre sıralanır, her blok BİTMİŞ bir
 * şeridin ilkine yerleşir; hiçbiri boş değilse yeni şerit açılır. Sonuç, o
 * gündeki EN FAZLA eşzamanlı blok sayısı kadar şerittir.
 *
 * ⚠️ Şerit sayısı GÜN BAŞINA hesaplanır, hafta başına değil: tek bir yoğun gün
 * yüzünden haftanın tamamını daraltmak, boş günleri okunmaz yapardı.
 */
function assignLanes(blocks: readonly TimeBlock[]): {
  readonly laneCount: number;
  readonly placed: readonly { readonly block: TimeBlock; readonly lane: number }[];
} {
  const sorted = [...blocks].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );

  /** Her şeridin şu ana kadarki EN GEÇ bitiş anı. */
  const laneEnds: number[] = [];
  const placed: { block: TimeBlock; lane: number }[] = [];

  for (const block of sorted) {
    const start = block.startsAt.getTime();
    let lane = laneEnds.findIndex((end) => end <= start);

    if (lane === -1) {
      lane = laneEnds.length;
    }

    laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, block.endsAt.getTime());
    placed.push({ block, lane });
  }

  return { laneCount: Math.max(laneEnds.length, 1), placed };
}

export function WeekGrid({
  weekStart,
  blocks,
  dayStartHour = 8,
  dayEndHour = 20,
  onSelectBlock,
  emptyLabel = 'Bu hafta kayıt yok.',
}: {
  /** Haftanın ilk günü (Pazartesi 00:00 yerel) — `startOfWeek` ile üretilir. */
  weekStart: Date;
  blocks: readonly TimeBlock[];
  /** Görünen ilk saat. Dışına düşen bloklar KIRPILMAZ, sınıra yapışır. */
  dayStartHour?: number;
  dayEndHour?: number;
  onSelectBlock?: (id: string) => void;
  emptyLabel?: string;
}): ReactNode {
  const totalMinutes = (dayEndHour - dayStartHour) * MINUTES_PER_HOUR;
  const hours = Array.from(
    { length: dayEndHour - dayStartHour + 1 },
    (_, index) => dayStartHour + index,
  );

  const days = Array.from({ length: DAYS }, (_, index) => addDays(weekStart, index));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="min-w-0 overflow-x-auto">
      {/* ⚠️ `min-width`: dar ekranda sütunlar okunmaz hâle gelmesin diye grid
          KÜÇÜLMEZ, kaydırılır. Sayfa gövdesi yatay kaymaz — kayan yalnızca bu
          kutudur (artifact/responsive kuralıyla aynı disiplin). */}
      <div className="min-w-[46rem]">
        {/* Gün başlıkları */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: `3.25rem repeat(${String(DAYS)}, minmax(0, 1fr))` }}
        >
          <div />
          {days.map((day, index) => {
            const isToday = day.getTime() === today.getTime();
            return (
              <div
                key={day.toISOString()}
                className={`px-2 py-2 text-center text-[11.5px] tracking-[-0.004em] ${
                  isToday ? 'font-semibold text-ink' : 'text-fg-3'
                }`}
              >
                <span>{DAY_LABELS[index]}</span>{' '}
                <span className="font-mono text-[11px]">{day.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* Saat satırları + bloklar */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `3.25rem repeat(${String(DAYS)}, minmax(0, 1fr))` }}
        >
          {/* Saat etiketleri sütunu */}
          <div className="relative" style={{ height: `${String(totalMinutes * 0.9)}px` }}>
            {hours.slice(0, -1).map((hour, index) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-mono text-[10.5px] text-fg-3"
                style={{ top: `${String(index * MINUTES_PER_HOUR * 0.9)}px` }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEnd = addDays(day, 1);
            const dayBlocks = blocks.filter(
              (block) => block.startsAt >= day && block.startsAt < dayEnd,
            );
            const { laneCount, placed } = assignLanes(dayBlocks);

            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-border"
                style={{ height: `${String(totalMinutes * 0.9)}px` }}
              >
                {/* Saat çizgileri */}
                {hours.slice(0, -1).map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: `${String(index * MINUTES_PER_HOUR * 0.9)}px` }}
                  />
                ))}

                {placed.map(({ block, lane }) => {
                  const startMinutes =
                    (block.startsAt.getTime() - day.getTime()) / MS_PER_MINUTE -
                    dayStartHour * MINUTES_PER_HOUR;
                  const lengthMinutes =
                    (block.endsAt.getTime() - block.startsAt.getTime()) / MS_PER_MINUTE;

                  // ⚠️ Görünen pencerenin DIŞINA düşen blok KIRPILMAZ, sınıra
                  // yapışır: gece 02:00'deki bir kayıt ekrandan tamamen
                  // kaybolsaydı kullanıcı onun VARLIĞINI hiç öğrenemezdi.
                  const top = Math.max(0, Math.min(startMinutes, totalMinutes - 12));
                  const height = Math.max(18, Math.min(lengthMinutes, totalMinutes - top));

                  const width = 100 / laneCount;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={
                        onSelectBlock === undefined
                          ? undefined
                          : () => {
                              onSelectBlock(block.id);
                            }
                      }
                      // ⚠️ `title` çakışan dar bloklarda TEK okunabilir yol:
                      // şerit daraldıkça metin kırpılır ama ipucu kalır.
                      title={
                        block.detail === undefined
                          ? block.label
                          : `${block.label} · ${block.detail}`
                      }
                      className={`absolute overflow-hidden rounded-[7px] px-1.5 py-1 text-left text-[11px] leading-[1.35] transition-opacity hover:opacity-85 ${TONE_CLASSES[block.tone]}`}
                      style={{
                        top: `${String(top * 0.9)}px`,
                        height: `${String(height * 0.9)}px`,
                        left: `calc(${String(lane * width)}% + 2px)`,
                        width: `calc(${String(width)}% - 4px)`,
                      }}
                    >
                      <span className="block truncate font-medium">{block.label}</span>
                      {block.detail === undefined ? null : (
                        <span className="block truncate opacity-75">{block.detail}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {blocks.length === 0 ? (
          <p className="border-t border-border px-4 py-8 text-center text-[12.5px] text-fg-3">
            {emptyLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
