import type { Interaction } from '@business-os/contracts';

import { StreamEntry } from '@/components/panel/stream';
import { formatCalendarDay } from '@/lib/format/datetime';

/**
 * Görüşme akışı — Panel'in konuşma ipliği, CRM'deki hâli.
 *
 * ============================================================================
 * NEDEN AYNI İPLİK
 * ============================================================================
 * `StreamEntry` KOPYALANMADI, `panel/stream.tsx`'ten import edildi: zaman
 * sütunu (52px), boşluk (22px), iplik konumu (51px) ve nokta hizası tek bir
 * yerde tanımlı kalmalı. İkinci bir kopya, birinde yapılan hizalama
 * düzeltmesini (bkz. oradaki `DOT_LANE` yorumu — 4 piksellik örtüşme) diğerine
 * taşımamak demekti.
 *
 * ============================================================================
 * ⚠️ VARYANT `you`, `ai` DEĞİL — VE SERİF YOK
 * ============================================================================
 * Görüşme notunu yazan İNSANDIR. Dolu terracotta nokta ve serif "ses",
 * sistemde AI'a ayrılmıştır (FRONTEND_ARCHITECTURE §4.5); bir müşteri
 * görüşmesini o sesle çizmek, kullanıcının kendi yazdığı metni asistanın
 * söylediği bir şey sanmasına yol açardı. Bu yüzden içi boş halka + sans.
 *
 * Metin yine de `text-fg` (birincil): bu akışta AI konuşmuyor, dolayısıyla
 * görüşme ikincil bir ses değil, bölümün ASIL içeriğidir.
 *
 * ============================================================================
 * TARİH: `occurredOn` — GÖRÜŞMENİN OLDUĞU GÜN
 * ============================================================================
 * `createdAt` (kayda geçirildiği an) DEĞİL. Dün yapılan bir görüşme bugün
 * yazılabilir ve akışın kronolojisi görüşmenin kendi gününe göre okunmalıdır.
 * Biçimleme `formatCalendarDay` ile yapılır — takvim gününü `Date`'e çevirmek
 * negatif UTC ofsetlerinde günü bir geriye kaydırırdı.
 */
export function InteractionStream({
  items,
  contactNames,
}: {
  items: readonly Interaction[];
  /** Kişi id → ad. Bilinmeyen id için satır çizilmez, uydurulmaz. */
  contactNames: ReadonlyMap<string, string>;
}) {
  return (
    <div>
      {items.map((item, index) => (
        <StreamEntry
          key={item.id}
          when={formatCalendarDay(item.occurredOn)}
          variant="you"
          last={index === items.length - 1}
        >
          <InteractionBody item={item} contactNames={contactNames} />
        </StreamEntry>
      ))}
    </div>
  );
}

function InteractionBody({
  item,
  contactNames,
}: {
  item: Interaction;
  contactNames: ReadonlyMap<string, string>;
}) {
  const contactName = item.contactId === null ? undefined : contactNames.get(item.contactId);

  return (
    <>
      <p
        className="max-w-[58ch] text-[13.5px] leading-[1.65] whitespace-pre-wrap text-fg"
        style={{ textWrap: 'pretty' }}
      >
        {item.body}
      </p>

      {contactName === undefined ? null : (
        // `SourceMeta` ile aynı ölçü ve ayraç noktası; o bileşen "N nota
        // dayanıyor" metnine özel olduğu için burada satır yeniden yazıldı.
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
          <span
            aria-hidden
            className="h-[3px] w-[3px] shrink-0 rounded-full bg-accent opacity-60"
          />
          {contactName} ile
        </p>
      )}
    </>
  );
}
