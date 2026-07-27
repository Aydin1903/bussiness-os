import type { ReactNode } from 'react';

/**
 * Etiket + giriş + (varsa) alan hatası — dikey, geniş boşluklu (§4).
 *
 * `htmlFor`/`id` eşleşmesi çağıranın sorumluluğundadır; etiket tıklanınca girişe
 * odaklanır. Alan hatası hem metinle hem renkle bildirilir (yalnızca renk değil).
 */
export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error !== undefined && error !== null && error !== '' ? (
        <span className="text-xs text-danger">{error}</span>
      ) : null}
    </div>
  );
}
