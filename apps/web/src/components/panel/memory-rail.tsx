import Link from 'next/link';
import type { NoteListItem } from '@business-os/contracts';

import { localRelativeWhen } from '@/lib/format/datetime';

/**
 * Sağ ray — hafızaya son eklenenler.
 *
 * Hafızayı GÖRÜNÜR kılar: kullanıcı "içeride ne var" sorusunu sormak için
 * başka bir sayfaya gitmek zorunda kalmaz. Tam arşiv (sayfalama, yeniden
 * indeksleme) `/app/knowledge`'te kalır ve buradan tek bağlantıyla ulaşılır.
 *
 * `≥1280px`'de görünür; altında gizlenir — dar ekranda üç sütun okunabilir
 * ölçüyü (57ch) yok ederdi. Rayın taşıdığı bilgi zaten üstteki canlı satırda
 * özetleniyor, yani gizlemek bilgi kaybı değil.
 */
export function MemoryRail({
  items,
  total,
  todayCount,
  degraded = false,
}: {
  items: readonly NoteListItem[];
  total: number;
  todayCount: number;
  /** Not listesi çekilemediyse ray "not yok" DEMEZ — bilmediğini söyler. */
  degraded?: boolean;
}) {
  return (
    <aside className="hidden w-[296px] shrink-0 flex-col gap-2 border-l border-border p-3 pt-4 xl:flex">
      <div className="flex items-baseline justify-between px-3 pb-3">
        <h2 className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
          Son eklenenler
        </h2>
        {todayCount > 0 ? (
          <span className="text-[11.5px] text-fg-3 tabular">bugün {todayCount}</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-3 text-[12px] leading-relaxed text-fg-3">
          {degraded
            ? 'Son eklenenler şu an getirilemedi.'
            : 'Henüz not yok. Aşağıdan ekleyin; buraya düşecek.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <RailNote item={item} />
            </li>
          ))}
        </ul>
      )}

      {total > 0 ? (
        <Link
          href="/app/knowledge"
          className={[
            'mt-auto block rounded-card border border-border bg-surface py-3 text-center',
            'text-[12.5px] font-semibold tracking-[-0.008em] text-fg shadow-card',
            'transition-[transform,box-shadow,color] duration-[260ms] ease-rise',
            'hover:-translate-y-[2px] hover:text-ink hover:shadow-float',
          ].join(' ')}
        >
          Tümünü gör ({total})
        </Link>
      ) : null}
    </aside>
  );
}

function RailNote({ item }: { item: NoteListItem }) {
  return (
    <div
      className={[
        'group relative flex flex-col gap-[5px] overflow-hidden rounded-card px-[15px] py-[13px]',
        'border border-border bg-surface shadow-card',
        'transition-[transform,box-shadow] duration-[260ms] ease-rise',
        'hover:-translate-y-[2px] hover:shadow-float',
      ].join(' ')}
    >
      {/* Hover'da kenardan ısınan terracotta çubuk. */}
      <span
        aria-hidden
        className={[
          'absolute top-3 bottom-3 left-0 w-[2.5px] origin-center scale-y-[0.25] rounded-r-[3px] bg-accent',
          'opacity-0 transition-[opacity,transform] duration-[260ms] ease-rise',
          'group-hover:scale-y-100 group-hover:opacity-100',
        ].join(' ')}
      />
      <time className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase">
        {formatWhen(item.createdAt)}
      </time>
      {item.title === null ? null : (
        <h3 className="text-[12.5px] font-semibold tracking-[-0.008em] text-fg">{item.title}</h3>
      )}
      <p className="line-clamp-2 text-[12px] leading-[1.52] text-fg-2">{item.preview}</p>
    </div>
  );
}

/**
 * "07:52" · "Dün 18:20" · "3 Ağu" — hepsi tarayıcının YEREL saatinde.
 *
 * Uygulama `lib/format/datetime.ts`'e taşındı: aynı dönüşüm üç ayrı yerde
 * kopyalanmıştı ve birinde (`note-list`) UTC'ye kaymıştı.
 */
function formatWhen(iso: string): string {
  return localRelativeWhen(iso);
}
