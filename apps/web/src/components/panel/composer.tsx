'use client';

import { useRef, useState } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = text.trim() === '';

  /**
   * Mod değiştirmek yazma alanını TERK ETMEZ.
   *
   * ==========================================================================
   * NE OLUYORDU
   * ==========================================================================
   * Segment düğmesine tıklamak odağı input'tan alıyordu. Form
   * `focus-within:border-accent` + halka taşıdığı ve 200 ms geçişi olduğu için
   * alan gözle görülür biçimde SÖNÜYOR, kullanıcı tekrar tıklayınca yeniden
   * "açılıyordu". Metin hiç kaybolmuyordu ama alan kapanıp yeniden açılıyor
   * gibi görünüyordu — bildirilen hata buydu.
   *
   * Remount DEĞİLDİ: input ve form aynı DOM düğümleri olarak kalıyor
   * (tarayıcıda `data-*` etiketiyle doğrulandı), yükseklik de değişmiyor.
   *
   * ==========================================================================
   * ÇÖZÜM: ODAK HİÇ AYRILMASIN
   * ==========================================================================
   * `mousedown`'ın varsayılanı engellenir — odağı taşıyan olay odur. Böylece
   * halka hiç sönmez; sönüp geri gelmez, çünkü hiç gitmez. `click` yine
   * çalışır, dolayısıyla mod değişir.
   *
   * Ardından odak açıkça input'a verilir: kullanıcı hiç yazmamışken de mod
   * seçtikten sonra imleç yazacağı yerdedir — bu kontrolün zaten anlatmak
   * istediği şey "şimdi şunu yazacaksın"dır.
   *
   * KLAVYE ETKİLENMEZ: `mousedown` yalnızca fareye aittir. Tab ile gezinme ve
   * Enter/Space ile etkinleştirme aynen çalışır.
   */
  function pickMode(next: ComposerMode): void {
    onModeChange(next);
    inputRef.current?.focus();
  }

  function submit(): void {
    if (empty || pending) {
      return;
    }
    onSubmit(text.trim());
    setText('');
  }

  return (
    <div className="border-t border-border bg-surface px-5 pt-4 pb-5 md:px-10">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-3 inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]">
          {(
            [
              ['ask', 'Sor'],
              ['note', 'Not ekle'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              // Odağı taşıyan olay `mousedown`; engellenince input odağını
              // hiç kaybetmez ve halka sönmez.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                pickMode(value);
              }}
              className={[
                'rounded-full px-[17px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
                'transition-[background-color,color] duration-[260ms] ease-rise',
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
            'mt-2 flex items-center gap-3 rounded-field border border-border-strong bg-raised',
            'py-[7px] pr-[7px] pl-[18px] shadow-card',
            'transition-[border-color,box-shadow] duration-[260ms] ease-rise',
            /*
             * ============================================================================
             * ODAK GÖSTERGESİ TEK — "iki kutu" görüntüsü DÜZELTİLDİ
             * ============================================================================
             * Eskiden odakta `0 0 0 4px var(--glow)` vardı: 1px terracotta kenarlığın
             * DIŞINDA, aynı köşe yarıçapında 4px'lik yarı saydam bir halka. Sonuç iki
             * iç içe yuvarlak dikdörtgendi ve kullanıcı "neden iki yazma yeri var" diye
             * sordu — bildirilen hata buydu.
             *
             * Çözüm halkayı İNCELTMEK değil, ONU KENARLIĞA KATMAK: `0 0 0 1px` ve
             * kenarlıkla AYNI renk. `box-shadow` kenarlığın hemen dışına bitişik
             * çizildiği için ikisi tek bir 2px'lik kenarlık olarak okunur — ayrı bir
             * kutu belirmez.
             *
             * `border-width`i 1px'ten 2px'e çıkarmak da aynı görüntüyü verirdi ama
             * kutuyu 1px büyütüp odakta içeriği kaydırırdı; `box-shadow` yer kaplamaz.
             *
             * ⚠️ İKİNCİ VE ASIL SEBEP INPUT'TAYDI — aşağıdaki
             * `focus-visible:outline-none`. Halkayı sadeleştirmek yetmedi, çünkü
             * içteki kutu `globals.css`'in GLOBAL `:focus-visible` kuralıydı.
             */
            'focus-within:border-accent focus-within:shadow-[var(--sh-float),0_0_0_1px_var(--accent)]',
          ].join(' ')}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            disabled={pending}
            aria-label={mode === 'ask' ? 'Kurumsal hafızaya sor' : 'Not ekle'}
            placeholder={mode === 'ask' ? 'Kurumsal hafızaya sor…' : 'Ne kaydetmek istersiniz?'}
            autoComplete="off"
            onChange={(event) => {
              setText(event.target.value);
            }}
            /*
             * Odak göstergesi BURADA DEĞİL, sarmalayan formda: alan odaklanınca
             * form kenarlığı terracottaya dönüp kalınlaşır. Global `:focus-visible`
             * outline'ının bu alana çizilmemesi `globals.css`'te sağlanır — orada
             * neden bileşen tarafında çözülemediği de yazılı (CSS katman sırası).
             */
            className="min-w-0 flex-1 bg-transparent py-[9px] text-[15px] tracking-[-0.012em] text-fg outline-none placeholder:text-fg-4 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={empty || pending}
            className={[
              'inline-flex shrink-0 items-center gap-[7px] rounded-card px-[18px] py-[11px]',
              'bg-linear-150 from-accent to-ink text-[13px] font-semibold tracking-[-0.008em]',
              'text-accent-fg shadow-card inset-shadow-[0_1px_0_rgba(255,255,255,0.2)]',
              'transition-[filter,transform,box-shadow] duration-150 ease-rise',
              'hover:-translate-y-px hover:shadow-float hover:saturate-[1.08]',
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

        <p className="mt-3 text-[11.5px] text-fg-3">{hint}</p>
      </div>
    </div>
  );
}
