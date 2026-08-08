import type { CSSProperties, ReactNode } from 'react';

/**
 * Akış ilkelleri — Panel'in konuşma yüzeyi (tasarım sürüm 2).
 *
 * ============================================================================
 * TEK İPLİK, İKİ SES
 * ============================================================================
 * Girdiler dikey bir hairline üzerinde nokta taşır: AI'ınki DOLU terracotta,
 * kullanıcınınki İÇİ BOŞ halka. Konuşma bir liste değil bir AKIŞ olarak
 * okunur — sohbet balonu klişesine düşmeden.
 *
 * AI serif konuşur, kullanıcı sans. Ayrım kasıtlı: asistanın söylediği ile
 * ürünün söylediği aynı sesle konuşmamalı (FRONTEND_ARCHITECTURE §4.5).
 * ============================================================================
 */

/**
 * Sahnelenen giriş — `--rise-delay` ms cinsinden gecikme taşır.
 *
 * Animasyonun kendisi `globals.css`'te (`.rise`); burada yalnızca gecikme
 * verilir. `prefers-reduced-motion` açıkken hem süre hem gecikme sıfırlanır,
 * yani öğeler anında yerinde belirir.
 */
export function Rise({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  // `CSSProperties` ozel degiskenleri tanimaz; `as` yerine bir INDEX IMZASI
  // ile genisletiliyor (`consistent-type-assertions` tip iddialarini yasakliyor
  // ve hakli: `as` burada derleyiciye "sus" demekten baska is yapmazdi).
  const style: CSSProperties & Record<'--rise-delay', string> = {
    '--rise-delay': String(delay),
  };

  return (
    <div className="rise" style={style}>
      {children}
    </div>
  );
}

/** Zaman sütunu genişliği + boşluk; nokta ipliğin ÜSTÜNE oturur. */
const GUTTER = 'grid grid-cols-[52px_1fr] gap-[22px]';

/**
 * Saat yazısının sütun kenarına bırakması gereken boşluk — NOKTA ŞERİDİ.
 *
 * ============================================================================
 * NEDEN VAR
 * ============================================================================
 * Zaman hücresi `text-right`, yani yazı hücrenin sağ kenarına DAYANIR. Nokta
 * ise negatif `right` ile o kenarın üstüne oturur (ipliğe hizalanmak için
 * böyle olmak ZORUNDA). Sonuç: nokta, saatin son rakamının üstüne biniyordu —
 * tarayıcıda ölçüldü, 4 piksel örtüşme.
 *
 * Nokta KAYDIRILMADI: yeri doğru, ipliğin merkezinde. Kaydırılan yazıdır.
 * 13px, noktanın yarıçapı (3.5px) + kenar payının rahatça üstünde ve
 * "11:51" (~32px) + 13px hâlâ 52px sütuna sığar.
 * ============================================================================
 */
const DOT_LANE = 'pr-[13px]';

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
    <div className={`relative pb-[30px] ${GUTTER}`}>
      {/* İplik — son girdide çizilmez. */}
      {last ? null : (
        <span aria-hidden className="absolute top-4 bottom-0 left-[51px] w-px bg-border-strong" />
      )}

      <div className="relative pt-0.5 text-right">
        <span
          className={[
            'font-mono text-[9.5px] leading-[1.9] font-medium tracking-[0.08em]',
            'text-fg-3 uppercase tabular',
            // Boşluk hücreye DEĞİL yazıya verilir: hücreye padding vermek,
            // mutlak konumlu noktayı da içeri kaydırıp ipliğin hizasından
            // düşürürdü.
            DOT_LANE,
          ].join(' ')}
        >
          {when}
        </span>
        <span
          aria-hidden
          className={[
            'absolute top-[6px] -right-[3.5px] h-[7px] w-[7px] rounded-full',
            // Halka PANELİN zeminini alır — kabuk zemininin değil.
            'shadow-[0_0_0_4px_var(--surface)]',
            // `bg-ai-accent`, `bg-accent` DEĞİL: bu nokta AI'ın imzasıdır ve
            // bir modülün içinde çizilse bile terracotta kalmalıdır.
            variant === 'ai' ? 'bg-ai-accent' : 'border-[1.5px] border-border-strong bg-surface',
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
        'text-fg',
        lead
          ? 'ai-voice-lead max-w-[27ch] text-[26px] leading-[1.42] tracking-[-0.014em]'
          : 'ai-voice max-w-[58ch] text-[16.5px] leading-[1.7]',
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
    <p className="max-w-[58ch] text-[13.5px] font-semibold tracking-[-0.008em] text-fg-2">
      {children}
    </p>
  );
}

export function SourceMeta({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
      {/* Kaynak işareti AI'ın cevabına aittir → `ai-accent`. */}
      <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-ai-accent opacity-60" />
      {children}
    </p>
  );
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
    <p className="ai-voice flex items-center gap-2 text-[16.5px] text-fg-3" role="status">
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
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => {
            onPick(item);
          }}
          className={[
            'rounded-full border border-border bg-raised px-[15px] py-[9px] text-[12.5px]',
            'font-medium tracking-[-0.008em] text-fg shadow-card',
            'transition-[transform,box-shadow,border-color,color] duration-[260ms] ease-rise',
            'hover:-translate-y-[2px] hover:border-tint-2 hover:text-ink hover:shadow-float',
            'active:translate-y-0 active:shadow-card',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
          ].join(' ')}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
