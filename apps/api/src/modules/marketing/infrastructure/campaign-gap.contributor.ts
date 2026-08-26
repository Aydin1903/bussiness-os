import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type CampaignGapRow,
  type CampaignGapSnapshot,
  type MarketingRepository,
} from '../application/marketing.repository.port';
import { CAMPAIGN_READ } from '../marketing.permissions';

/**
 * `campaign-gap` — "bitmis ama SONUCU YAZILMAMIS kampanya" (ADR-0047 §3.3).
 *
 * ============================================================================
 * ⚠️ DORT TESTIN DORDUNU DE GECEN ILK ADAY
 * ============================================================================
 * ADR-0047 §3.3 uc aday degerlendirdi; ikisi reddedildi:
 *
 *   `campaign-performance` -> ⚠️ v1'de HEDEF diye bir alan YOK; olmayan
 *                             veriden UYDURMA BIR YARGI uretirdi.
 *   `campaign-schedule`    -> ⚠️ `appointment-schedule` BIREBIR AYNI SEKIL ve
 *                             dort denetimde havuza giremedi; saglikli bandi
 *                             bir SAYIMDIR.
 *   ⚠️ `campaign-gap`      -> DORT TESTI DE GECTI.
 *
 * ============================================================================
 * ⚠️ DORDUNCU OLCUT MANTIKEN BASKA TURLU GECEMEZDI
 * ============================================================================
 * ADR-0045'in olcutu: _"ayni haberi soyleyen bir ses zaten var mi?"_
 *
 * ⚠️ Burada haber, METNIN YOKLUGUDUR. Sonuc notu olmayan bir kampanyanin
 * VEKTORU DE YOKTUR (`embeddableContent()` `null` doner), yani
 * `campaign-notes` o kayittan hicbir kosulda bahsedemez.
 * ⚠️ Iki katkicinin ORTUSME KUMESI BOSTUR — ADR-0045'teki durumun TAM AYNASI
 * (orada yapisal ozet, anlamsal katkicinin ZAYIF BIR OZETI olurdu).
 *
 * ============================================================================
 * ⚠️ "KOSULLU SESSIZ" BIR KAYNAK — VE BU BIR MUAFIYET DEGILDIR
 * ============================================================================
 * Bosluk yoksa katkici HIC KONUSMAZ (`[]` doner) ve `retrieval.select`e
 * `status: "empty"` diye gecer — yani T2'ye SAYILMAZ ve taban yuvasi ISGAL
 * ETMEZ (ADR-0049 §3.4).
 *
 * ⚠️ Ama bu, esikten MUAF oldugu anlamina gelmez: bosluk VARKEN sayilir.
 * ADR-0049 §3.4'un yazili uyarisi — _"kosullu sessizlik esigi KALDIRMAZ,
 * yalnizca ne siklikta atesledigini degistirir"_.
 * ============================================================================
 */
export const CAMPAIGN_GAP_SOURCE = 'campaign-gap';

/** Cevaba en fazla kac bosluk satiri girer. */
const GAP_LIMIT = 3;

/**
 * Skor merdiveni — ⚠️ DUZ SABIT DEGIL, RISKE GORE.
 *
 * ADR-0031/0033'un politikasi: duz bir 0.95 yazmak sakin bir tenant'ta bile
 * alarm bandini isgal ederdi (ADR-0033 Slice 6'nin CRM'i hizalama gerekcesi).
 */
const SCORE_MANY_GAPS = 0.95;
const SCORE_SOME_GAPS = 0.9;
const SCORE_HEALTHY = 0.75;

/** Bu sayidan itibaren bosluk bir "birikinti"dir, tekil bir unutkanlik degil. */
const MANY_GAPS = 3;

@Injectable()
export class CampaignGapContributor implements RetrievalContributor {
  readonly source = CAMPAIGN_GAP_SOURCE;
  readonly contributionKind = 'structural' as const;
  readonly permission = CAMPAIGN_READ;

  constructor(
    private readonly repository: MarketingRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
  ) {}

  async contribute(): Promise<ContextFragment[]> {
    const today = this.clock.now().toISOString().slice(0, 10);

    const snapshot = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.gapSnapshot({ today, limit: GAP_LIMIT }),
    );

    // ⚠️ HIC KAMPANYA YOKSA SUSAR — bos bir tenant'ta konusacak bir sey yok.
    if (snapshot.totalCount === 0) {
      return [];
    }

    // ⚠️ BOSLUK YOKSA DA SUSAR — ve iste "kosullu sessiz kaynak" budur.
    //
    // ⚠️ Alternatif (saglikli bandda "12 kampanya var, hepsi kapatilmis"
    // demek) REDDEDILDI: o bir SAYIMDIR, ADR-0043'un `"12 aktif calisan"`
    // adayiyla ayni sinif — her cagride AYNI CUMLEYI kurar ve bir taban
    // yuvasini haber tasimadan isgal ederdi.
    if (snapshot.gapCount === 0) {
      return [];
    }

    const score = scoreFor(snapshot);

    return [
      {
        content: describeSummary(snapshot),
        score,
        source: CAMPAIGN_GAP_SOURCE,
        // Bir SATIRA degil DURUMA isaret eder (`inventory-stock`in deseni).
        reference: { kind: 'campaign-gap', id: 'unclosed-campaigns' },
      },
      ...snapshot.gaps.map((row) => ({
        content: describeGap(row),
        score,
        source: CAMPAIGN_GAP_SOURCE,
        reference: { kind: 'campaign', id: row.id },
      })),
    ];
  }
}

function scoreFor(snapshot: CampaignGapSnapshot): number {
  if (snapshot.gapCount >= MANY_GAPS) {
    return SCORE_MANY_GAPS;
  }
  return snapshot.gapCount > 0 ? SCORE_SOME_GAPS : SCORE_HEALTHY;
}

function describeSummary(snapshot: CampaignGapSnapshot): string {
  return [
    'Kampanya takibi',
    `${String(snapshot.totalCount)} kampanya · ${String(snapshot.openCount)} yayinda`,
    `⚠️ ${String(snapshot.gapCount)} KAMPANYA SONUCU YAZILMADAN KAPANDI`,
  ].join(' · ');
}

/**
 * ⚠️ Cumle, `campaign-notes`in cumlesini TEKRAR ETMEZ — edemez de: bu
 * kayitlarin sonuc notu YOKTUR. Soyledigi sey bir EKSIKTIR, bir icerik degil.
 */
function describeGap(row: CampaignGapRow): string {
  const parts = [`Sonucu yazilmamis kampanya: ${row.name}`];

  if (row.channel !== null) {
    parts.push(row.channel);
  }
  if (row.endsOn !== null) {
    parts.push(`bitisi ${row.endsOn}`);
  }
  // ⚠️ Takvimde bitmis ama hala `active` gorunen kampanya AYRI bir haberdir:
  // yalnizca sonuc yazilmamis degil, KAPATILMAMIS da.
  if (row.status === 'active') {
    parts.push('⚠️ hala yayinda gorunuyor');
  }

  return parts.join(' · ');
}
