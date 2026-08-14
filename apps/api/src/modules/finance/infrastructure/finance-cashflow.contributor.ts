import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import {
  type CashflowSummary,
  type CashflowUseCases,
  type CurrencySummary,
} from '../application/cashflow.use-cases';
import { shiftDays, toCalendarDay } from '../domain/calendar-day';
import { CASHFLOW_READ } from '../finance.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const FINANCE_CASHFLOW_SOURCE = 'finance-cashflow';

/** Pencere uzunlugu (gun). "Son 30 gun" ve "onceki 30 gun". */
const WINDOW_DAYS = 30;

/** En fazla kac PARA BIRIMI satiri. Yapisal katki HER SORUDA gonderilir. */
const CURRENCY_LIMIT = 3;

/** Para birimi satirina eklenecek EN BUYUK kac gider kategorisi. */
const TOP_CATEGORY_LIMIT = 2;

/**
 * ============================================================================
 * SKOR RISKE GORE — ARTIK UC YAPISAL KATKICI AYNI HAVUZU PAYLASIYOR
 * ============================================================================
 * `ProjectStatusContributor`in Slice 6'da kurdugu politika, UCUNCU kez ve ILK
 * GUNDEN uygulaniyor. Aritmetik bunu zorunlu kiliyor:
 *
 *   global top-K = 8 (`KNOWLEDGE_RETRIEVAL_LIMIT`)
 *   CRM yapisal 3 + Projeler yapisal 5 + Finans yapisal 3  =  11 > 8
 *
 * Ucu de sabit yuksek skor verseydi yapisal satirlar sekiz yuvanin TAMAMINI
 * kaplar ve soru ne kadar anlatisal olursa olsun DORT anlamsal kaynagin
 * hicbiri giremezdi.
 *
 * Cozum modul basina KOTA DEGIL (ADR-0031 §5.1 onu acikca reddetti): skoru
 * ANLAMLI kilmak. Port zaten "0..1, yuksek = daha alakali" diyor.
 *
 *   son 30 gun net NEGATIF                 -> 0.95  (gercekten alarm)
 *   net pozitif ama ONCEKI donemden DUSUK  -> 0.90  (dikkat)
 *   saglikli                                -> 0.75  (bilgi; anlatisala yenilir)
 *
 * Sonuc kendi kendini duzenler: SAGLIKLI bir tenant'ta finans satirlari
 * yuvalari anlatisal icerige birakir, SIKISIK bir tenant'ta one cikar.
 * ============================================================================
 */
const SCORE_NEGATIVE = 0.95;
const SCORE_DECLINING = 0.9;
const SCORE_HEALTHY = 0.75;

/**
 * Finans'in YAPISAL katkisi (ADR-0034 §6.2).
 *
 * ============================================================================
 * NEDEN YAPISAL KATKICI GEREKLI
 * ============================================================================
 * _"Gecen ay ne kadar harcadik?"_ sorusunun cevabi bir yorumda YAZMAZ; `amount`
 * kolonunda yazar. Yalnizca anlatisal veriyi gomseydik model bu soruyu bayat
 * yorumlardan TAHMIN EDEREK cevaplardi — ve kendinden emin sekilde yanilirdi.
 * Bu, CRM ve Projeler'de verilmis ayni kararin ucuncusudur.
 *
 * ============================================================================
 * ⚠️ OZET `CashflowUseCases`TEN OKUNUR, YENIDEN HESAPLANMAZ
 * ============================================================================
 * Katkici kendi SQL'ini yazabilirdi (`ProjectStatusContributor` oyle yapiyor).
 * Burada yapilmadi ve gerekce SESSIZ SAPMA riskidir: ayni ozet iki yerde
 * hesaplansaydi, `GET /finance/summary`in gosterdigi rakam ile AI'in soyledigi
 * rakam zamanla AYRISABILIRDI. Kullanici ekranda bir sayi, asistandan baska bir
 * sayi duyardi ve hangisinin dogru oldugunu bilemezdi.
 *
 * Tek kaynak: ozetin nasil hesaplandigi `CashflowUseCases`te yasar.
 *
 * ============================================================================
 * ⚠️ PARA BIRIMLERI BURADA DA TOPLANMAZ
 * ============================================================================
 * Her para birimi KENDI fragment'ini alir. Tek bir "net" cumlesi uretmek,
 * modele 2000 TRY + 2000 USD = 4000 dedirtmek olurdu — ve model bunu KENDINDEN
 * EMIN bicimde tekrarlardi.
 */
@Injectable()
export class FinanceCashflowContributor implements RetrievalContributor {
  readonly source = FINANCE_CASHFLOW_SOURCE;
  /** ADR-0036: kolonlardan TURETILEN yapisal ozet — havuzda taban yuva hakki. */
  readonly contributionKind = 'structural' as const;
  readonly permission = CASHFLOW_READ;

  constructor(
    private readonly cashflow: CashflowUseCases,
    private readonly clock: Clock,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki deterministiktir; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const today = toCalendarDay(this.clock.now());

    // Iki pencere BITISIK ve CAKISMIYOR: [t-59 .. t-30] ve [t-29 .. t].
    const currentFrom = shiftDays(today, -(WINDOW_DAYS - 1));
    const previousTo = shiftDays(currentFrom, -1);
    const previousFrom = shiftDays(previousTo, -(WINDOW_DAYS - 1));

    const [current, previous] = await Promise.all([
      this.cashflow.summarize({ from: currentFrom, to: today, includeCategories: true }),
      // Onceki pencerede kirilim GEREKMEZ: yalnizca `net` karsilastirilacak.
      this.cashflow.summarize({ from: previousFrom, to: previousTo, includeCategories: false }),
    ]);

    const previousNet = netByCurrency(previous);

    return current.currencies
      .slice(0, CURRENCY_LIMIT)
      .map((row) => toFragment(row, previousNet.get(row.currency) ?? null, currentFrom, today));
  }
}

/** Onceki pencerenin para birimi -> net haritasi. */
function netByCurrency(summary: CashflowSummary): ReadonlyMap<string, string> {
  return new Map(summary.currencies.map((row) => [row.currency, row.net]));
}

/**
 * Bir para birimini TEK SATIRLIK dogal dile cevirir.
 *
 * JSON ya da tablo DEGIL — `toProjectFragment` / `describeOpportunity` ile ayni
 * gerekce: JSON sozdizimine token harcar; tek buyuk tablo ATOMIK olurdu (top-K'da
 * ya tamami girer ya hicbiri) ve `reference` tek bir kayda isaret edemezdi.
 */
function toFragment(
  row: CurrencySummary,
  previousNet: string | null,
  from: string,
  to: string,
): ContextFragment {
  const trend = classify(row.net, previousNet);

  const parts = [
    `Nakit akisi ${row.currency} (${from} - ${to})`,
    `gelir ${row.income}`,
    `gider ${row.expense}`,
    // Isareti ACIKCA soyle: modelin "-1200.00" dizesinden kendi cikarim
    // yapmasini beklemek guvenilmez.
    trend === 'negative' ? `net ${row.net} — NEGATIF NAKIT AKISI` : `net ${row.net}`,
  ];

  if (previousNet !== null) {
    parts.push(
      trend === 'declining'
        ? `onceki 30 gun net ${previousNet} — DUSUS`
        : `onceki 30 gun net ${previousNet}`,
    );
  }

  const topExpenses = (row.categories ?? [])
    .filter((category) => category.direction === 'expense')
    .slice(0, TOP_CATEGORY_LIMIT)
    .map((category) => `${category.categoryName ?? 'Kategorisiz'} ${category.total}`);

  if (topExpenses.length > 0) {
    parts.push(`en buyuk giderler: ${topExpenses.join(', ')}`);
  }

  return {
    content: parts.join(' · '),
    score: SCORE_BY_TREND[trend],
    source: FINANCE_CASHFLOW_SOURCE,
    // ⚠️ `id` bir SATIR id'si DEGIL, para birimi kodudur — cunku bu katkinin
    // isaret ettigi sey bir kayit degil bir KOVADIR. Uydurulmus bir UUID
    // dondurmek, arayuzun acamayacagi bir baglanti vaat ederdi.
    reference: { kind: 'cashflow', id: row.currency },
  };
}

type Trend = 'negative' | 'declining' | 'healthy';

const SCORE_BY_TREND: Readonly<Record<Trend, number>> = {
  negative: SCORE_NEGATIVE,
  declining: SCORE_DECLINING,
  healthy: SCORE_HEALTHY,
};

/**
 * Skoru belirleyen SINIFLANDIRMA.
 *
 * ============================================================================
 * ⚠️ PARANIN `number`A CEVRILDIGI TEK YER — ve cikti degil KARAR uretiyor
 * ============================================================================
 * `money.ts` bastan sona parayi dize tutar. Burada `Number()` cagriliyor ama
 * uretilen sey bir TUTAR DEGIL, bir skor secimidir; gosterilen deger DAIMA
 * orijinal dizedir (`row.net`, `previousNet`). Yani yuvarlama hatasi ciktiya
 * SIZAMAZ — en kotu ihtimalle bir sinir degerde 0.90 yerine 0.75 secilir.
 *
 * Aralik da guvenli: `numeric(20,2)` toplamlari IEEE754'un tam temsil sinirinin
 * cok altindadir (gerekce `money.ts`).
 *
 * ⚠️ ONCEKI DONEM YOKSA "DUSUS" DENMEZ: yeni bir tenant'in ilk ayinda her sey
 * "dusus" gorunurdu ve katkici surekli yuksek skorla one cikardi.
 */
function classify(net: string, previousNet: string | null): Trend {
  if (Number(net) < 0) {
    return 'negative';
  }

  if (previousNet !== null && Number(net) < Number(previousNet)) {
    return 'declining';
  }

  return 'healthy';
}
