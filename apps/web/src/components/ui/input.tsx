import type { InputHTMLAttributes } from 'react';

/**
 * Metin girişi — sade, geniş boşluklu, yumuşak kenarlıklı (§4).
 *
 * `aria-invalid` verildiğinde kenarlık danger rengine döner; hata durumu
 * yalnızca renkle değil, `Field`'in metin mesajıyla da bildirilir (erişilebilirlik).
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={[
        'w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm text-fg',
        'placeholder:text-fg-muted',
        'transition-colors outline-none',
        'focus:border-accent focus:ring-2 focus:ring-accent/15',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15',
        'disabled:opacity-60',
        className ?? '',
      ].join(' ')}
      {...props}
    />
  );
}
