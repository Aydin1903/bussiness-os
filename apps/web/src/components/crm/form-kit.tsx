import type { ReactNode } from 'react';

import { Rise } from '@/components/panel/stream';
import { SectionLabel } from './chrome';

/**
 * CRM form ilkelleri.
 *
 * ============================================================================
 * NEDEN `ui/input.tsx` DEĞİL
 * ============================================================================
 * `components/ui/` altındaki `Input`/`Field` auth ekranları için yazıldı ve
 * ORAYA aittir: `rounded-lg`, `bg-bg`, `focus:ring-accent/15`. O ekranlar
 * kabuğun dışında, sıcak kağıdın üstünde duran ortalanmış kartlardır.
 *
 * CRM ise Atölye panelinin İÇİNDE yaşıyor ve panelin kendi girdi dili var:
 * `composer.tsx`'in yazma alanı — `rounded-field`, `border-border-strong`,
 * `bg-raised` ve odakta kalınlaşan terracotta kenarlık. CRM formlarına auth
 * girdisini koymak, aynı ekranda iki farklı girdi dili demekti.
 *
 * `ui/input.tsx` DEĞİŞTİRİLMEDİ — auth ekranları çalışıyor ve istenmeyen
 * refactor yasak (CLAUDE.md kural 2).
 *
 * ============================================================================
 * MODAL YOK
 * ============================================================================
 * Atölye'de modal diye bir yüzey türü tanımlanmadı. Oluşturma/düzenleme
 * formları LİSTENİN İÇİNDE açılır (`InlinePanel`) ve `rise` ile gelir —
 * kullanıcı bağlamını kaybetmez, yeni bir yüzey türü de icat edilmez.
 */

/**
 * Girdi yüzeyi — `composer.tsx`'in odak göstergesiyle birebir aynı.
 *
 * Odaktaki 4px'lik halka oradaki düzeltmeyle birlikte BURADA DA kaldırıldı:
 * gerekçe composer'da yazılı (iki iç içe kutu görüntüsü). İkisi aynı reçeteyi
 * paylaşıyor; birini düzeltip diğerini bırakmak aynı ekranda iki farklı odak
 * dili demekti.
 */
const CONTROL = [
  'w-full rounded-field border border-border-strong bg-raised px-[16px] py-[10px]',
  'text-[13.5px] tracking-[-0.008em] text-fg outline-none placeholder:text-fg-4',
  'transition-[border-color,box-shadow] duration-[260ms] ease-rise',
  'focus:border-accent focus:shadow-[var(--sh-float),0_0_0_1px_var(--accent)]',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

/**
 * Etiketli metin girişi.
 *
 * Etiket `<label htmlFor>` ile bağlıdır (tıklanınca odaklanır) ve alan hatası
 * hem METİNLE hem renkle bildirilir — yalnızca renkle bildirmek renk körü
 * kullanıcı için hiçbir şey söylemezdi (`ui/field.tsx` aynı kuralı yazıyor).
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  disabled = false,
  error = null,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'date';
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
}) {
  const invalid = error !== null && error !== '';

  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <label htmlFor={id} className="text-[11.5px] font-semibold tracking-[-0.004em] text-fg-2">
        {label}
        {required ? <span className="ml-1 text-ink">*</span> : null}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(invalid ? { 'aria-describedby': `${id}-error` } : {})}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={CONTROL}
      />

      {invalid ? (
        <span id={`${id}-error`} className="text-[11.5px] text-danger">
          {error}
        </span>
      ) : hint === undefined ? null : (
        <span className="text-[11.5px] text-fg-3">{hint}</span>
      )}
    </div>
  );
}

/** Çok satırlı giriş — görüşme metni gibi uzun gövdeler için. */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  disabled = false,
  error = null,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
}) {
  const invalid = error !== null && error !== '';

  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <label htmlFor={id} className="text-[11.5px] font-semibold tracking-[-0.004em] text-fg-2">
        {label}
      </label>

      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        {...(placeholder === undefined ? {} : { placeholder })}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={`${CONTROL} resize-y leading-[1.6]`}
      />

      {invalid ? (
        <span className="text-[11.5px] text-danger">{error}</span>
      ) : hint === undefined ? null : (
        <span className="text-[11.5px] text-fg-3">{hint}</span>
      )}
    </div>
  );
}

/**
 * Açılır seçim — aynı girdi yüzeyi.
 *
 * Yerleşik `<select>` KULLANILIYOR, elle yazılmış bir açılır liste değil:
 * klavye gezinmesi, mobil yerel seçici ve ekran okuyucu desteği bedavaya
 * gelir; özel bir bileşen bunların üçünü de yeniden yazmayı gerektirirdi.
 * Ok işareti tarayıcınındır ve paleti bozmuyor (`text-fg` mirasını alır).
 */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** İlk seçenek genellikle boş değerli "seçilmedi" satırıdır. */
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <label htmlFor={id} className="text-[11.5px] font-semibold tracking-[-0.004em] text-fg-2">
        {label}
      </label>

      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={CONTROL}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {hint === undefined ? null : <span className="text-[11.5px] text-fg-3">{hint}</span>}
    </div>
  );
}

/** İki sütunlu alan ızgarası; dar ekranda tek sütuna düşer. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

/**
 * Satır içi açılan form paneli.
 *
 * `bg-raised` + `shadow-float`: listenin (surface) BİR KADEME üstünde durur,
 * yani "şu an buradasın" derinlikle söylenir. `rise` ile gelir — açılışın
 * kendisi bir an olmalı (globals.css'in giriş hareketi gerekçesi).
 */
export function InlinePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Rise>
      <section className="mb-5 rounded-card border border-border bg-raised p-5 shadow-float">
        <div className="mb-4">
          <SectionLabel>{title}</SectionLabel>
        </div>
        {children}
      </section>
    </Rise>
  );
}

/** Form eylem şeridi — birincil sağda, vazgeç solunda. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">{children}</div>;
}

/** Vazgeç — yalın metin, hiçbir dolgu taşımaz (`ui/button.tsx › ghost` ruhu). */
export function GhostButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-[11px] px-3.5 py-2 text-[12.5px] font-medium tracking-[-0.008em] text-fg-2',
        'transition-colors duration-150 hover:bg-fill hover:text-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
