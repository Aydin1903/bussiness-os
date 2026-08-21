'use client';

import Link from 'next/link';

/**
 * TEDARİKÇİ ODASININ ÇALIŞMA YÜZEYLERİ — sekmeler ODA DEĞİŞTİRMEZ
 * (ADR-0038 §6.5).
 *
 * İki rota AYNI ODADIR: aynı duvar (`SuppliersWall`), aynı renk, aynı soru
 * (_"tedarikçi ilişkilerimiz ne durumda"_). Değişen yalnızca çalışma
 * yüzeyidir — firma listesi mi, görüşme akışı mı.
 *
 * Bu yüzden şerit `DeskHead`in içindedir, `RoomTop`ta değil.
 *
 * ⚠️ `InventoryTabs`ten olduğu gibi devralınan karar: aktiflik `pathname` ile
 * TÜRETİLMEZ, çağıran AÇIKÇA söyler (`active` prop). Sebep detay sayfasıdır:
 * `/app/suppliers/<id>` bu şeridi HİÇ göstermez (detayın kendi duvarı yoktur)
 * ve `pathname` tabanlı bir kural orada "Tedarikçiler"i yanlışlıkla aktif
 * gösterme riskini taşırdı.
 */
const TABS = [
  { key: 'suppliers', label: 'Tedarikçiler', href: '/app/suppliers' },
  { key: 'interactions', label: 'Görüşmeler', href: '/app/suppliers/interactions' },
] as const;

export function SupplierTabs({ active }: { readonly active: 'suppliers' | 'interactions' }) {
  return (
    <nav
      aria-label="Tedarikçi bölümleri"
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
              // taşır ve gölgeyle zeminden yükselir. ⚠️ Bu modülde kural
              // ÖZELLİKLE geçerli: imza rengi (#5c6cab) CRM'in çivit mavisiyle
              // KOMŞU HUE'dur (`module-colors.css` seçim kuralı 2).
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
