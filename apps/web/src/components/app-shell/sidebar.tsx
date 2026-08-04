import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import {
  CustomersIcon,
  FinanceIcon,
  KnowledgeIcon,
  OverviewIcon,
  ProjectsIcon,
} from '@/components/icons';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly label: string;
  readonly icon: IconType;
  readonly href?: string;
  readonly soon?: boolean;
}

/**
 * Aktif modüller üstte, "yakında" olanlar altta.
 *
 * "Bilgi Bankası" Faz 4'te GERÇEKTEN geldi (notlar, soru-cevap, günlük rapor);
 * `soon` rozeti kalktı. Diğer üçü hâlâ placeholder — onlara tıklanabilir
 * görüntü vermek, olmayan bir şeyi vaat etmek olurdu.
 */
const NAV: readonly NavItem[] = [
  { label: 'Genel Bakış', icon: OverviewIcon, href: '/app' },
  { label: 'Bilgi Bankası', icon: KnowledgeIcon, href: '/app/knowledge' },
  { label: 'Müşteriler', icon: CustomersIcon, soon: true },
  { label: 'Finans', icon: FinanceIcon, soon: true },
  { label: 'Projeler', icon: ProjectsIcon, soon: true },
];

/**
 * Sol gezinme. `collapsed` iken ikon-only (masaüstü daraltma); mobilde drawer
 * içinde tam genişlikte kullanılır. Nav'a tıklanınca `onNavigate` (mobil drawer'ı
 * kapatmak için) çağrılır.
 */
export function Sidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className={`flex h-14 shrink-0 items-center ${collapsed ? 'justify-center' : 'px-5'}`}>
        <span className="text-sm font-semibold tracking-tight">
          {collapsed ? 'BO' : 'Business OS'}
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-3 py-2" aria-label="Ana gezinme">
        {NAV.map((item) => (
          <NavRow key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

function NavRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const Icon = item.icon;
  const rowBase = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${collapsed ? 'justify-center' : ''}`;

  if (item.soon === true) {
    return (
      <span
        title={collapsed ? `${item.label} (yakında)` : undefined}
        aria-disabled="true"
        className={`${rowBase} cursor-not-allowed text-fg-muted opacity-60`}
      >
        <Icon className="shrink-0" />
        {collapsed ? null : (
          <span className="flex flex-1 items-center justify-between">
            <span>{item.label}</span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              yakında
            </span>
          </span>
        )}
      </span>
    );
  }

  return (
    <Link
      href={item.href ?? '/app'}
      title={collapsed ? item.label : undefined}
      className={`${rowBase} font-medium text-fg transition-colors hover:bg-bg`}
      // onClick yalnızca tanımlıysa (mobil drawer) geçilir — exactOptionalPropertyTypes.
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <Icon className="shrink-0" />
      {collapsed ? null : <span>{item.label}</span>}
    </Link>
  );
}
