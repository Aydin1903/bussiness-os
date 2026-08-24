'use client';

import type {
  EmploymentStatus,
  EmploymentType,
  LeaveStatus,
  LeaveType,
  WorkMode,
} from '@business-os/contracts';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

/**
 * ⚠️ İZİN TÜRLERİ — listede "hastalık/raporlu" YOKTUR.
 *
 * ADR-0043 §3'ün sağlık verisi sınırının taşıyıcısı (ADR-0044 §2.1): bir izin
 * türü olarak "hastalık" seçmek, o satırı SERBEST METİN OLMASA BİLE KVKK m.6
 * kapsamında bir SAĞLIK VERİSİ yapardı. Sunucu da reddeder — yani sınır üç
 * katmanda birden korunuyor (şema CHECK'i · Zod `.strict()` · bu liste).
 */
export const LEAVE_TYPE_LABELS: Readonly<Record<LeaveType, string>> = {
  annual: 'Yıllık izin',
  unpaid: 'Ücretsiz izin',
  excuse: 'Mazeret izni',
  administrative: 'İdari izin',
};

export const EMPLOYMENT_TYPE_LABELS: Readonly<Record<EmploymentType, string>> = {
  full_time: 'Tam zamanlı',
  part_time: 'Yarı zamanlı',
  contract: 'Sözleşmeli',
  intern: 'Stajyer',
};

export const WORK_MODE_LABELS: Readonly<Record<WorkMode, string>> = {
  office: 'Ofis',
  remote: 'Uzaktan',
  hybrid: 'Hibrit',
};

/**
 * KIDEM — ⚠️ TÜRETİLİR, kolonda saklanmaz (ADR-0044 §3).
 *
 * Onbirinci kararın ikizi: kolonda bozulma _sessiz ve makul görünen yanlış bir
 * sayı_ üretirdi ("2 yıldır burada" — oysa 5).
 */
export function tenureLabel(startedOn: string | null, today: Date): string | null {
  if (startedOn === null) {
    return null;
  }

  const start = Date.parse(`${startedOn}T00:00:00.000Z`);
  const months = Math.floor((today.getTime() - start) / (30.44 * 86_400_000));

  // ⚠️ GELECEK TARİHLİ işe başlama MEŞRUDUR (yeni işe alım, henüz başlamadı).
  // "bu ay başladı" demek onu OLMUŞ gibi gösterirdi.
  if (months < 0) {
    return 'henüz başlamadı';
  }
  if (months < 1) {
    return 'bu ay başladı';
  }
  if (months < 12) {
    return `${String(months)} aydır`;
  }

  const years = Math.floor(months / 12);
  return `${String(years)} yıldır`;
}

/*
 * ============================================================================
 * ⚠️ `<select>` DİZE DÖNER — DARALTMA `as` İLE DEĞİL, GERÇEK BİR KONTROLLE
 * ============================================================================
 * `SelectField`in `onChange`i `string` verir. `as EmploymentType` yazmak
 * derleyiciyi susturur ama DOĞRULAMAZ: seçenek listesi değişirse ya da bir
 * test elle bir değer yazarsa tip bir YALAN olur ve hata SESSİZDİR.
 *
 * Aşağıdaki üç fonksiyon API tarafındaki `toStatus`/`toPeriod`nin aynısıdır:
 * bilinmeyen değer varsayılana düşer. Lint kuralı (`consistent-type-assertions`)
 * tam olarak bunu zorlamak için var.
 */

export function toEmploymentType(value: string): EmploymentType {
  return value === 'part_time' || value === 'contract' || value === 'intern' ? value : 'full_time';
}

export function toWorkMode(value: string): WorkMode {
  return value === 'remote' || value === 'hybrid' ? value : 'office';
}

export function toLeaveType(value: string): LeaveType {
  return value === 'unpaid' || value === 'excuse' || value === 'administrative' ? value : 'annual';
}

/**
 * İK ODASININ İKİ ÇALIŞMA YÜZEYİ — iki modül DEĞİL (ADR-0044 §2).
 *
 * ============================================================================
 * ⚠️ İKİNCİ ROTA NEDEN AÇILDI — ÜCRET DEFTERİNDE AÇILMAMIŞTI
 * ============================================================================
 * `/app/hr/page.tsx` "ikinci bir rota YOKTUR" diyordu ve gerekçesi ÜCRETE
 * ÖZGÜYDÜ: `compensation:read` DAR bir izindir, ayrı bir rota olsaydı izinsiz
 * kullanıcı için "var ama giremiyorum" diyen bir sekme kalırdı.
 *
 * ⚠️ İZİNDE BU GEÇERLİ DEĞİL: `leave:read` DÖRT ROLE de açıktır — gizlenecek
 * bir şey yok, yani sekme kimseye kapalı kapı göstermez.
 *
 * ⚠️ VE AÇILMASI GEREKİYORDU: İK'cının günlük sorusu _"onay bekleyen izin var
 * mı"_dır ve bu soru çalışan listesinden CEVAPLANAMAZ — her çalışanı tek tek
 * açmak gerekirdi. Bir yüzeyin var olma sebebi budur.
 */
const HR_TABS: readonly { href: string; label: string }[] = [
  { href: '/app/hr', label: 'Ekip' },
  { href: '/app/hr/leave', label: 'İzinler' },
];

export function HrTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="İK bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {HR_TABS.map((tab) => {
        // TAM eşleşme: `/app/hr` her İK yolunun ÖNEKİDİR; önek kontrolü
        // çalışan detayında "Ekip"i de aktif gösterirdi. Detay sayfası hiçbir
        // sekmeye ait değildir ve hiçbiri yanmaz — orada aktiflik iddiası
        // yanlış olurdu (`ProjectTabs` ile aynı karar).
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...(active ? { 'aria-current': 'page' } : {})}
            className={[
              'rounded-full px-[17px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              active ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * İZİN DURUMU FİLTRESİ — `StatusFilter`ın kardeşi, aynı şekil.
 *
 * ⚠️ VARSAYILAN "Bekleyen"dir ve bu ekranın var olma sebebi budur: İK'cının
 * sabah sorduğu soru _"onay bekleyen izin var mı"_dır. "Hepsi" varsayılan
 * olsaydı ekran bir ARŞİV olurdu ve bekleyen bir talep, onaylanmış yüzlerce
 * kaydın arasında kaybolurdu — hata sessiz: kimse reddedilmez, sadece kimse
 * cevaplanmaz.
 *
 * ⚠️ "Reddedilen" ayrı bir düğme DEĞİL: reddedilen izinler "Hepsi"nde görünür.
 * Dört düğme, günde bir kez bakılan bir durum için fazladan bir seçimdir.
 */
const LEAVE_FILTERS = [
  { key: 'pending', label: 'Bekleyen' },
  { key: 'approved', label: 'Onaylanan' },
  { key: 'all', label: 'Hepsi' },
] as const;

export function LeaveStatusFilter({
  value,
  onChange,
}: {
  readonly value: LeaveStatus | undefined;
  readonly onChange: (next: LeaveStatus | undefined) => void;
}) {
  const active = value ?? 'all';

  return (
    <div
      role="group"
      aria-label="İzin durumu"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {LEAVE_FILTERS.map((filter) => {
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
