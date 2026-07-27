import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` (kontrast dolgu) veya `ghost` (yalın metin). */
  readonly variant?: 'primary' | 'ghost';
  /** İşlem sürerken metni "…" ile değiştirir ve butonu devre dışı bırakır. */
  readonly loading?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  ghost: 'text-fg hover:bg-surface',
};

/**
 * Birincil eylem butonu — kontrast dolgu, yumuşak köşe (§4 "renk değil kontrast").
 *
 * `loading` sırasında hem devre dışıdır hem metni değişir; çift gönderim engellenir.
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      // Formlarda varsayılan `submit`; aksi belirtilmedikçe kazara reset olmaz.
      type={type ?? 'button'}
      disabled={disabled === true || loading}
      className={[
        'inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium',
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        className ?? '',
      ].join(' ')}
      {...props}
    >
      {loading ? 'Lütfen bekleyin…' : children}
    </button>
  );
}
