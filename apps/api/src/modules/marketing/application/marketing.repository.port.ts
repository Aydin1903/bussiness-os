import { type Campaign, type CampaignStatus } from '../domain/campaign.entity';

export const MARKETING_REPOSITORY = Symbol('MARKETING_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** `reindex`in onaracagi kayit — ⚠️ vektoru `NULL` olan, sonuc notu OLAN. */
export interface UnindexedCampaign {
  readonly id: string;
  readonly name: string;
  readonly channel: string | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly resultNote: string;
}

/** Anlamsal katkicinin dondurdugu satir. */
export interface SimilarCampaign {
  readonly id: string;
  readonly name: string;
  readonly channel: string | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly resultNote: string;
}

/**
 * ⚠️ `campaign-gap` katkicisinin girdisi (ADR-0047 §3.3, Aday 3).
 *
 * ============================================================================
 * ⚠️ HABER, METNIN YOKLUGUDUR — ve bu yuzden ANLAMSAL KATKICI ONA ULASAMAZ
 * ============================================================================
 * ADR-0045'in dorduncu olcutu (_"ayni haberi soyleyen bir ses zaten var mi?"_)
 * burada TAM AYNAYLA geciyor: sonuc notu olmayan bir kampanyanin VEKTORU DE
 * YOKTUR (`embeddableContent()` `null` doner), yani `campaign-notes` o kayittan
 * hicbir kosulda bahsedemez. ⚠️ Iki katkicinin ORTUSME KUMESI BOSTUR.
 */
export interface CampaignGapRow {
  readonly id: string;
  readonly name: string;
  readonly channel: string | null;
  readonly endsOn: string | null;
  readonly status: CampaignStatus;
}

/**
 * `campaign-gap`in anlik goruntusu.
 *
 * ⚠️ `openCount` BOSLUKTAN AYRI TUTULUYOR: "kac kampanya yayinda" bir
 * SAYIMDIR (ADR-0043'un reddedilen _"12 aktif calisan"_ adayi), "kac tanesi
 * kapatilmadan birakildi" bir HABERDIR. Ayni satirda dururlar ama skoru
 * belirleyen YALNIZCA ikincisidir.
 */
export interface CampaignGapSnapshot {
  readonly gaps: readonly CampaignGapRow[];
  readonly gapCount: number;
  readonly openCount: number;
  readonly totalCount: number;
}

/**
 * Duvarin ozeti (ADR-0047 §9).
 *
 * ⚠️ `campaign-gap` KATKICISININ `gapSnapshot`INDAN AYRI TUTULDU — ADR-0045'in
 * kapanis denetiminin ucuncu bulgusu burada ONCEDEN uygulaniyor:
 * `GET /campaigns/summary` BIR KATKICI DEGILDIR. Ayni kumeyi sayiyor gorunur
 * ama yalnizca EKRANA gider; havuza girmez, taban yuvasi tuketmez, T2'yi
 * etkilemez. Tek metoda indirmek o ayrimi kodda GORUNMEZ kilardi.
 */
export interface CampaignSummaryRow {
  readonly activeCount: number;
  readonly endedInWindow: number;
  readonly missingResultCount: number;
  readonly unsearchableCount: number;
  readonly totalCount: number;
}

export interface MarketingRepository {
  insertCampaign(campaign: Campaign): Promise<void>;
  updateCampaign(campaign: Campaign): Promise<number>;
  findCampaignById(id: string): Promise<Campaign | null>;
  listCampaigns(input: {
    limit: number;
    offset: number;
    status: CampaignStatus | null;
  }): Promise<ListPage<Campaign>>;
  deleteCampaignById(id: string): Promise<number>;

  setCampaignEmbedding(input: { id: string; embedding: readonly number[] }): Promise<number>;
  /**
   * ⚠️ Vektoru `NULL`'A CEKER (ADR-0047 §4.2.1).
   *
   * ⚠️ Bir "temizlik" degil, BILINCLI BIR KARAR: bayat bir vektor DOLU
   * gorunur — `reindex`in `NULL` arayan sorgusu onu BULAMAZ, ekran
   * "aranabilir" der ve `/ask` ESKI ICERIKLE cevap verir. Hata SESSIZDIR.
   * `NULL` ise GORUNUR ve onarilabilir.
   */
  clearCampaignEmbedding(id: string): Promise<number>;
  findUnindexedCampaigns(limit: number): Promise<UnindexedCampaign[]>;

  findSimilarCampaigns(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarCampaign[]>;

  gapSnapshot(input: { today: string; limit: number }): Promise<CampaignGapSnapshot>;
  summarize(input: { today: string; since: string }): Promise<CampaignSummaryRow>;
}
