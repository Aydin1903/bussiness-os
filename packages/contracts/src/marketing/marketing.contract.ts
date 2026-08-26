import { z } from 'zod';

/**
 * Kampanya / Pazarlama Notlari sozlesmeleri (ADR-0047).
 *
 * ⚠️ Sinirlar BURADA yasar ve IKI TARAF DA onlari okur: sunucu bu sayilari
 * dogrular, arayuz ayni sayilari sayaclarda gosterir. Iki yerde ayri
 * yazilsalardi ekran "1250 karakter" der, sunucu baska bir sayida 422
 * dondururdu ve fark SESSIZ olurdu.
 */
export const MAX_CAMPAIGN_NAME_CHARS = 160;
export const MAX_CAMPAIGN_CHANNEL_CHARS = 80;
export const MAX_CAMPAIGN_RESULT_NOTE_CHARS = 1250;

/**
 * ⚠️ SABIT ENUM — `channel`in TAM TERSI (ADR-0047 §1.6).
 *
 * `channel` serbest metindir cunku degerleri TENANT'A GORE degisir; `status`un
 * degerleri IS MANTIGINI SURER. ⚠️ `cancelled` YOKTUR: iptal edilen kampanya
 * YAPILMAMIS kampanyadir ve kaydi SILINIR.
 *
 * ⚠️ Bu liste veritabanindaki `campaigns_status_valid` CHECK'i ve API'nin Zod
 * semasiyla SENKRON kalmak zorundadir.
 */
export const CAMPAIGN_STATUSES = ['draft', 'active', 'done'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const instant = z.iso.datetime({ offset: true });
/** ⚠️ TAKVIM GUNU — bir AN degil (ADR-0047 §1.5). Kampanyanin saati yoktur. */
const calendarDay = z.iso.date();

export const campaignSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  channel: z.string().nullable(),
  startsOn: calendarDay,
  /** ⚠️ `null` = ACIK UCLU kampanya — gercek bir durum, eksik veri degil. */
  endsOn: calendarDay.nullable(),
  status: z.enum(CAMPAIGN_STATUSES),
  resultNote: z.string().nullable(),
  crmCompanyId: z.uuid().nullable(),
  /** ⚠️ Kolonda SAKLANMAZ, her okumada CRM'den cozulur (ADR-0047 §6.1). */
  companyName: z.string().nullable(),
  createdByUserId: z.uuid(),
  createdAt: instant,
  updatedAt: instant,
  /**
   * ⚠️ SUNUCUDA TURETILEN "bosluk" bayragi — bitmis ama sonucu yazilmamis.
   *
   * ⚠️ ARAYUZ BUNU KENDI HESAPLAMAZ ve hesaplamamalidir. Tanim sunucudaki
   * `resultGapExpression` SQL ifadesidir ve UC tuketiciyle paylasilir:
   * `campaign-gap` katkicisi (`POST /ask`), duvarin `missingResultCount`u ve
   * bu bayrak. ⚠️ Arayuzde ikinci bir hesap, ADR-0047'nin kapanis
   * denetiminin kaydettigi riski geri getirirdi: ekran bir sey der, `/ask`
   * baska bir sey sayar ve fark SESSIZ olur.
   */
  resultGap: z.boolean(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const campaignListResponseSchema = z.object({
  items: z.array(campaignSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
});
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;

export const createCampaignRequestSchema = z.object({
  name: z.string().min(1).max(MAX_CAMPAIGN_NAME_CHARS),
  channel: z.string().max(MAX_CAMPAIGN_CHANNEL_CHARS).nullish(),
  startsOn: calendarDay,
  endsOn: calendarDay.nullish(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  resultNote: z.string().max(MAX_CAMPAIGN_RESULT_NOTE_CHARS).nullish(),
  crmCompanyId: z.uuid().nullish(),
});
export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;

/**
 * ⚠️ BU SEMA VARDIR — ve `feedback`te YOKTU (orada kayit GUNCELLENMEZDI).
 *
 * Kampanya HER DURUMDA duzenlenebilir, `done` DAHIL (ADR-0047 §2.2): sonuc
 * notu tanimi geregi kampanya BITTIKTEN SONRA yazilir. Kilit olsaydi kullanici
 * kampanyayi yapay olarak `active` tutardi — yani DURUM YALAN SOYLERDI.
 */
export const updateCampaignRequestSchema = createCampaignRequestSchema.partial();
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;

/**
 * Duvarin ozeti (ADR-0047 §9).
 *
 * ⚠️ `GET /campaigns/summary` BIR KATKICI DEGILDIR — ADR-0045'in kapanis
 * denetiminin ucuncu bulgusu burada ONCEDEN uygulaniyor. `missingResultCount`
 * ile `campaign-gap` katkicisi AYNI KUMEYI sayar ama:
 *
 *   ozet  -> yalnizca EKRANA gider, taban yuvasi tuketmez, T2'yi etkilemez
 *   katkici -> `POST /ask` havuzuna girer
 *
 * ⚠️ Kaydedilmeseydi ileride birisi "zaten ozet var" diye yapisal katkiciyi
 * BEDAVA sanabilirdi.
 */
export const campaignSummarySchema = z.object({
  windowDays: z.number().int().min(1),
  /** Bugun yayinda olan kampanya sayisi — duvarin kahraman rakami. */
  activeCount: z.number().int().min(0),
  /** Pencerede biten kampanya sayisi. */
  endedInWindow: z.number().int().min(0),
  /** ⚠️ Bitmis ama SONUC NOTU YAZILMAMIS — `campaign-gap`in kumesi. */
  missingResultCount: z.number().int().min(0),
  /** ⚠️ Sonuc notu olmayan TUM kampanyalar — asistanin aramasina girmeyenler. */
  unsearchableCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
});
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;

export const reindexCampaignsResponseSchema = z.object({
  repaired: z.number().int().min(0),
  failed: z.number().int().min(0),
});
export type ReindexCampaignsResponse = z.infer<typeof reindexCampaignsResponseSchema>;
