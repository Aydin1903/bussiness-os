'use client';

import { useState } from 'react';

import { FormError } from '@/components/ui/form-error';

export type ComposerMode = 'ask' | 'note';

/**
 * Tek yazma alanı, iki iş: SOR ya da NOT EKLE.
 *
 * ============================================================================
 * NEDEN TEK ALAN
 * ============================================================================
 * Not eklemek için başka bir sayfaya gitmek gerekseydi, "girince çıkmayan"
 * yüzey iddiası daha ilk eylemde çökerdi. Segment kontrolü, iki işi aynı
 * yerde tutarken hangisinin yapıldığını da belirsiz bırakmaz.
 *
 * Başlık alanı YOK: akış içinde hızlı not almak için gövde yeterli. Başlıklı
 * not eklemek arşiv ekranının işi (`/app/knowledge`).
 * ============================================================================
 */
export function Composer({
  mode,
  onModeChange,
  onSubmit,
  pending,
  error,
  hint,
}: {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onSubmit: (text: string) => void;
  pending: boolean;
  error: string | null;
  hint: string;
}) {
  const [text, setText] = useState('');
  const empty = text.trim() === '';

  function submit(): void {
    if (empty || pending) {
      return;
    }
    onSubmit(text.trim());
    setText('');
  }

  return (
    <div className="border-t border-border bg-surface px-6 pt-3.5 pb-4 md:px-8">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="mb-2.5 inline-flex gap-0.5 rounded-[10px] bg-fill p-[3px]">
          {(
            [
              ['ask', 'Sor'],
              ['note', 'Not ekle'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                onModeChange(value);
              }}
              className={[
                'rounded-[7.5px] px-4 py-[7px] text-[12.5px] font-semibold transition-colors',
                mode === value
                  ? 'bg-accent text-accent-fg shadow-card'
                  : 'text-fg-3 hover:text-fg-2',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <FormError message={error} />

        <form
          noValidate
          className={[
            'mt-2 flex items-center gap-2.5 rounded-[14px] border border-border-strong bg-raised',
            'py-2 pr-2 pl-4 shadow-float transition-[border-color,box-shadow] duration-200',
            'focus-within:border-accent focus-within:shadow-[var(--sh-float),0_0_0_4px_var(--glow)]',
          ].join(' ')}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            disabled={pending}
            aria-label={mode === 'ask' ? 'Kurumsal hafızaya sor' : 'Not ekle'}
            placeholder={mode === 'ask' ? 'Kurumsal hafızaya sor…' : 'Ne kaydetmek istersiniz?'}
            autoComplete="off"
            onChange={(event) => {
              setText(event.target.value);
            }}
            className="min-w-0 flex-1 bg-transparent py-1 text-[16px] tracking-[-0.008em] text-fg outline-none placeholder:text-fg-3 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={empty || pending}
            className={[
              'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-accent px-4 py-2.5',
              'text-[13px] font-semibold text-accent-fg shadow-card transition-[filter,transform]',
              'duration-150 hover:-translate-y-px hover:brightness-110',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
            ].join(' ')}
          >
            {/*
              Etiket MODA GÖRE DEĞİŞMEZ ve bu bilinçli: segment kontrolünde
              zaten "Sor" adlı bir düğme var; gönder düğmesi de "Sor" deseydi
              aynı adı taşıyan iki kontrol olurdu — ekran okuyucuda ayırt
              edilemez, testte de ("Found multiple elements") yakalandı.
            */}
            {pending ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </form>

        <p className="mt-2.5 text-[11px] text-fg-3">{hint}</p>
      </div>
    </div>
  );
}
