import type { CashflowCategoryTotal } from '@business-os/contracts';

import { formatMoney } from '@/lib/format/money';
import { Amount } from './marks';

/**
 * FİNANS GRAFİKLERİ — elle çizilmiş SVG, grafik kütüphanesi YOK.
 *
 * ============================================================================
 * NEDEN KÜTÜPHANE YOK (FRONTEND §4.10, Product Owner kararı 2026-08-12)
 * ============================================================================
 * `category-bars.tsx`'in aynı gerekçesi: recharts 3.x karşılığında geçişli
 * bağımlılıklar (`@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`) ve
 * para biçimlendirmesinin kütüphane içine kaçması gelirdi — oysa bu projede
 * para hiçbir noktada `number` olmaz.
 *
 * ============================================================================
 * ⚠️ BURADAKİ `Number()` ÇAĞRILARI YALNIZCA GEOMETRİ İÇİNDİR
 * ============================================================================
 * Parse edilen değer EKRANA HİÇ YAZILMAZ. Etiketlerdeki tutar daima sunucunun
 * kanonik dizesidir ve `Amount` onu olduğu gibi basar. Bir açının ya da bir
 * y koordinatının binde birlik sapması ölçülemez; aynı sapma bir TUTARDA
 * görünürdü — ayrım bu yüzden korunuyor.
 */

/* ========================================================================== */
/* Halka — YALNIZCA GİDER                                                     */
/* ========================================================================== */

/**
 * Gider kırılımı halkası.
 *
 * ============================================================================
 * ⚠️ NEDEN SADECE GİDER — ADR-0034'ün pasta reddi KORUNUYOR
 * ============================================================================
 * `category-bars.tsx` pastayı şu gerekçeyle reddetmişti: her kırılım satırı
 * `direction` taşır, yani aynı para biriminde hem gelir hem gider kategorileri
 * vardır ve **ortada "bütün" diye bir şey yoktur**. Geliri ve gideri tek
 * halkaya koymak anlamsız olurdu.
 *
 * O gerekçe hâlâ geçerli. Halka bu yüzden **tek yöne** kapatıldı: giderlerin
 * toplamı GERÇEK bir bütündür ve dilimler onun payıdır. Product Owner
 * grafikleri isterken bu kısıt açıkça onaylandı (2026-08-17).
 *
 * ⚠️ Gelirin halkası YOKTUR ve olmamalıdır: gelir genelde tek kalemdir, tek
 * dilimlik bir halka bilgi taşımaz.
 *
 * ============================================================================
 * RENK — TEK HUE, LUMİNANS BASAMAKLARI
 * ============================================================================
 * Dilimler odanın kendi rengidir, alfa kademeleriyle ayrılır. İki kazancı var:
 * grafik modülün kimliğinde kalır (rastgele bir kategorik palet değil), ve
 * **renk körlüğü altında bozulmaz** — ayrım hue değil parlaklıktır.
 *
 * ⚠️ Renk yine de TEK ayırt edici değildir: her dilimin adı ve tutarı
 * lejantta yazılıdır (FRONTEND §4.8'in bağlayıcı kuralı).
 */
const SLICE_ALPHA: readonly number[] = [1, 0.78, 0.58, 0.42, 0.3];

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ExpenseDonut({
  categories,
  currency,
  total,
}: {
  categories: readonly CashflowCategoryTotal[];
  currency: string;
  /** Sunucunun ilan ettiği gider toplamı — kanonik dize. */
  total: string;
}) {
  const expenses = categories.filter((row) => row.direction === 'expense');

  /*
   * ⚠️ PAYDA SUNUCUNUN İLAN ETTİĞİ TOPLAM, kategorilerin toplamı DEĞİL.
   * `category-bars.tsx`'in aynı kararı: kendi toplamına bölmek dilimleri her
   * zaman %100'e tamamlar, yani kırılım özetin tamamını açıklamasa bile grafik
   * kusursuz görünür. İlan edilen toplama bölmek eksiği GÖSTERİR.
   */
  const declared = Number(total);
  const sum = expenses.reduce((acc, row) => acc + safe(row.total), 0);
  const denominator = Number.isFinite(declared) && declared > 0 ? declared : sum;

  if (expenses.length === 0 || denominator <= 0) {
    return (
      <ChartFrame title="Gider kırılımı">
        <p className="py-8 text-[12.5px] text-fg-3">Bu dönemde gider kaydı yok.</p>
      </ChartFrame>
    );
  }

  const shown = [...expenses].sort((a, b) => safe(b.total) - safe(a.total)).slice(0, 5);

  let offset = 0;
  const slices = shown.map((row, index) => {
    const share = safe(row.total) / denominator;
    const slice = {
      row,
      share,
      alpha: SLICE_ALPHA[index] ?? 0.22,
      dash: share * CIRCUMFERENCE,
      offset,
    };
    offset += slice.dash;
    return slice;
  });

  return (
    <ChartFrame title="Gider kırılımı">
      <div className="flex flex-wrap items-center gap-6">
        <svg
          viewBox="0 0 130 130"
          className="h-[150px] w-[150px] shrink-0"
          role="img"
          aria-label={`Gider kırılımı: ${shown
            .map((row) => `${row.categoryName ?? 'Kategorisiz'} ${formatMoney(row.total)}`)
            .join(', ')}`}
        >
          {/* Boş kalan pay — kırılım toplamı ilan edilen toplamı tutmuyorsa GÖRÜNÜR. */}
          <circle cx="65" cy="65" r={RADIUS} fill="none" stroke="var(--fill-2)" strokeWidth="17" />
          {slices.map((slice) => (
            <circle
              key={slice.row.categoryId ?? 'uncategorised'}
              cx="65"
              cy="65"
              r={RADIUS}
              fill="none"
              stroke={`rgb(var(--accent-rgb) / ${String(slice.alpha)})`}
              strokeWidth="17"
              strokeDasharray={`${String(slice.dash)} ${String(CIRCUMFERENCE - slice.dash)}`}
              strokeDashoffset={String(-slice.offset)}
              /* -90°: ilk dilim saat 12'den başlar, sağdan değil. */
              transform="rotate(-90 65 65)"
            />
          ))}
        </svg>

        {/*
          LEJANT — grafiğin okunmasını sağlayan asıl parça. Halka oranı verir,
          lejant adı ve TUTARI verir; ikisi olmadan grafik süs olurdu.
        */}
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {slices.map((slice) => (
            <li
              key={slice.row.categoryId ?? 'uncategorised'}
              className="flex items-center gap-2.5 text-[12.5px]"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: `rgb(var(--accent-rgb) / ${String(slice.alpha)})` }}
              />
              <span className="min-w-0 flex-1 truncate text-fg-2">
                {slice.row.categoryName ?? 'Kategorisiz'}
              </span>
              <span className="tabular shrink-0 font-mono text-[10.5px] text-fg-3">
                %{Math.round(slice.share * 100)}
              </span>
              <Amount value={slice.row.total} currency={currency} />
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

/* ========================================================================== */
/* Eğilim — son altı ayın neti                                                */
/* ========================================================================== */

export interface TrendPoint {
  readonly label: string;
  /** Kanonik para dizesi; negatif olabilir. */
  readonly net: string;
}

/**
 * Net eğilim — alan + çizgi, son nokta vurgulu.
 *
 * ⚠️ SIFIR ÇİZGİSİ DAİMA GÖRÜNÜR. Negatif bir net bir HATA değil bir dönem
 * gerçeğidir (`marks.tsx › NetAmount` aynı kuralı taşır); ölçek yalnızca
 * pozitiflere göre kurulsaydı eksi aylar grafiğin dışına düşer ve eğilim
 * yalanlanırdı.
 */
export function NetTrend({
  points,
  currency,
}: {
  points: readonly TrendPoint[];
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <ChartFrame title="Net eğilim">
        <p className="py-8 text-[12.5px] text-fg-3">
          Eğilim için en az iki dönem gerekiyor. Kayıt girdikçe burada oluşur.
        </p>
      </ChartFrame>
    );
  }

  const values = points.map((point) => safe(point.net));
  // Sıfır ölçeğe DAHİL: eksi aylar da görünür ve taban çizgisi anlamlı kalır.
  const top = Math.max(...values, 0);
  const bottom = Math.min(...values, 0);
  const span = top - bottom || 1;

  const W = 300;
  const H = 96;
  const step = W / (points.length - 1);
  const y = (value: number) => H - ((value - bottom) / span) * H;

  const line = values
    .map((value, index) => `${String(index * step)},${String(y(value))}`)
    .join(' ');
  const area = `0,${String(y(bottom))} ${line} ${String(W)},${String(y(bottom))}`;
  const zeroY = y(0);
  const lastValue = values[values.length - 1] ?? 0;

  return (
    <ChartFrame title="Net eğilim">
      <svg
        viewBox={`0 -6 ${String(W)} ${String(H + 14)}`}
        className="h-[118px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Net eğilim: ${points.map((p) => `${p.label} ${p.net}`).join(', ')}`}
      >
        <defs>
          <linearGradient id="net-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent-rgb) / 0.28)" />
            <stop offset="100%" stopColor="rgb(var(--accent-rgb) / 0.02)" />
          </linearGradient>
        </defs>

        {/* Sıfır çizgisi — kesikli ve sessiz; veriyle yarışmaz. */}
        <line
          x1="0"
          y1={String(zeroY)}
          x2={String(W)}
          y2={String(zeroY)}
          stroke="var(--border-strong)"
          strokeWidth="1"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />

        <polygon points={area} fill="url(#net-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          /* ⚠️ `preserveAspectRatio="none"` çizgiyi de gererdi; bu, kalınlığı
             ölçekten bağımsız tutar. Olmadan çizgi yatayda incelir. */
          vectorEffect="non-scaling-stroke"
        />
        {/* Son nokta vurgulu: "şu an neredeyiz" sorusunun cevabı odur. */}
        <circle
          cx={String(W)}
          cy={String(y(lastValue))}
          r="3.5"
          fill="var(--accent)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-1.5 flex justify-between">
        {points.map((point) => (
          <span
            key={point.label}
            className="font-mono text-[8.5px] tracking-[0.1em] text-fg-3 uppercase"
          >
            {point.label}
          </span>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] text-fg-2">
        Son dönem <Amount value={points[points.length - 1]?.net ?? '0'} currency={currency} />
      </p>
    </ChartFrame>
  );
}

/* ========================================================================== */

/** Grafiklerin ortak çerçevesi — tuvalden yükselen bir yüzey. */
function ChartFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface px-5 py-4 shadow-card">
      <h3 className="mb-3 font-mono text-[8.5px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Kanonik para dizesini geometri için sayıya çevirir; bozuksa 0. */
function safe(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
