import type { ReactNode } from 'react';

/**
 * Akış ilkelleri — Panel'in konuşma yüzeyi (tasarım sürüm 2).
 *
 * ============================================================================
 * TEK İPLİK, İKİ SES
 * ============================================================================
 * Girdiler dikey bir hairline üzerinde nokta taşır: AI'ınki DOLU amber,
 * kullanıcınınki İÇİ BOŞ halka. Konuşma bir liste değil bir AKIŞ olarak
 * okunur — sohbet balonu klişesine düşmeden.
 *
 * AI serif konuşur, kullanıcı sans. Ayrım kasıtlı: asistanın söylediği ile
 * ürünün söylediği aynı sesle konuşmamalı (FRONTEND_ARCHITECTURE §4.5).
 * ============================================================================
 */

/** Zaman sütunu genişliği + boşluk; nokta ipliğin ÜSTÜNE oturur. */
const GUTTER = 'grid grid-cols-[58px_1fr] gap-6';

export function StreamEntry({
  when,
  variant,
  last = false,
  children,
}: {
  /** Saat ya da "Sen". */
  when: string;
  variant: 'ai' | 'you';
  /** Son girdide iplik aşağı devam etmez. */
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`relative pb-6 ${GUTTER}`}>
      {/* İplik — son girdide çizilmez. */}
      {last ? null : (
        <span aria-hidden className="absolute top-3.5 bottom-0 left-[57px] w-px bg-border" />
      )}

      <div className="relative pt-0.5 text-right">
        <span className="font-mono text-[9.5px] leading-[1.9] font-medium tracking-[0.08em] text-fg-3 uppercase tabular">
          {when}
        </span>
        <span
          aria-hidden
          className={[
            'absolute top-[7px] -right-[3px] h-[7px] w-[7px] rounded-full',
            'shadow-[0_0_0_3px_var(--bg)]',
            variant === 'ai' ? 'bg-accent' : 'border-[1.5px] border-border-strong bg-bg',
          ].join(' ')}
        />
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** AI sesi — serif. `lead` yalnızca günün İLK gözlemi için. */
export function AiSaid({ children, lead = false }: { children: ReactNode; lead?: boolean }) {
  return (
    <p
      className={[
        'font-serif text-fg',
        lead
          ? 'max-w-[40ch] text-[24px] leading-[1.5] tracking-[-0.012em]'
          : 'max-w-[57ch] text-[17.5px] leading-[1.66]',
      ].join(' ')}
      style={{ textWrap: 'pretty' }}
    >
      {children}
    </p>
  );
}

/** Kullanıcı sesi — sans, daha küçük: AI baskın kalsın. */
export function UserAsked({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[57ch] text-[14px] font-semibold tracking-[-0.005em] text-fg-2">
      {children}
    </p>
  );
}

export function SourceMeta({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-[11.5px] text-fg-3">{children}</p>;
}

/**
 * Düşünme durumu — SAHTE DAKTİLO DEĞİL.
 *
 * Metin tamamen geldikten sonra harf harf yazmak, gerçek beklemenin üstüne
 * SAHTE bir bekleme ekler; streaming'in bütün değeri ilk token'a kadar geçen
 * süreyi kısaltmaktır ve sahtesi tam tersini yapar. Burada gösterilen şey
 * gerçek durumdur: cevap üretiliyor.
 *
 * Gerçek streaming ayrı bir slice + ADR gerektiriyor (ROADMAP §8).
 */
export function ThinkingLine() {
  return (
    <p className="flex items-center gap-2 font-serif text-[17.5px] text-fg-3" role="status">
      <span className="sr-only">Cevap üretiliyor…</span>
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-[5px] w-[5px] animate-pulse rounded-full bg-fg-3"
            style={{ animationDelay: `${String(index * 180)}ms`, animationDuration: '1.1s' }}
          />
        ))}
      </span>
      <span className="text-[13px] font-sans">Notlarınıza bakıyorum…</span>
    </p>
  );
}

/**
 * Önerilen devam soruları — "içeride tutan" asıl kaldıraç.
 *
 * Kullanıcı ne soracağını düşünmek zorunda kalmaz. Öneriler modelin AYNI
 * cevabından gelir (ADR-0029 §4); model önermediyse çağıran taraf statik
 * örnekler geçer.
 */
export function FollowUpChips({
  items,
  onPick,
  disabled = false,
}: {
  items: readonly string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3.5 flex flex-wrap gap-[7px]">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => {
            onPick(item);
          }}
          className={[
            'rounded-full bg-tint px-3.5 py-2 text-[12.5px] font-medium text-fg',
            'transition-[background-color,transform,box-shadow] duration-150 ease-rise',
            'hover:-translate-y-[1.5px] hover:bg-tint-2 hover:shadow-card active:translate-y-0',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
          ].join(' ')}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
