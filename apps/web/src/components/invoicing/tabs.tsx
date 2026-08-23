'use client';

import Link from 'next/link';

/**
 * TEKLİF / FATURA ODASININ ÇALIŞMA YÜZEYLERİ — sekmeler ODA DEĞİŞTİRMEZ
 * (ADR-0038 §6.5).
 *
 * İki rota AYNI ODADIR: aynı duvar (`InvoicingWall`), aynı renk, aynı soru
 * (_"satış evrakımız ne durumda"_). Değişen yalnızca çalışma yüzeyidir —
 * teklif listesi mi, fatura listesi mi.
 *
 * ⚠️ `SupplierTabs`ten olduğu gibi devralınan karar: aktiflik `pathname` ile
 * TÜRETİLMEZ, çağıran AÇIKÇA söyler. Sebep detay sayfalarıdır
 * (`/app/invoicing/quotes/<id>` ve `/app/invoicing/invoices/<id>`): ikisi de
 * bu şeridi HİÇ göstermez (detayın kendi duvarı yoktur) ve `pathname` tabanlı
 * bir kural `/invoices/<id>`de "Faturalar"ı yanlışlıkla aktif gösterirdi.
 */
const TABS = [
  { key: 'quotes', label: 'Teklifler', href: '/app/invoicing' },
  { key: 'invoices', label: 'Faturalar', href: '/app/invoicing/invoices' },
] as const;

export function InvoicingTabs({ active }: { readonly active: 'quotes' | 'invoices' }) {
  return (
    <nav
      aria-label="Satış evrakı bölümleri"
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
              // ⚠️ Renk TEK ayırt edici değil: aktif sekme ayrıca `aria-current`
              // taşır. Bu modülde kural ÖZELLİKLE geçerli — imza rengi
              // (#257c6c) Finans'ın yeşiliyle (#307d54) KOMŞU HUE'dur ve bu
              // çift, koridordaki CRM/Tedarikçi çiftinden DAHA YAKINDIR.
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
