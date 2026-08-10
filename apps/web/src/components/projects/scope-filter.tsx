'use client';

/**
 * Ekran içi kapsam seçici.
 *
 * ============================================================================
 * BU SEKME DEĞİL — ve fark anlamlıdır
 * ============================================================================
 * `ProjectTabs` GEZİNMEDİR: her sekme kendi rotasıdır, tarayıcı geçmişine
 * girer, paylaşılabilir. Bu ise aynı rotanın İKİ SORUSUDUR ve URL'yi
 * değiştirmez.
 *
 * Görünüm bilerek AYNI reçetedir (`composer.tsx`'in segment kontrolü — hap
 * şerit, dolu imza rengi seçili olanda). Ayrı bir görünüm icat etmek, aynı
 * ekranda iki farklı "seçim yapılıyor" dili demekti. Ayrımı KONUM yapıyor:
 * gezinme başlıkta, kapsam gövdenin başında.
 *
 * ⚠️ `<button>` + `aria-pressed`, `<a>` DEĞİL: bunlar bağlantı değil. Ekran
 * okuyucu kullanıcısına "gidilecek yer" diye sunmak yalan olurdu.
 */
export type TaskScope = 'inbox' | 'overdue';

const SCOPES: readonly { value: TaskScope; label: string }[] = [
  { value: 'inbox', label: 'Projesiz' },
  { value: 'overdue', label: 'Gecikmiş' },
];

export function ScopeFilter({
  scope,
  onPick,
}: {
  scope: TaskScope;
  onPick: (scope: TaskScope) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Görev kapsamı"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {SCOPES.map((item) => {
        const active = scope === item.value;

        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onPick(item.value);
            }}
            className={[
              'rounded-full px-[17px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              active ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
