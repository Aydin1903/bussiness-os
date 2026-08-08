'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  /**
   * Modülün imza rengi anahtarı — `module-colors.css`'teki `[data-module=…]`.
   *
   * Satır kendi rengini TAŞIR, kabuktan almaz. Bunun iki sonucu var:
   * "yakında" satırları da kimliğini gösterebilir, ve Panel bu alanı
   * TAŞIMAZ — Panel bir modül değil, AI'ın kendi yüzeyidir; orada imza rengi
   * terracottadır ve öyle kalmalıdır.
   */
  readonly module?: string;
}

/**
 * Gerçek modüller.
 *
 * "Bilgi Bankası" ARTIK BURADA DEĞİL — çalışma yüzeyi Panel'in kendisi oldu
 * (sor + not ekle orada). Not arşivine sağ raydaki "Tümünü gör" ile gidilir.
 *
 * "Müşteriler" Faz 5 Slice 8a'da SOON'dan buraya taşındı: CRM'in şirket ve
 * kişi ekranları çalışıyor. Bu satırın taşınmaması, Faz 4'te bir kez yaşanan
 * hatanın tekrarı olurdu — modül çalışır hâldeyken sidebar "yakında" rozetini
 * taşımaya devam etmiş ve modül kullanıcı için ERİŞİLEMEZ kalmıştı.
 */
const LIVE: readonly NavItem[] = [
  { label: 'Panel', icon: OverviewIcon, href: '/app' },
  { label: 'Müşteriler', icon: CustomersIcon, href: '/app/crm', module: 'crm' },
];

/**
 * Henüz gelmemiş modüller. Tıklanabilir görüntü VERİLMEZ: vaat olurdu.
 *
 * ⚠️ BURAYA ON İKİ SATIR KONMADI — bilinçli (Product Owner kararı, 2026-08-08).
 * ROADMAP §3.5 on iki modül sayıyor ve hepsinin rengi `module-colors.css`'te
 * hazır. Hepsini listelemek sidebar'ı bir gezinme aracı olmaktan çıkarıp yol
 * haritasına çevirir; kullanıcı her gün ulaşamayacağı on kalem görür. Sıradaki
 * ikisi gösterilir, modül canlandığı gün LIVE'a taşınır.
 *
 * Sıra ROADMAP §3.5'e hizalandı: 2) Projeler, 3) Finans.
 */
const SOON: readonly NavItem[] = [
  { label: 'Projeler', icon: ProjectsIcon, module: 'projects' },
  { label: 'Finans', icon: FinanceIcon, module: 'finance' },
];

/**
 * Aktif satır — EN UZUN eşleşen önek kazanır.
 *
 * ============================================================================
 * NEDEN BASİT BİR `pathname === href` YETMEZ
 * ============================================================================
 * İki canlı satır olduğu andan itibaren aktiflik HESAPLANMAK zorunda: eskiden
 * `LiveRow` vurguyu koşulsuz veriyordu ve tek satır varken bu doğru
 * görünüyordu. İkinci satır eklenince ikisi birden aktif görünürdü.
 *
 * Eşitlik de yetmez: `/app/crm/<id>` detay sayfasındayken "Müşteriler"
 * sönerdi. Önek kontrolü tek başına da yetmez: her yol `/app` ile başladığı
 * için Panel HER SAYFADA aktif olurdu. İkisinin birleşimi — en uzun eşleşen
 * önek — her iki tuzağı da kapatır ve yeni modül eklendiğinde kural
 * DEĞİŞMEDEN çalışmaya devam eder.
 */
function activeHrefOf(pathname: string): string | undefined {
  return LIVE.map((item) => item.href)
    .filter((href): href is string => href !== undefined)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

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
  const activeHref = activeHrefOf(usePathname());

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
            <LiveRow
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={item.href === activeHref}
              onNavigate={onNavigate}
            />
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

/**
 * Aktif satırın imzası: sol kenardaki çubuk + `--tint` dolgu.
 *
 * ⚠️ SINIFLAR DEĞİŞMEDİ, DEĞERLERİ MODÜLÜNDÜR. Satır kendi `data-module`'ünü
 * taşıdığı için `bg-accent`/`bg-tint`/`text-ink` o modülün rengini okur —
 * Müşteriler çivit mavisi, Projeler zeytin. Panel `data-module` taşımaz ve
 * terracotta kalır: o bir modül değil, AI'ın kendi yüzeyidir.
 *
 * Pasif satır hover'da `--fill` alır, `surface`/`raised` DEĞİL: açık temada
 * ikisi de neredeyse beyazdır ve sıcak kağıdın üstünde görünmezdi
 * (`globals.css`'in açıkça uyardığı hata).
 */
const ACTIVE_ROW = [
  'relative bg-tint font-semibold text-fg',
  'before:absolute before:top-1/2 before:left-0 before:h-[17px] before:w-[3px]',
  'before:-translate-y-1/2 before:rounded-r-[3px] before:bg-accent',
].join(' ');

const INACTIVE_ROW = 'font-medium text-fg-2 hover:bg-fill hover:text-fg';

function LiveRow({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href ?? '/app'}
      title={collapsed ? item.label : undefined}
      {...(item.module ? { 'data-module': item.module } : {})}
      {...(active ? { 'aria-current': 'page' } : {})}
      className={[
        ROW,
        'transition-colors',
        active ? ACTIVE_ROW : INACTIVE_ROW,
        collapsed ? 'justify-center' : '',
      ].join(' ')}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <Icon className={`shrink-0 ${active ? 'text-ink' : ''}`} width={15} height={15} />
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
      {...(item.module ? { 'data-module': item.module } : {})}
      className={`${ROW} cursor-not-allowed font-medium text-fg-2 ${collapsed ? 'justify-center' : ''}`}
    >
      {/*
        İkon modülün rengini SOLUK taşır: kimliğini gösterir ama canlı satırla
        karıştırılmaz. Renk burada TEK bilgi taşıyıcısı değildir — yanındaki
        etiket ve "yakında" rozeti aynı şeyi zaten söyler; renk körlüğü altında
        satır hiçbir anlam kaybetmez.
      */}
      <Icon className="shrink-0 text-ink opacity-55" width={15} height={15} />
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
