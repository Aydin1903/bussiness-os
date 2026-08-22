import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type InvoicingRepository,
  type OpenQuoteCount,
  type PipelineQuote,
} from '../application/invoicing.repository.port';
import { computeDocumentTotals } from '../domain/document-money';
import { type SalesDocumentLine } from '../domain/sales-document-line.entity';
import { QUOTE_READ } from '../invoicing.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const INVOICING_PIPELINE_SOURCE = 'invoicing-pipeline';

/** Her alarm bandinda gosterilecek EN FAZLA belge — icerik SABIT ve KUCUK. */
const BAND_LIMIT = 4;

/**
 * ============================================================================
 * ⚠️ SKOR RISKE GORE — DUZ SABIT SKOR YASAK
 * ============================================================================
 * ADR-0031 §5.4 / Projeler Slice 6'da hizalanan politika, ALTINCI kez. Aritmetik
 * bunu her zamankinden zorunlu kiliyor:
 *
 *   global top-K              = 8
 *   yapisal taban (ADR-0036)  = ceil(8/3) = 3
 *   yapisal katkici sayisi    = 6   ← BU MODULLE 5'TEN 6'YA CIKTI
 *
 * ⚠️ ADR-0036'NIN YENIDEN GOZDEN GECIRME ESIGI (tabanin IKI KATI = 6) BU
 * MODULLE ASILIYOR. Bu, ADR-0041 §4.3'un Product Owner'a acikca sordugu
 * karardir ve onay ALINMISTIR: katkici eklenir, ADR-0036 BU ISTE
 * DEGISTIRILMEZ, revizyon kapanis denetimindeki CANLI DAGILIM OLCUMUNDEN SONRA
 * ayri bir ADR (0042 adayi) olarak yapilir.
 *
 * ⚠️ Bunun pratik sonucu: ALTI yapisal kaynak UC garanti yuva icin
 * siralanacak, yani YARISINDAN AZI her cevapta duyulacak. Sabit skor veren bir
 * katkici digerlerini SISTEMATIK olarak disari iterdi — o yuzden merdiven:
 *
 *   kabul edilmis ama FATURALANMAMIS teklif -> 0.95  (para masada)
 *   suresi DOLMUS teklif                     -> 0.95  (cevap gelemez)
 *   N gundur CEVAPSIZ teklif                 -> 0.90  (takip gerekiyor)
 *   acik tekliflerin ozeti                   -> 0.75  (bilgi; anlatisala yenilir)
 *
 * Sonuc kendi kendini duzenler: saglikli bir hatta teklif satirlari yuvalari
 * anlatisal icerige birakir, para masada kaldiginda one cikar.
 * ============================================================================
 */
const SCORE_MONEY_ON_TABLE = 0.95;
const SCORE_EXPIRED = 0.95;
const SCORE_STALE = 0.9;
const SCORE_HEALTHY = 0.75;

/**
 * Teklif/Fatura'nin YAPISAL katkisi (ADR-0041 §4).
 *
 * ============================================================================
 * NEDEN YAPISAL, VE NEDEN TEK
 * ============================================================================
 * _"Hangi teklifimiz cevap bekliyor?"_ ve _"kabul edildi ama faturasini
 * kesmedigimiz ne var?"_ sorularinin cevabi bir METINDE YAZMAZ; `status`,
 * `valid_until` ve `converted_from_id` kolonlarinin ARITMETIGINDE yazar.
 *
 * ⚠️ Bu modulun ANLAMSAL katkicisi YOKTUR (§5) ve bu, ADR-0040'in TAM
 * AYNASIDIR: Tedarikci'nin yalnizca anlamsal, bunun yalnizca yapisal
 * katkicisi var.
 *
 *   Tedarikci  -> gorusme notu ANLATISALDIR, durumu yoktur
 *   Teklif/Fat -> belge DURUMDUR, anlatisi yoktur
 *
 * Bir teklif kalemi ("M8 civata · 500 adet · 12,50") embed edilseydi ADR-0034
 * §6.1'in tarif ettigi sey olurdu: yuzlerce neredeyse OZDES kisa vektor,
 * K=8'lik havuzu kirletir ve diger kaynaklarin en iyi parcalarini disari iter.
 *
 * ============================================================================
 * ⚠️ ICERIK SABIT VE KUCUK — VE TUTARLAR DOMAIN'DEN GELIR
 * ============================================================================
 * Her bantta en fazla `BAND_LIMIT` belge. Belge NOTU buraya GIRMEZ (§5 —
 * anlamsal katkici yok, yani notun hicbir yolu yok ve bu bilincli).
 *
 * ⚠️ Alarm bantlarindaki tutarlar SATIRLAR YUKLENEREK, `computeDocumentTotals`
 * ile hesaplanir — SQL'de DEGIL. Sebep: satir bazinda yuvarlama kuralinin
 * IKINCI bir uygulamasi (SQL) zamanla ayrisir ve hata SESSIZDIR. Acik teklif
 * ozeti bu yuzden yalnizca SAYIM tasir (sinirsiz kume, satirlari yuklenemez).
 */
@Injectable()
export class InvoicingPipelineContributor implements RetrievalContributor {
  readonly source = INVOICING_PIPELINE_SOURCE;
  /** ADR-0036: kolonlardan TURETILEN yapisal ozet — havuzda taban yuva hakki. */
  readonly contributionKind = 'structural' as const;
  readonly permission = QUOTE_READ;

  constructor(
    private readonly repository: InvoicingRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    /**
     * Bir teklifin "cevapsiz bekliyor" sayilmasi icin gecmesi gereken gun.
     *
     * ⚠️ WEB'DE AYNI ESIGI GOSTEREN BIR SABIT VARSA IKISI SENKRON KALMAK
     * ZORUNDADIR — `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrismasinin
     * DORDUNCU tekrari. Ayrisirlarsa hata sessizdir: ekran "bekliyor" der,
     * katkici 0.75 verir.
     */
    private readonly staleQuoteDays: number,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki DETERMINISTIKTIR; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const now = this.clock.now();

    const { snapshot, lines } = await this.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const taken = await this.repository.snapshotPipeline({
          today: toCalendarDay(now),
          staleBefore: shiftDays(now, -this.staleQuoteDays),
          limit: BAND_LIMIT,
        });

        // ⚠️ TEK sorgu ile TUM adaylarin satirlari: tekil bir cagri N+1
        // uretirdi (`findNames`in toplu olmasiyla ayni disiplin).
        const ids = [...taken.acceptedNotInvoiced, ...taken.expired, ...taken.stale].map(
          (quote) => quote.id,
        );

        return { snapshot: taken, lines: await this.repository.listLinesByDocumentIds(ids) };
      },
    );

    const hasAnything =
      snapshot.acceptedNotInvoiced.length > 0 ||
      snapshot.expired.length > 0 ||
      snapshot.stale.length > 0 ||
      snapshot.openCounts.length > 0;

    // ⚠️ HICBIR SEY YOKSA HICBIR SEY GONDERILMEZ — ADR-0036 §2'nin DOGRUDAN
    // gereksinimi: yapisal TABAN yalnizca "gercekten satir donduren" kaynaklara
    // yuva ayirir. Hic teklif yazmamis bir tenant'ta "0 teklif" demek, modele
    // bilgi degil GURULTU tasir ve sekiz yuvadan birini — hem de GARANTILI bir
    // yuvayi — bosa harcardi.
    if (!hasAnything) {
      return [];
    }

    return [
      ...snapshot.acceptedNotInvoiced.map((quote) =>
        quoteFragment(quote, lines, {
          score: SCORE_MONEY_ON_TABLE,
          label: 'Kabul edildi, FATURASI KESILMEDI',
        }),
      ),
      ...snapshot.expired.map((quote) =>
        quoteFragment(quote, lines, {
          score: SCORE_EXPIRED,
          label: 'Gecerlilik suresi DOLDU, cevap gelmedi',
        }),
      ),
      ...snapshot.stale.map((quote) =>
        quoteFragment(quote, lines, {
          score: SCORE_STALE,
          label: `${String(this.staleQuoteDays)} gundur cevapsiz`,
        }),
      ),
      ...(snapshot.openCounts.length > 0 ? [openSummaryFragment(snapshot.openCounts)] : []),
    ];
  }
}

/** Tek teklif — TEK SATIRLIK dogal dil, JSON ya da tablo DEGIL. */
function quoteFragment(
  quote: PipelineQuote,
  lines: ReadonlyMap<string, SalesDocumentLine[]>,
  options: { score: number; label: string },
): ContextFragment {
  const totals = computeDocumentTotals((lines.get(quote.id) ?? []).map((line) => line.toState()));

  const parts = [
    `Teklif uyarisi: ${quote.number ?? 'numarasiz'}`,
    quote.customerName,
    // ⚠️ Tutar PARA BIRIMIYLE yazilir, ciplak sayi olarak DEGIL — ADR-0034'un
    // "para birimleri toplanmaz" kuralinin dogrudan sonucu: birimsiz bir sayi,
    // modelin farkli para birimlerini TOPLAYABILECEGINI ima ederdi.
    `${totals.total} ${quote.currency}`,
    options.label,
  ];

  if (quote.validUntil !== null) {
    parts.push(`gecerlilik ${quote.validUntil}`);
  }

  return {
    content: parts.join(' · '),
    score: options.score,
    source: INVOICING_PIPELINE_SOURCE,
    reference: { kind: 'quote', id: quote.id },
  };
}

/**
 * Acik tekliflerin ozeti — SAYIM, tutar DEGIL.
 *
 * ⚠️ ADR-0041 §4.1'in parantez icinden ("sayi + para birimi bazinda tutar")
 * BILINCLI bir daraltma. Gerekce `invoicing.repository.port.ts`te yazili:
 * tutari SQL'de toplamak, satir bazinda yuvarlama kuralinin IKINCI bir
 * uygulamasi demekti ve iki aritmetik zamanla AYRISIR — belgede yazan toplam
 * ile katkida yazan toplam farkli olur, ikisi de "dogru" gorunur.
 */
function openSummaryFragment(counts: readonly OpenQuoteCount[]): ContextFragment {
  const breakdown = counts.map((row) => `${String(row.count)} adet ${row.currency}`).join(', ');

  return {
    content: `Teklif ozeti: cevap bekleyen acik teklifler — ${breakdown}`,
    score: SCORE_HEALTHY,
    source: INVOICING_PIPELINE_SOURCE,
    // ⚠️ `id` bir SATIR id'si DEGIL, kumenin adidir — bu katkinin isaret ettigi
    // sey bir kayit degil bir DURUMDUR. Uydurulmus bir UUID dondurmek, arayuzun
    // acamayacagi bir baglanti vaat ederdi (`inventory-summary`nin ayni karari).
    reference: { kind: 'quote-summary', id: 'open-quotes' },
  };
}

/** `Date` -> `YYYY-MM-DD` (UTC). */
function toCalendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Gun kaydirma — `Date` aritmetigi TEK yerde. */
function shiftDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
