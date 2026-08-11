'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Finans'ın KENDİNE ÖZGÜ kabuk parçası.
 *
 * Başlık şeridi, gövde, düğmeler, boş durum ve sayfalayıcı `module-kit`ten
 * gelir — hiçbiri kopyalanmadı. Burada yalnızca bu modülün SÖZLÜĞÜ var: üç
 * bölüm adı ve üç rota.
 *
 * ============================================================================
 * SIDEBAR'A ÜÇ SATIR EKLENMEDİ
 * ============================================================================
 * İşlemler · Nakit akışı · Kategoriler tek bir modülün üç görünümüdür, üç modül
 * değil (`CrmTabs` / `ProjectTabs` ile aynı gerekçe). Sekme şeridi hiyerarşiyi
 * doğru gösterir: sidebar'da "hangi modüldeyim", başlıkta "modülün neresindeyim".
 *
 * ⚠️ Üç sekme de İLK GÜNDEN çiziliyor — `ProjectTabs`ın 5a'daki kararından
 * FARKLI. Orada ikinci rota henüz YAZILMAMIŞTI ve sekmeyi koymak olmayan bir
 * sayfaya tıklanabilir görüntü vermek olurdu. Burada üçü de aynı slice'ta
 * yazıldı; bekletmek için bir sebep yok.
 */
const TABS: readonly { href: string; label: string }[] = [
  { href: '/app/finance', label: 'İşlemler' },
  { href: '/app/finance/cashflow', label: 'Nakit akışı' },
  { href: '/app/finance/categories', label: 'Kategoriler' },
];

export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Finans bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        // TAM eşleşme: `/app/finance` her Finans yolunun ÖNEKİDİR; önek
        // kontrolü nakit akışı sayfasında "İşlemler"i de aktif gösterirdi.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...(active ? { 'aria-current': 'page' } : {})}
            className={[
              'rounded-full px-[15px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              active ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
