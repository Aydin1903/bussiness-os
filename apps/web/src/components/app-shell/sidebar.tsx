import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import { CustomersIcon, FinanceIcon, OverviewIcon, ProjectsIcon } from '@/components/icons';
import { CompanySwitcher } from './company-switcher';
import { UserMenu } from './user-menu';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly label: string;
  readonly icon: IconType;
  readonly href?: string;
}

/**
 * Gerçek modüller. Bugün tek: Panel.
 *
 * "Bilgi Bankası" ARTIK BURADA DEĞİL — çalışma yüzeyi Panel'in kendisi oldu
 * (sor + not ekle orada). Not arşivine sağ raydaki "Tümünü gör" ile gidilir.
 */
const LIVE: readonly NavItem[] = [{ label: 'Panel', icon: OverviewIcon, href: '/app' }];

/** Henüz gelmemiş modüller. Tıklanabilir görüntü VERİLMEZ: vaat olurdu. */
const SOON: readonly NavItem[] = [
  { label: 'Müşteriler', icon: CustomersIcon },
  { label: 'Finans', icon: FinanceIcon },
  { label: 'Projeler', icon: ProjectsIcon },
];

/**
 * Sol gezinme — üç katman.
 *
 * ============================================================================
 * ÜSTTE ŞİRKET, ALTTA KULLANICI
 * ============================================================================
 * Şirket anahtarı ve kullanıcı menüsü eskiden sağ üstteki başlık şeridindeydi.
 * Çok şirketli bir üründe kullanıcının ilk sorduğu soru "hangi şirketteyim";
 * cevabı artık ilk görülen şey. Kimlik (kim + nerede) solda toplanır, sağ
 * taraf içeriğe kalır.
 *
 * `collapsed` iken ikon-only; mobilde drawer içinde tam genişlikte.
 */
export function Sidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-surface p-2.5">
      {collapsed ? (
        <div className="flex h-[46px] items-center justify-center">
          <span className="text-[13px] font-semibold tracking-tight">BO</span>
        </div>
      ) : (
        <CompanySwitcher />
      )}

      <nav className="mt-5 flex flex-col gap-5" aria-label="Ana gezinme">
        <div className="flex flex-col gap-px">
          {LIVE.map((item) => (
            <LiveRow key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="flex flex-col gap-px">
          {collapsed ? null : (
            <p className="px-2.5 pb-2 font-mono text-[9px] font-semibold tracking-[0.15em] text-fg-3 uppercase">
              Modüller
            </p>
          )}
          {SOON.map((item) => (
            <SoonRow key={item.label} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="flex-1" />

      {collapsed ? null : <UserMenu />}
    </div>
  );
}

const ROW = 'flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px]';

function LiveRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href ?? '/app'}
      title={collapsed ? item.label : undefined}
      className={[
        ROW,
        'relative bg-fill-2 font-semibold text-fg transition-colors',
        // Sol kenardaki amber çubuk: aktif satırın imzası.
        'before:absolute before:top-1/2 before:left-0 before:h-[17px] before:w-[3px]',
        'before:-translate-y-1/2 before:rounded-r-[3px] before:bg-accent',
        collapsed ? 'justify-center' : '',
      ].join(' ')}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <Icon className="shrink-0 text-ink" width={15} height={15} />
      {collapsed ? null : <span>{item.label}</span>}
    </Link>
  );
}

function SoonRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  return (
    <span
      title={collapsed ? `${item.label} (yakında)` : undefined}
      aria-disabled="true"
      className={`${ROW} cursor-not-allowed font-medium text-fg-3 ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className="shrink-0 opacity-40" width={15} height={15} />
      {collapsed ? null : (
        <>
          <span>{item.label}</span>
          <span className="ml-auto rounded-[5px] bg-fill px-1.5 py-[3px] font-mono text-[8px] font-semibold tracking-[0.1em] uppercase">
            yakında
          </span>
        </>
      )}
    </span>
  );
}
