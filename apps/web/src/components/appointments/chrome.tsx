'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { AppointmentStatus } from '@business-os/contracts';
import { APPOINTMENT_STATUS_LABELS } from '@business-os/contracts';

import type { BlockTone } from '@/components/module-kit/week-grid';

/**
 * Randevu'nun KENDİNE ÖZGÜ kabuk parçaları.
 *
 * Başlık şeridi, gövde, düğmeler, boş durum ve sayfalayıcı `module-kit`ten
 * gelir — hiçbiri kopyalanmadı. Burada yalnızca bu modülün SÖZLÜĞÜ var: iki
 * bölüm adı, iki rota ve durum → görsel ton eşlemesi.
 */
const TABS: readonly { href: string; label: string }[] = [
  { href: '/app/appointments', label: 'Takvim' },
  { href: '/app/appointments/list', label: 'Liste' },
];

/**
 * ⚠️ SIDEBAR'A İKİ SATIR EKLENMEDİ.
 *
 * Takvim · Liste tek bir modülün iki GÖRÜNÜMÜDÜR, iki modül değil (`CrmTabs` /
 * `ProjectTabs`ın aynı gerekçesi). Sekme şeridi hiyerarşiyi doğru gösterir:
 * sidebar'da "hangi modüldeyim", başlıkta "modülün neresindeyim".
 *
 * ⚠️ Şerit İLK GÜNDEN çiziliyor — Projeler'de 5b'ye ertelenmişti çünkü ikinci
 * rota o gün yoktu. Burada iki rota AYNI slice'ta yazıldı, dolayısıyla olmayan
 * bir sayfaya tıklanabilir görüntü verme riski YOK.
 */
export function AppointmentTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Randevu bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        // TAM eşleşme: `/app/appointments` her randevu yolunun ÖNEKİDİR.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-full px-3 py-[5px] text-[11.5px] tracking-[-0.004em] transition-colors',
              active
                ? 'bg-raised font-semibold text-fg shadow-card'
                : 'font-medium text-fg-2 hover:text-fg',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Durum → GÖRSEL TON eşlemesi (ADR-0035 §2a, §2b).
 *
 * ============================================================================
 * ⚠️ BU EŞLEME BURADA, `WeekGrid`TE DEĞİL
 * ============================================================================
 * Grid ton İSİMLERİNİ bilir (`accent`, `quiet`, `danger`, `muted`) ama
 * `no_show`un ne olduğunu BİLMEZ — bilseydi modül kiti bu modüle bağlanırdı.
 * Sözlük modülündür; eşleme de öyle.
 *
 * ⚠️ `no_show` `cancelled`DAN AYRI TON ALIR ve bu, ADR-0035 §2b'nin ekrandaki
 * karşılığıdır: iptal bir HABERDİR (soluk, üstü çizili — yer boşaldı),
 * gelmemek bir KAYIPTIR (`danger` — ayrılan zaman boşa gitti). Aynı tonu
 * paylaşsalardı kullanıcı ikisini ayırt edemez ve "gelmedi oranı" sinyali
 * ekranda GÖRÜNMEZ olurdu.
 *
 * ⚠️ RENK TEK BİLGİ TAŞIYICISI DEĞİL: her blok durum etiketini de yazar ve
 * iptal ayrıca ÜSTÜ ÇİZİLİDİR (renk körlüğü — FRONTEND §4.8).
 */
export const STATUS_TONES: Readonly<Record<AppointmentStatus, BlockTone>> = {
  scheduled: 'accent',
  completed: 'quiet',
  cancelled: 'muted',
  no_show: 'danger',
};

/** Durum rozeti — listede ve formda aynı dil. */
export function StatusPill({ status }: { status: AppointmentStatus }) {
  const tone =
    status === 'no_show'
      ? 'border-danger/30 bg-danger/10 text-danger'
      : status === 'scheduled'
        ? 'border-accent/30 bg-tint text-ink'
        : 'border-border-strong bg-fill text-fg-2';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold tracking-[0.01em] ${tone}`}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
