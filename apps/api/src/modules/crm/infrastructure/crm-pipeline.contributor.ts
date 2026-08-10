import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type OpportunityRepository,
  type PipelineRow,
} from '../application/opportunity.repository.port';
import { OPPORTUNITY_READ } from '../crm.permissions';
import { type OpportunityStage } from '../domain/opportunity.entity';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const CRM_PIPELINE_SOURCE = 'crm-pipeline';

/**
 * Yapisal katki HER SORUDA gonderilir; bu yuzden SABIT ve KUCUK tutulur.
 *
 * 8 yuvanin en fazla 3'unu alir; 5 yuva anlamsal icerige kalir.
 */
const PIPELINE_LIMIT = 3;

/**
 * ============================================================================
 * SKOR RISKE GORE — DUZ 0.95 TERK EDILDI (ADR-0033 Slice 6, PO onayi)
 * ============================================================================
 * Bu katkicinin skoru bastan beri SABIT 0.95'ti ve TEK yapisal katkiciyken
 * dogru calisiyordu. Projeler ikinci yapisal katkiciyi getirince ARITMETIK
 * degisti:
 *
 *   global top-K = 8 (`KNOWLEDGE_RETRIEVAL_LIMIT`)
 *   CRM 3 satir @0.95  +  Projeler 5 satir @0.95  =  8
 *
 * Yani sabit skorla iki yapisal katkici sekiz yuvanin TAMAMINI kaplayabilir ve
 * soru ne kadar anlatisal olursa olsun anlamsal icerik disari duserdi.
 *
 * Projeler (Slice 4) bunu skoru ANLAMLI kilarak cozdu; CRM o gun DOKUNULMADI
 * ve iki katkici FARKLI politika izler hale geldi. Tutarsizlik bilincliydi ve
 * bu denetime madde olarak yazilmisti — burada kapaniyor.
 *
 * Cozum modul basina KOTA DEGIL (ADR-0031 §5.1 onu acikca reddetti): port
 * zaten "0..1, yuksek = daha alakali" diyor, yani skoru anlamli kilmak
 * sozlesmeye UYGUNDUR.
 *
 *   takip GECIKMIS      -> 0.95  (gercekten alarm)
 *   asamada UZUN suredir -> 0.90  (dikkat)
 *   saglikli acik firsat -> 0.75  (bilgi; anlamsal icerige yenilir)
 *
 * Sonuc kendi kendini duzenler: saglikli bir hatta yapisal satirlar yuvalari
 * anlatisal icerige birakir, sorunlu bir hatta one cikar.
 *
 * ⚠️ ADR-0031'in "skorlar kaynaklar arasi KALIBRE DEGIL" bilinen siniri
 * KAPANMADI — yalnizca zararsizlastirildi. Gercek cozum yeniden siralamadir
 * (rerank) ve ayri bir istir.
 * ============================================================================
 */
const SCORE_OVERDUE = 0.95;
const SCORE_STALE = 0.9;
const SCORE_OPEN = 0.75;

const STAGE_LABELS: Readonly<Record<OpportunityStage, string>> = {
  potential: 'Potansiyel',
  in_discussion: 'Gorusuluyor',
  proposal_sent: 'Teklif verildi',
  won: 'Kazanildi',
  lost: 'Kaybedildi',
};

/**
 * CRM'in YAPISAL katkisi (ADR-0031 §5.4).
 *
 * ============================================================================
 * KATKICI VEKTOR TABANLI OLMAK ZORUNDA DEGIL
 * ============================================================================
 * Port `contribute()` der, `search()` demez — ve bu kasitlidir. "Hangi
 * anlasmalar takipte gecikti?" sorusunun cevabi bir gorusme notunda YAZMAZ;
 * `next_follow_up_on` kolonunda yazar.
 *
 * Yalnizca anlatisal veriyi gomseydik model bu soruyu bayat toplanti
 * notlarindan TAHMIN EDEREK cevaplardi ve kendinden emin sekilde yanilirdi.
 * "Modul AI'a hangi baglami kazandirir" sorusunun CRM'deki cevabi yalnizca
 * gorusmeler DEGILDIR.
 * ============================================================================
 */
@Injectable()
export class CrmPipelineContributor implements RetrievalContributor {
  readonly source = CRM_PIPELINE_SOURCE;
  readonly permission = OPPORTUNITY_READ;

  constructor(
    private readonly repository: OpportunityRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    /** Asamada bu kadar gun bekleyen firsat DURGUN sayilir (config). */
    private readonly staleStageDays: number,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki deterministiktir; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const rows = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.listOpenPipeline({ limit: PIPELINE_LIMIT }),
    );

    const today = this.clock.now();

    return rows.map((row) => ({
      content: describeOpportunity(row, today),
      score: scoreFor(row, today, this.staleStageDays),
      source: CRM_PIPELINE_SOURCE,
      reference: { kind: 'opportunity', id: row.opportunityId },
    }));
  }
}

/**
 * Bir firsatin RISK seviyesini skora cevirir (bkz. dosya basindaki blok).
 *
 * Yuklemler `describeOpportunity`in yazdigi metinle AYNI kaynaklardan gelir:
 * gecikme `nextFollowUpOn`dan, durgunluk `stageChangedAt`ten. Ikisi ayrisirsa
 * model "GECIKMIS" yazan bir satiri dusuk skorla gorur — ya da tersi.
 */
function scoreFor(row: PipelineRow, today: Date, staleStageDays: number): number {
  const overdueFollowUp =
    row.nextFollowUpOn !== null &&
    daysBetween(new Date(`${row.nextFollowUpOn}T00:00:00.000Z`), today) > 0;

  if (overdueFollowUp) {
    return SCORE_OVERDUE;
  }

  return daysBetween(row.stageChangedAt, today) >= staleStageDays ? SCORE_STALE : SCORE_OPEN;
}

/**
 * Bir firsati TEK SATIRLIK dogal dile cevirir.
 *
 * ============================================================================
 * NEDEN JSON DEGIL, NEDEN TABLO DEGIL
 * ============================================================================
 * JSON sozdizimine token harcar ve modeli yapiyi papagan gibi tekrarlamaya
 * davet eder. Tek buyuk tablo ise ATOMIK olurdu: top-K'da ya tamami girer ya
 * hicbiri, ve `reference` tek bir kayda isaret edemezdi (kaynak atfi zayiflar).
 *
 * Firsat basina bir fragment: her biri gercek bir `opportunity` id'sine
 * referans verir, yani yanittaki `sources` tiklanabilir kalir.
 * ============================================================================
 */
function describeOpportunity(row: PipelineRow, today: Date): string {
  const parts = [row.companyName, row.title, STAGE_LABELS[row.stage]];

  if (row.estimatedValue !== null) {
    parts.push(`${row.estimatedValue} ${row.currency ?? ''}`.trim());
  }

  // `stage_changed_at` sinyali: "bu firsat kac gundur ayni asamada".
  // Slice 5'te bu sayacin no-op guncellemelerle SIFIRLANMAMASI ozellikle
  // saglanmisti — okundugu yer burasi.
  parts.push(`${String(daysBetween(row.stageChangedAt, today))} gundur bu asamada`);

  if (row.nextFollowUpOn !== null) {
    parts.push(describeFollowUp(row.nextFollowUpOn, today));
  }

  return parts.join(' · ');
}

function describeFollowUp(nextFollowUpOn: string, today: Date): string {
  const due = new Date(`${nextFollowUpOn}T00:00:00.000Z`);
  const days = daysBetween(due, today);

  // GECIKMIS olani acikca soyle: modelin tarihten kendi cikarim yapmasini
  // beklemek, "bugun ne?" sorusuna cevap veremedigi icin guvenilmez.
  return days > 0
    ? `takip ${nextFollowUpOn} (${String(days)} gun GECIKMIS)`
    : `takip ${nextFollowUpOn}`;
}

/** Tam gun farki. Negatifse 0 (gelecek tarih "gecikmis" degildir). */
function daysBetween(from: Date, to: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay));
}
