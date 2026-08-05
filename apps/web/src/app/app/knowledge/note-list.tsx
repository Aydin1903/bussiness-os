'use client';

import type { NoteListItem } from '@business-os/contracts';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { localDay } from '@/lib/format/datetime';

export const PAGE_SIZE = 20;

/**
 * Not listesi — sayfalı, en yeni önce (Slice A'nın ucu).
 *
 * ⚠️ `preview` TAM METİN DEĞİLDİR. Bir not 500.000 karaktere kadar çıkabilir ve
 * listede tam gövde döndürmek megabaytlarca yanıt demekti (ADR-0029 bilinen
 * sınır). `bodyLength` ile kırpılmış notlar açıkça işaretlenir — kullanıcının
 * "burası bitti mi" diye tahmin etmesi gerekmez.
 *
 * Tam metin bir NOT DETAY ekranının işidir ve o ekran henüz YOK.
 *
 * Veri çekme bu bileşende DEĞİL, üst sayfadadır: `total` bilgisine soru
 * panelinin de ihtiyacı var (notu olmayan tenant'a ipucu gösterilir) ve aynı
 * veriyi iki kez çekmek yanlış olurdu.
 */
export function NoteList({
  items,
  total,
  offset,
  loading,
  error,
  onPrevious,
  onNext,
}: {
  items: readonly NoteListItem[];
  total: number;
  offset: number;
  loading: boolean;
  error: string | null;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasPrevious = offset > 0;
  const hasNext = offset + items.length < total;

  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Notlar</h2>
        <span className="text-sm text-fg-muted">{total} not</span>
      </div>

      <div className="mt-4">
        <FormError message={error} />
      </div>

      {items.length === 0 && error === null ? (
        <p className="mt-2 text-sm text-fg-muted">
          {loading ? 'Yükleniyor…' : 'Henüz not eklenmemiş.'}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {items.map((item) => (
            <NoteRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {hasPrevious || hasNext ? (
        <div className="mt-5 flex items-center gap-3">
          <Button variant="ghost" disabled={!hasPrevious || loading} onClick={onPrevious}>
            Önceki
          </Button>
          <Button variant="ghost" disabled={!hasNext || loading} onClick={onNext}>
            Sonraki
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NoteRow({ item }: { item: NoteListItem }) {
  const truncated = item.bodyLength > item.preview.length;

  return (
    <li className="flex flex-col gap-1 py-4 first:pt-2">
      {item.title === null ? null : <h3 className="text-sm font-medium text-fg">{item.title}</h3>}

      <p className="whitespace-pre-wrap text-sm text-fg-muted">
        {item.preview}
        {truncated ? '…' : ''}
      </p>

      <p className="text-xs text-fg-muted/70">
        {formatDate(item.createdAt)}
        {truncated ? ` · ${String(item.bodyLength)} karakterin ilk kısmı` : ''}
      </p>
    </li>
  );
}

/**
 * `YYYY-MM-DD` — YEREL takvim günü.
 *
 * Eskiden `toISOString().slice(0, 10)` kullanılıyordu ve o UTC gününü
 * veriyordu: UTC+3'te gece yarısından sonra eklenen bir not BİR GÜN GERİDE
 * görünüyordu. Biçim (sabit, locale'siz — hydration gerekçesi) korundu, dilim
 * düzeltildi; ayrıntı `lib/format/datetime.ts`'te.
 */
function formatDate(isoTimestamp: string): string {
  return localDay(isoTimestamp);
}
