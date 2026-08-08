'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Rise } from '@/components/panel/stream';

/**
 * CRM kabuğu — Panel'de kurulmuş iskeletin CRM'deki karşılığı.
 *
 * ============================================================================
 * BURADA YENİ TASARIM YOKTUR
 * ============================================================================
 * Her ölçü Panel'den GELİR, yeniden seçilmez:
 *   başlık şeridi  → `panel-screen.tsx › PanelHeader`
 *   bölüm etiketi  → `sidebar.tsx › GroupLabel`
 *   hap düğme      → `stream.tsx › FollowUpChips`
 * Bir sayı değiştirilecekse önce oradaki karşılığı değişmelidir; iki yerde
 * ayrı ayrı seçilen bir ölçü, üçüncü ekranda üçüncü kez seçilir ve sistem
 * dağılır.
 *
 * `Rise` de KOPYALANMADI, `stream.tsx`'ten import edilir: giriş hareketinin
 * tek bir tanımı olmalı (FRONTEND_ARCHITECTURE §4.6).
 * ============================================================================
 */

/** Giriş sahnelemesi — Panel'in `RISE` sabitiyle aynı kademeler. */
export const RISE = { title: 0, action: 60, body: 180 } as const;

/**
 * Sayfa başlığı — `PanelHeader` ile AYNI şerit.
 *
 * Sağ slot serbesttir: 8a'da birincil eylem (Yeni şirket), 8b'de bölüm
 * sekmeleri oraya girer. Bileşenin 8b'de değişmesi gerekmesin diye slot
 * `ReactNode`; "sekme" diye özel bir prop tanımlamak, üçüncü kullanımda
 * dördüncü bir prop doğururdu.
 */
export function CrmHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-border px-5 py-5 md:px-10">
      <Rise delay={RISE.title}>
        <h1 className="text-[15px] font-semibold tracking-[-0.022em]">{title}</h1>
        <p className="mt-0.5 text-[11.5px] tracking-[-0.004em] text-fg-3">{subtitle}</p>
      </Rise>

      {right === undefined ? null : <Rise delay={RISE.action}>{right}</Rise>}
    </header>
  );
}

/**
 * Bölüm sekmeleri — `composer.tsx`'in segment kontrolü, gezinme hâlinde.
 *
 * ============================================================================
 * ⚠️ VERİ MODELİ "company" DER, ARAYÜZ "Müşteri" DER — bu bilinçli
 * ============================================================================
 * Tablo `crm.companies`, tip `Company`, uç `/crm/companies`. Ekranda ise
 * "Müşteri" yazar ve öyle kalmalı. İki gerekçe:
 *
 * 1. DÜKKÂNCI TESTİ — hiç CRM kullanmamış biri "şirket kaydı" değil "müşteri"
 *    arar. Ürünün dili kullanıcının dili olmalı, şemanın dili değil.
 * 2. ÇAKIŞMAYI ÇÖZER — "Şirket" bu üründe ZATEN doludur: tenant seçici
 *    kullanıcının KENDİ şirketini öyle adlandırıyor ("Şirket seç"). CRM'in
 *    müşterisine de "şirket" demek, aynı ekranda aynı kelimeyi iki farklı
 *    şeye kullanmaktı.
 *
 * Kodda ve yorumlarda "şirket/company" DEĞİŞTİRİLMEDİ: orada kastedilen şey
 * gerçekten tablodur. Ayrım kasıtlıdır, tutarsızlık değildir — birini diğerine
 * uydurmak isteyen bir sonraki okuyucu önce bunu okusun.
 *
 * ============================================================================
 * SIDEBAR'A ÜÇ SATIR EKLENMEDİ
 * ============================================================================
 * Müşteriler · Fırsatlar · Takipler tek bir modülün üç görünümüdür, üç modül
 * değil.
 * Sol menüye üç satır koymak, CRM'i Finans ve Projeler'le aynı ağırlıkta üç
 * kaleme bölerdi. Sekme şeridi hiyerarşiyi doğru gösterir: sidebar'da "hangi
 * modüldeyim", başlıkta "modülün neresindeyim".
 *
 * ============================================================================
 * 8a'DA ÇİZİLMEDİ — VAAT ETMEMEK İÇİN
 * ============================================================================
 * Fırsatlar ve Takipler rotaları 8b'de doğdu. Sekmeleri 8a'da koymak, olmayan
 * iki sayfaya tıklanabilir görüntü vermek olurdu (`sidebar.tsx`'in "yakında"
 * satırı için yazılmış kuralın aynısı).
 */
const TABS: readonly { href: string; label: string }[] = [
  { href: '/app/crm', label: 'Müşteriler' },
  { href: '/app/crm/pipeline', label: 'Fırsatlar' },
  { href: '/app/crm/follow-ups', label: 'Takipler' },
];

export function CrmTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="CRM bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        // TAM eşleşme: `/app/crm` her CRM yolunun ÖNEKİDİR; önek kontrolü
        // müşteri detayında "Müşteriler"i de "Fırsatlar"ı da aktif gösterirdi.
        // Detay sayfası zaten hiçbir sekmeye ait değildir ve hiçbiri yanmaz —
        // orada aktiflik iddiası yanlış olurdu.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...(active ? { 'aria-current': 'page' } : {})}
            className={[
              'rounded-full px-[17px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
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

/** Kaydırılan içerik alanı — Panel'in okunur genişliğiyle aynı (720px). */
export function CrmBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-8 pb-10 md:px-10">{children}</div>
    </div>
  );
}

/** Bölüm etiketi — `sidebar.tsx › GroupLabel` ile birebir aynı reçete. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
      {children}
    </h2>
  );
}

/**
 * Hap düğme — `FollowUpChips`'in tek düğmelik hâli.
 *
 * Sınıf dizisi oradan KOPYALANDI ve bilinçli: `FollowUpChips` bir liste
 * bileşenidir (`items` + `onPick`), tek bir eylem düğmesi olarak
 * kullanılamazdı. Ortak bir `Chip` çıkarmak `stream.tsx`'i değiştirmek
 * demekti — istenmedikçe refactor yok (CLAUDE.md kural 2).
 */
const PILL = [
  'inline-flex items-center gap-[7px] rounded-full border border-border bg-raised',
  'px-[15px] py-[9px] text-[12.5px] font-medium tracking-[-0.008em] text-fg shadow-card',
  'transition-[transform,box-shadow,border-color,color] duration-[260ms] ease-rise',
  'hover:-translate-y-[2px] hover:border-tint-2 hover:text-ink hover:shadow-float',
  'active:translate-y-0 active:shadow-card',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
  'disabled:hover:border-border disabled:hover:text-fg disabled:hover:shadow-card',
].join(' ');

export function PillButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      disabled={disabled}
      {...(onClick ? { onClick } : {})}
      className={PILL}
    >
      {children}
    </button>
  );
}

/**
 * Birincil eylem — `composer.tsx`'in Gönder düğmesiyle aynı dolgu.
 *
 * İmza rengi gradyanı (`accent → ink`) + iç ışık çizgisi; sistemde "asıl
 * yapılacak iş" bu görünümü taşır ve ekran başına BİR TANE olur.
 *
 * Renk modülündür: CRM'de çivit mavisi, Finans'ta yosun yeşili. Gradyanın iki
 * ucu on iki rengin hepsinde doğru yönde durur — `--ink` açık temada
 * `--accent`'ten koyu, koyu temada açıktır — yani `--accent-fg` kontrastı
 * gradyanın her noktasında tutar (`module-colors.css`'teki ölçüm tablosu).
 */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      disabled={disabled}
      {...(onClick ? { onClick } : {})}
      className={[
        'inline-flex shrink-0 items-center gap-[7px] rounded-card px-[18px] py-[11px]',
        'bg-linear-150 from-accent to-ink text-[13px] font-semibold tracking-[-0.008em]',
        'text-accent-fg shadow-card inset-shadow-[0_1px_0_rgba(255,255,255,0.2)]',
        'transition-[filter,transform,box-shadow] duration-150 ease-rise',
        'hover:-translate-y-px hover:shadow-float hover:saturate-[1.08]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/**
 * Boş durum — SAKİN.
 *
 * Panel'in boş hâliyle aynı ton: ne yapılacağını söyler, uyarı gibi
 * görünmez. `degraded` ayrımı Panel'den taşınan bir DOĞRULUK kuralıdır —
 * "hiç kayıt yok" ile "getiremedim" aynı ekrana düşerse kullanıcı var olan
 * verisini kaybolmuş sanar (`memory-rail.tsx` aynı ayrımı yapar).
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface px-5 py-6 shadow-card">
      <p className="text-[13.5px] font-semibold tracking-[-0.008em] text-fg">{title}</p>
      <p className="max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">{hint}</p>
      {action}
    </div>
  );
}

/**
 * Sayfalayıcı — `note-list.tsx`'in mantığı, Atölye'nin görünümü.
 *
 * Sınır hesabı oradan alındı: `hasNext`, `total` ile karşılaştırmadan
 * TÜRETİLİR; sunucunun döndürdüğü sayıya güvenilir, istemci ayrı bir sayaç
 * tutmaz.
 */
export function Pager({
  offset,
  count,
  total,
  loading,
  onPrevious,
  onNext,
}: {
  offset: number;
  count: number;
  total: number;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasPrevious = offset > 0;
  const hasNext = offset + count < total;

  if (!hasPrevious && !hasNext) {
    return null;
  }

  return (
    <div className="mt-6 flex items-center gap-2.5">
      <PillButton disabled={!hasPrevious || loading} onClick={onPrevious}>
        Önceki
      </PillButton>
      <PillButton disabled={!hasNext || loading} onClick={onNext}>
        Sonraki
      </PillButton>
      <span className="ml-auto font-mono text-[10px] tracking-[0.08em] text-fg-3 uppercase tabular">
        {offset + 1}–{offset + count} / {total}
      </span>
    </div>
  );
}
