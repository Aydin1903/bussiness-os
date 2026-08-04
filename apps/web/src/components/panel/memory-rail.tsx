import Link from 'next/link';
import type { NoteListItem } from '@business-os/contracts';

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
}: {
  items: readonly NoteListItem[];
  total: number;
  todayCount: number;
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-sunken p-3 pt-4 xl:flex">
      <div className="flex items-baseline justify-between px-2 pb-3">
        <h2 className="font-mono text-[9px] font-semibold tracking-[0.15em] text-fg-3 uppercase">
          Son eklenenler
        </h2>
        {todayCount > 0 ? (
          <span className="text-[11px] text-fg-3 tabular">bugün {todayCount}</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-2 text-[12px] leading-relaxed text-fg-3">
          Henüz not yok. Aşağıdan ekleyin; buraya düşecek.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <RailNote item={item} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />

      {total > 0 ? (
        <Link
          href="/app/knowledge"
          className="mt-2 block rounded-[10px] bg-fill py-2.5 text-center text-[12.5px] font-semibold text-fg transition-colors hover:bg-fill-2"
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
        'group relative flex flex-col gap-0.5 rounded-[10px] px-2.5 py-3',
        'transition-colors hover:bg-fill',
      ].join(' ')}
    >
      {/* Hover'da soldan kayarak giren amber çubuk. */}
      <span
        aria-hidden
        className={[
          'absolute top-3 bottom-3 left-0.5 w-0.5 origin-center scale-y-[0.4] rounded-sm bg-accent',
          'opacity-0 transition-[opacity,transform] duration-200 ease-rise',
          'group-hover:scale-y-100 group-hover:opacity-100',
        ].join(' ')}
      />
      <time className="font-mono text-[9px] font-medium tracking-[0.09em] text-fg-3 uppercase">
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
 * "07:52" · "Dün 18:20" · "3 Ağu".
 *
 * Sabit biçim, `toLocaleDateString` DEĞİL: sunucu ile istemci farklı sonuç
 * verirse Next.js hydration uyuşmazlığı çıkar.
 */
function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return '';
  }

  const date = new Date(parsed);
  const now = new Date();
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isSameDay(date, now)) {
    return clock;
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (isSameDay(date, yesterday)) {
    return `Dün ${clock}`;
  }

  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`;
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
