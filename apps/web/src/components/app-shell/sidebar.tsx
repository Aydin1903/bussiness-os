import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import {
  ChevronLeftIcon,
  CustomersIcon,
  FinanceIcon,
  OverviewIcon,
  ProjectsIcon,
} from '@/components/icons';
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
 * Sol gezinme — saydam katman, kendi zemini YOK.
 *
 * ============================================================================
 * ÜSTTE ŞİRKET, ALTTA KULLANICI
 * ============================================================================
 * Çok şirketli bir üründe kullanıcının ilk sorduğu soru "hangi şirketteyim";
 * cevabı ilk görülen şey. Kimlik (kim + nerede) solda toplanır, sağ taraf
 * içeriğe kalır.
 *
 * ============================================================================
 * ZEMİNİ YOK, ÇÜNKÜ KABUK ZEMİNDEN AYRILDI
 * ============================================================================
 * Eskiden `bg-surface` taşıyordu ve içerikten bir çizgiyle ayrılıyordu.
 * Atölye'de derinlik çizgiyle değil KATMANLA kurulur: menü sıcak kağıdın
 * üstünde durur, içerik ondan YÜKSELİR. Menüye de zemin vermek iki yüzen yüzey
 * yaratır ve hangisinin üstte olduğu okunmaz olurdu.
 *
 * `collapsed` iken ikon-only; mobilde çekmece içinde tam genişlikte.
 */
export function Sidebar({
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  /** Yalnızca masaüstünde verilir; çekmecede daraltma diye bir şey yok. */
  onToggleCollapse?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className={collapsed ? 'flex flex-col items-center gap-1' : ''}>
        {collapsed ? (
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent text-[11px] font-bold tracking-[0.02em] text-accent-fg shadow-card">
            BO
          </span>
        ) : (
          <CompanySwitcher />
        )}

        {onToggleCollapse === undefined ? null : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            className={[
              'mt-1.5 hidden h-8 w-8 items-center justify-center rounded-[10px] text-fg-3',
              'transition-colors hover:bg-fill hover:text-fg md:inline-flex',
            ].join(' ')}
          >
            <ChevronLeftIcon
              width={16}
              height={16}
              className={`transition-transform duration-300 ease-rise ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-5" aria-label="Ana gezinme">
        <div className="flex flex-col gap-0.5">
          {collapsed ? null : <GroupLabel>Çalışma</GroupLabel>}
          {LIVE.map((item) => (
            <LiveRow key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          {collapsed ? null : <GroupLabel>Modüller</GroupLabel>}
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

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pb-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
      {children}
    </p>
  );
}

const ROW = 'flex items-center gap-[11px] rounded-[12px] px-3 py-2.5 text-[13.5px]';

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
        'relative bg-tint font-semibold text-fg transition-colors',
        // Sol kenardaki terracotta çubuk: aktif satırın İMZASI — dolgu değil.
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
      className={`${ROW} cursor-not-allowed font-medium text-fg-2 ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className="shrink-0 opacity-55" width={15} height={15} />
      {collapsed ? null : (
        <>
          <span>{item.label}</span>
          {/*
            Rozet 8px'ten 9.5px'e çıktı ve rengi bir kademe koyulaştı: eski
            hâli 2.9:1 veriyordu, WCAG AA sınırı 4.5:1. Küçük punto DAHA FAZLA
            kontrast ister, daha az değil.
          */}
          <span className="ml-auto rounded-[6px] border border-border-strong px-1.5 py-[2px] font-mono text-[9.5px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
            yakında
          </span>
        </>
      )}
    </span>
  );
}
