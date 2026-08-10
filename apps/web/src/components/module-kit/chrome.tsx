'use client';

import type { ReactNode } from 'react';

import { Rise } from '@/components/panel/stream';

/**
 * MODÜL KİTİ — Atölye'nin modül ekranlarında tekrar eden parçaları.
 *
 * ============================================================================
 * NEDEN VAR: İKİNCİ MODÜL, BİR ŞEYİN GENEL OLUP OLMADIĞINI ÖĞRENDİĞİMİZ YER
 * ============================================================================
 * Bu parçalar `components/crm/chrome.tsx` içinde DOĞDU ve orada doğru yerdeydi:
 * o gün tek modül vardı ve "genel" olduklarını iddia etmenin kanıtı yoktu.
 * Projeler (ADR-0033 Slice 5) ikinci tüketici oldu ve kanıt geldi — hiçbirinin
 * içinde CRM'e özgü tek bir şey yok.
 *
 * Alternatif Projeler'e kopyalamaktı ve REDDEDİLDİ: ~250 satırlık kopya, üçüncü
 * modülde (Finans) üçüncü kopya demekti ve kopyalar zamanla sapardı. `chrome.tsx`
 * bir zamanlar `PILL` sınıflarını `stream.tsx`'ten bilerek kopyalamıştı; o
 * kopyalanan şey BİR SINIF DİZİSİYDİ, bu ise bir ekran iskeleti.
 *
 * ⚠️ BURAYA MODÜLE ÖZGÜ HİÇBİR ŞEY GİRMEZ. Sınav basit: "iki modül de bunu
 * aynı şekilde kullanabilir mi?" Cevap hayırsa modülün kendi klasöründe kalır —
 * `CrmTabs` (CRM'in üç bölümü) ve `LastContactMark` ("son temas") tam da bu
 * yüzden taşınmadı.
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
 * Sağ slot serbesttir: modülün sekmeleri, birincil eylemi ya da ikisi birden
 * oraya girer. Bileşen değişmesin diye slot `ReactNode`; "sekme" diye özel bir
 * prop tanımlamak, üçüncü kullanımda dördüncü bir prop doğururdu.
 */
export function ModuleHeader({
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

/** Kaydırılan içerik alanı — Panel'in okunur genişliğiyle aynı (720px). */
export function ModuleBody({ children }: { children: ReactNode }) {
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
 * Renk modülündür: CRM'de çivit mavisi, Projeler'de zeytin. Gradyanın iki ucu
 * on iki rengin hepsinde doğru yönde durur — `--ink` açık temada `--accent`'ten
 * koyu, koyu temada açıktır — yani `--accent-fg` kontrastı gradyanın her
 * noktasında tutar (`module-colors.css`'teki ölçüm tablosu).
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
