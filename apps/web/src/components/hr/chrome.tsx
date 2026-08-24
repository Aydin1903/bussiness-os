'use client';

import type { EmploymentStatus } from '@business-os/contracts';

import { Mark } from '@/components/module-kit/marks';

/**
 * İK ODASININ KENDİNE ÖZGÜ PARÇALARI.
 *
 * ⚠️ Buradakiler `module-kit`e TAŞINMADI ve sınav basit: "iki modül de bunu
 * aynı şekilde kullanabilir mi?" Hayır — `EmploymentMark` İSTİHDAM DURUMUNU,
 * `StatusFilter` ise bu modülün üç filtresini bilir.
 */

/**
 * İSTİHDAM DURUMU.
 *
 * ⚠️ "Ayrılmış" bir HATA gibi gösterilmez (kırmızı yok, `--danger` yok):
 * işten ayrılmak bir arıza değildir. `marks.tsx`in kuralı burada da geçerli —
 * dikkat çeken tek renk modülün imza rengidir.
 *
 * ⚠️ Ayrılmış çalışan SİLİNMEZ, işaretlenir (ADR-0043 §1.4): geçmiş ekip
 * bilgisi kurumsal hafızadır ve bir kısmı YASAL SAKLAMA kapsamındadır. Bu
 * rozet o kararın ekrandaki karşılığıdır.
 */
export function EmploymentMark({ status }: { readonly status: EmploymentStatus }) {
  return status === 'ended' ? <Mark quiet>Ayrılmış</Mark> : <Mark>Aktif</Mark>;
}

/**
 * TAKVİM GÜNÜ — `YYYY-MM-DD` dizesinden.
 *
 * ⚠️ `new Date(iso)` SAAT DİLİMİ KAYDIRIR: `'2026-01-15'` UTC gece yarısı
 * olarak ayrıştırılır ve UTC−03:00'te BİR ÖNCEKİ GÜN gösterilir. İşe başlama
 * ve ücret yürürlük tarihi bir TAKVİM GÜNÜDÜR (`date` kolonu), bir an değil —
 * bu yüzden dize ELLE parçalanır. `suppliers/chrome.tsx` ile aynı karar.
 */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (year === undefined || month === undefined || date === undefined) {
    return day;
  }

  return new Date(Number(year), Number(month) - 1, Number(date)).toLocaleDateString('tr-TR', {
    dateStyle: 'medium',
  });
}

/** Türkçe tarih — ISO AN'dan (denetim kaydının damgası gibi). */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}

/**
 * DENETİM KAYDINDAKİ ALAN ADLARININ TÜRKÇE KARŞILIĞI.
 *
 * ⚠️ Sunucu KOLON ADI yazar (`job_title`) — bu bilinçlidir (ADR-0043 §6.3):
 * denetim kaydı VERİTABANI gerçeğini anlatır ve okuyan kişi ekranda değil
 * şemada arar. Ekranda ise insan diline çevrilir.
 *
 * ⚠️ Bilinmeyen bir alan adı OLDUĞU GİBİ gösterilir, gizlenmez: bir gün yeni
 * bir alan eklenip buraya yazılmazsa kullanıcı `work_email` görür — çirkin
 * ama DOĞRU. Gizlemek, gerçekten olmuş bir değişikliği ekrandan silmek olurdu.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  full_name: 'ad soyad',
  job_title: 'unvan',
  work_email: 'iş e-postası',
  work_phone: 'iş telefonu',
  employment_status: 'istihdam durumu',
  started_on: 'işe başlama',
  ended_on: 'ayrılma tarihi',
  platform_user_id: 'platform hesabı',
};

export function fieldLabel(column: string): string {
  return FIELD_LABELS[column] ?? column;
}

/**
 * İSTİHDAM DURUMU FİLTRESİ.
 *
 * ⚠️ `SupplierTabs`ten farkı: bunlar ROTA DEĞİL, aynı ekranın durumudur —
 * `<Link>` değil `<button>`. Ama aktiflik aynı şekilde `aria-pressed` ile de
 * söylenir: renk hiçbir yerde TEK ayırt edici değildir ve bu modülde kural
 * özellikle geçerlidir (mor bantta üç komşu hue).
 */
const FILTERS = [
  { key: 'active', label: 'Aktif' },
  { key: 'ended', label: 'Ayrılmış' },
  { key: 'all', label: 'Hepsi' },
] as const;

export function StatusFilter({
  value,
  onChange,
}: {
  readonly value: EmploymentStatus | undefined;
  readonly onChange: (next: EmploymentStatus | undefined) => void;
}) {
  const active = value ?? 'all';

  return (
    <div
      role="group"
      aria-label="İstihdam durumu"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {FILTERS.map((filter) => {
        const current = filter.key === active;

        return (
          <button
            key={filter.key}
            type="button"
            aria-pressed={current}
            onClick={() => {
              onChange(filter.key === 'all' ? undefined : filter.key);
            }}
            className={[
              'rounded-full px-[13px] py-[5px] text-[11.5px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              current ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
