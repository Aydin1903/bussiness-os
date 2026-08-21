'use client';

import Link from 'next/link';

/**
 * STOK ODASININ ÇALIŞMA YÜZEYLERİ — sekmeler ODA DEĞİŞTİRMEZ (ADR-0038 §6.5).
 *
 * ============================================================================
 * ⚠️ BU BİR GEZİNME DEĞİL, TEZGAH DEĞİŞTİRME
 * ============================================================================
 * İki rota AYNI ODADIR: aynı duvar (`InventoryWall`), aynı renk, aynı soru
 * (_"stok durumu ne"_). Değişen yalnızca çalışma yüzeyidir — kalem listesi mi,
 * hareket defteri mi.
 *
 * Bu yüzden şerit `DeskHead`in içindedir, `RoomTop`ta değil: üst şerit odanın
 * kimliğini ve birincil eylemini taşır; tezgah başlığı ise hangi yüzeyde
 * olduğumuzu söyler.
 *
 * ⚠️ `ProjectTabs`ten FARK: aktiflik `pathname` ile TÜRETİLMEZ, çağıran
 * AÇIKÇA söyler (`active` prop). Sebep detay sayfasıdır: `/app/inventory/<id>`
 * bu şeridi HİÇ göstermez (detayın kendi duvarı yoktur — ADR-0038 §6.5) ve
 * `pathname` tabanlı bir kural orada "kalemler"i yanlışlıkla aktif gösterme
 * riskini taşırdı. Açık prop, o riski tümüyle ortadan kaldırır.
 */
const TABS = [
  { key: 'items', label: 'Kalemler', href: '/app/inventory' },
  { key: 'movements', label: 'Hareketler', href: '/app/inventory/movements' },
] as const;

export function InventoryTabs({ active }: { readonly active: 'items' | 'movements' }) {
  return (
    <nav
      aria-label="Stok bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        const current = tab.key === active;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...(current ? { 'aria-current': 'page' } : {})}
            className={[
              'rounded-full px-[15px] py-[6px] text-[12px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              // Renk TEK ayırt edici değil: aktif sekme ayrıca `aria-current`
              // taşır ve gölgeyle zeminden yükselir.
              current ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
