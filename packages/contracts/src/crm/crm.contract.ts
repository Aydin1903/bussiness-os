import { z } from 'zod';

/**
 * CRM modülü uçları — api ↔ web paylaşılan şemaları (ADR-0031).
 *
 * ============================================================================
 * BU ŞEMALAR BACKEND `crm.dto.ts` + entity `*State`'LERİNİ YANSITIR (mirror)
 * ============================================================================
 * `knowledge.contract.ts` ile aynı desen ve aynı gerekçe: backend kendi Zod
 * şemalarıyla DOĞRULAR, buradakiler istemcinin istek gövdesini şekillendirmesi
 * ve YANITI çalışma zamanında doğrulaması içindir. Alanlar backend ile birebir
 * tutulur; ayrışırlarsa `apiFetch`'in `schema.parse`'ı ayrışmayı ilk çağrıda
 * yakalar — sessizce yanlış çizilen bir ekran yerine görünür bir hata.
 *
 * ⚠️ Bu dosyayı yazmak API'yi DEĞİŞTİRMEZ. CRM'in yanıt tipleri bugün
 * controller'ların içinde yerel `interface`'lerdir; burası onların istemci
 * tarafındaki karşılığıdır.
 *
 * ============================================================================
 * `tenantId` TAŞINMAZ
 * ============================================================================
 * Backend `*State` nesnelerinde `tenantId` vardır ve yanıtta gider, ama istemci
 * onu KULLANMAZ: hangi tenant'ta olunduğu access token'ın işidir ve gövdeden
 * okunan bir tenant kimliği, olmayan bir seçim varmış izlenimi verir. Zod
 * bilinmeyen alanları düşürdüğü için taşınmaması bir doğrulama hatası değildir.
 *
 * ============================================================================
 * TARİHLER: İKİ FARKLI TİP, İKİ FARKLI BİÇİM
 * ============================================================================
 * `createdAt`/`updatedAt` bir ANDIR — UTC ISO-8601 (`2026-08-07T09:12:00.000Z`)
 * ve ekranda `lib/format/datetime.ts` ile yerel dilime çevrilir.
 * `occurredOn` bir TAKVİM GÜNÜDÜR (PG `date`) — `YYYY-MM-DD`, saati yoktur ve
 * dilim dönüşümüne SOKULMAZ. İkisini aynı biçimde taşımak, "görüşme dün mü
 * bugün mü oldu" sorusunu diliminden dolayı yanlış cevaplatırdı.
 * ============================================================================
 */

/** Backend `crm.dto.ts` ile aynı sınırlar. */
const MAX_NAME = 300;
const MAX_SHORT = 200;

/** ISO takvim günü (`YYYY-MM-DD`) — saat YOK. */
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı');

/**
 * Sayfalı liste zarfı — `GET /me/memberships` ile AYNI desen.
 *
 * ADR-0029'un liste notu: ikinci bir sayfalama paradigması eklemek, her yeni
 * listede "hangisini kullanacağız" sorusunu doğururdu.
 */
function listEnvelope<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/* ========================================================================== */
/* Şirketler                                                                  */
/* ========================================================================== */

export const companySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  industry: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  /** UTC ISO-8601. */
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Company = z.infer<typeof companySchema>;

/**
 * `POST /crm/companies` gövdesi.
 *
 * Opsiyonel alanlar `nullish`: verilmeyebilir (`undefined`) ya da TEMİZLENEBİLİR
 * (`null`). İkisi backend'de de ayrı anlam taşır.
 */
export const createCompanyRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Şirket adı boş olamaz').max(MAX_NAME),
    industry: z.string().trim().max(MAX_SHORT).nullish(),
    email: z.string().trim().max(MAX_SHORT).nullish(),
    phone: z.string().trim().max(MAX_SHORT).nullish(),
    website: z.string().trim().max(MAX_SHORT).nullish(),
  })
  .strict();
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/**
 * `PATCH /crm/companies/:id` gövdesi — KISMİ.
 *
 * `PUT` değil: alanların çoğu nullable ve `PUT` her istekte tam gövde ister,
 * unutulan bir alan SESSİZCE `null`'lanırdı.
 */
export const updateCompanyRequestSchema = createCompanyRequestSchema.partial();
export type UpdateCompanyRequest = z.infer<typeof updateCompanyRequestSchema>;

/**
 * Liste satırı — müşteri + SON TEMAS günü.
 *
 * `lastInteractionOn` `crm.companies`te BİR KOLON DEĞİLDİR; her sorguda
 * `crm.interactions`tan türetilir. `null` = bu müşteriyle hiç görüşülmemiş —
 * sıfır gün DEĞİL, ve ekran ikisini ayırmak zorundadır.
 *
 * Tek kayıt uçları (`GET :id`, `POST`, `PATCH`) bu alanı TAŞIMAZ.
 */
export const companyListRowSchema = companySchema.extend({
  lastInteractionOn: calendarDay.nullable(),
  /** Müşteriye bağlı yetkili sayısı. */
  contactCount: z.number().int().nonnegative(),
  /** AÇIK fırsat sayısı — kapanmışlar (`won`/`lost`) hariç. */
  openOpportunityCount: z.number().int().nonnegative(),
});
export type CompanyListRow = z.infer<typeof companyListRowSchema>;

export const companyListResponseSchema = listEnvelope(companyListRowSchema);
export type CompanyListResponse = z.infer<typeof companyListResponseSchema>;

/* ========================================================================== */
/* Kişiler                                                                    */
/* ========================================================================== */

export const contactSchema = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  fullName: z.string().min(1),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Contact = z.infer<typeof contactSchema>;

export const createContactRequestSchema = z
  .object({
    companyId: z.uuid('companyId geçerli bir UUID olmalı'),
    fullName: z.string().trim().min(1, 'Kişi adı boş olamaz').max(MAX_NAME),
    title: z.string().trim().max(MAX_SHORT).nullish(),
    email: z.string().trim().max(MAX_SHORT).nullish(),
    phone: z.string().trim().max(MAX_SHORT).nullish(),
  })
  .strict();
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/**
 * `companyId` BURADA YOKTUR — backend de kabul etmez.
 *
 * Kişiyi başka şirkete taşımak bir TAŞIMA işlemidir, kısmi güncelleme değil;
 * sessizce izin vermek şirket silindiğinde yanlış kişilerin cascade ile
 * gitmesine yol açardı.
 */
export const updateContactRequestSchema = createContactRequestSchema
  .omit({ companyId: true })
  .partial();
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

export const contactListResponseSchema = listEnvelope(contactSchema);
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;

/* ========================================================================== */
/* Görüşmeler                                                                 */
/* ========================================================================== */

/** Backend ile aynı sınır — uzun bir sınır DoS önlemidir. */
const MAX_INTERACTION_BODY = 20_000;

export const interactionSchema = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  contactId: z.string().nullable(),
  opportunityId: z.string().nullable(),
  authorUserId: z.string().min(1),
  /** Görüşmenin GERÇEKLEŞTİĞİ gün; kayda geçirildiği an değil. */
  occurredOn: calendarDay,
  body: z.string().min(1),
  createdAt: z.string().min(1),
});
export type Interaction = z.infer<typeof interactionSchema>;

export const createInteractionRequestSchema = z
  .object({
    companyId: z.uuid('companyId geçerli bir UUID olmalı'),
    contactId: z.uuid('contactId geçerli bir UUID olmalı').nullish(),
    opportunityId: z.uuid('opportunityId geçerli bir UUID olmalı').nullish(),
    occurredOn: calendarDay,
    body: z.string().trim().min(1, 'Görüşme metni boş olamaz').max(MAX_INTERACTION_BODY),
  })
  .strict();
export type CreateInteractionRequest = z.infer<typeof createInteractionRequestSchema>;

/**
 * `POST /crm/interactions` yanıtı.
 *
 * `chunkCount` istemciye indekslemenin GERÇEKLEŞTİĞİNİ söyler: `0` ise görüşme
 * kaydedilmiştir ama AI onu BULAMAZ. Ekran bu ayrımı gizlemez.
 */
export const createInteractionResponseSchema = z.object({
  interactionId: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
});
export type CreateInteractionResponse = z.infer<typeof createInteractionResponseSchema>;

export const interactionListResponseSchema = listEnvelope(interactionSchema);
export type InteractionListResponse = z.infer<typeof interactionListResponseSchema>;

/** `GET /crm/interactions/unindexed` — kaç görüşme ARANAMAZ durumda. */
export const unindexedInteractionsResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type UnindexedInteractionsResponse = z.infer<typeof unindexedInteractionsResponseSchema>;

/**
 * `POST /crm/reindex` yanıtı.
 *
 * ⚠️ Knowledge'ın ikizinden FARKLI: `remaining` alanı YOKTUR. Bu bir eksiklik
 * değil, backend'in gerçek sözleşmesidir — istemci "bitti mi" sorusunu
 * `GET /crm/interactions/unindexed`'i yeniden çağırarak yanıtlar.
 */
export const reindexInteractionsResponseSchema = z.object({
  repaired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ReindexInteractionsResponse = z.infer<typeof reindexInteractionsResponseSchema>;

/* ========================================================================== */
/* Müşteri özeti (ADR-0032)                                                   */
/* ========================================================================== */

/**
 * `GET /crm/companies/:id/summary` — önbellekten okur, ASLA model çağırmaz.
 *
 * Dört bayrak beş ekran durumunu tam olarak belirler ve hiçbiri diğerinden
 * türetilemez:
 *
 *   summary === null && !generating           → YOK      ("özet çıkar")
 *   summary !== null && !stale                → VAR      (metin + tarih)
 *   summary !== null && stale                 → BAYAT    ("yenile" vurgulu)
 *   generating                                → ÜRETİLİYOR
 *   !summarizable                             → görüşme yok, üretim kapalı
 *
 * ⚠️ `stale` ile "summary yok" AYRI şeylerdir: hiç üretilmemiş bir özet bayat
 * DEĞİLDİR. İkisini birleştirmek, hiç özeti olmayan bir müşteride "özet güncel
 * değil" demek olurdu.
 */
export const companySummarySchema = z.object({
  summary: z.string().nullable(),
  generatedAt: z.string().nullable(),
  /** Üretildiğinden bu yana kaynaklar değişti mi. Özet yoksa `false`. */
  stale: z.boolean(),
  /** Şu anda başka bir istek üretiyor mu. */
  generating: z.boolean(),
  /** Özetlenecek görüşme var mı — üretme düğmesi buna bakar. */
  summarizable: z.boolean(),
});
export type CompanySummary = z.infer<typeof companySummarySchema>;

/**
 * `POST /crm/companies/:id/summary` yanıtı.
 *
 * `regenerated: false` ise İSRAF FRENİ devreye girdi: kaynakların imzası
 * değişmemişti ve model hiç çağrılmadı. Arayüz bunu kullanıcıya söylemek
 * ZORUNDA — yoksa "yenile"ye basıp metnin aynı kalması bir hata gibi görünür.
 */
export const generateCompanySummaryResponseSchema = companySummarySchema.extend({
  regenerated: z.boolean(),
});
export type GenerateCompanySummaryResponse = z.infer<typeof generateCompanySummaryResponseSchema>;

/* ========================================================================== */
/* Fırsatlar                                                                  */
/* ========================================================================== */

export const opportunityStageSchema = z.enum([
  'potential',
  'in_discussion',
  'proposal_sent',
  'won',
  'lost',
]);
export type OpportunityStage = z.infer<typeof opportunityStageSchema>;

/**
 * Aşama sırası — HAT bu sırayla çizilir.
 *
 * Bu bir SUNUM sırasıdır, bir iş kuralı DEĞİL: backend aşama geçişlerinde
 * hiçbir sıra dayatmaz (`lost` → `in_discussion` geçerli bir istektir ve 200
 * döner). Sıralamayı burada sabitlemek, her ekranın kendi sırasını
 * uydurmasını önler.
 */
export const OPPORTUNITY_STAGE_ORDER: readonly OpportunityStage[] = [
  'potential',
  'in_discussion',
  'proposal_sent',
  'won',
  'lost',
];

/**
 * KAPANMIŞ aşamalar — backend `CLOSED_STAGES` ile aynı küme.
 *
 * Takipler görünümü bunları dışlar (kapanan fırsat listeden kendiliğinden
 * düşer) ve arayüzdeki "kaç gündür bekliyor" uyarısı da çizilmez: kazanılmış
 * bir anlaşmanın aylardır "kazanıldı" aşamasında durması beklenen şeydir.
 */
export const CLOSED_OPPORTUNITY_STAGES: readonly OpportunityStage[] = ['won', 'lost'];

/** Ekranda görünen Türkçe aşama adları — tek kaynak. */
export const OPPORTUNITY_STAGE_LABELS: Readonly<Record<OpportunityStage, string>> = {
  potential: 'Potansiyel',
  in_discussion: 'Görüşülüyor',
  proposal_sent: 'Teklif gönderildi',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
};

/** `numeric` — string olarak taşınır; para kayan noktalı sayıda tutulmaz. */
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Tutar en fazla iki ondalıklı pozitif sayı olmalı');

/**
 * Tek fırsat kaydı — `POST` · `PATCH` · `GET :id` yanıtı.
 *
 * ⚠️ `companyName` YOKTUR: tek kayıt uçlarında şirket zaten bağlamdan bellidir
 * ve backend de göndermez. Liste satırı için `opportunityListRowSchema`.
 */
export const opportunitySchema = z.object({
  id: z.string().min(1),
  companyId: z.string().min(1),
  contactId: z.string().nullable(),
  title: z.string().min(1),
  stage: opportunityStageSchema,
  estimatedValue: z.string().nullable(),
  currency: z.string().nullable(),
  /** TAKVİM GÜNÜ (`YYYY-MM-DD`), an değil. */
  nextFollowUpOn: calendarDay.nullable(),
  /** Yalnızca aşama GERÇEKTEN değiştiğinde ilerler (UTC ISO-8601). */
  stageChangedAt: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Opportunity = z.infer<typeof opportunitySchema>;

/**
 * Liste satırı — fırsat + ŞİRKET ADI (Slice 8b join'i).
 *
 * Hat şirketler arası bir görünümdür; her kart hangi şirkete ait olduğunu
 * söylemek zorundadır. `companyId` de korunur: id bağlantı için (`/app/crm/<id>`),
 * ad gösterim için.
 */
export const opportunityListRowSchema = opportunitySchema.extend({
  companyName: z.string().min(1),
});
export type OpportunityListRow = z.infer<typeof opportunityListRowSchema>;

/**
 * Liste sıralaması (`GET /crm/opportunities?order=…`).
 *
 * `recent` VARSAYILANDIR — mevcut yüzeylerin davranışı değişmez.
 * `priority` "önce gecikmiş takipler, sonra en son güncellenen" demektir ve
 * Fırsatlar ekranının sütun başına yalnızca birkaç kart göstermesi buna
 * dayanır: sıralama sunucuda yapılmazsa, çekilen sayfanın dışında kalan
 * gecikmiş bir fırsat hiç görünmezdi.
 */
export const opportunityOrderSchema = z.enum(['recent', 'priority']);
export type OpportunityOrder = z.infer<typeof opportunityOrderSchema>;

export const opportunityListResponseSchema = listEnvelope(opportunityListRowSchema);
export type OpportunityListResponse = z.infer<typeof opportunityListResponseSchema>;

export const createOpportunityRequestSchema = z
  .object({
    companyId: z.uuid('companyId geçerli bir UUID olmalı'),
    contactId: z.uuid('contactId geçerli bir UUID olmalı').nullish(),
    title: z.string().trim().min(1, 'Fırsat başlığı boş olamaz').max(MAX_NAME),
    /** Verilmezse `potential` — hat hep baştan başlar. */
    stage: opportunityStageSchema.default('potential'),
    estimatedValue: money.nullish(),
    currency: z.string().trim().max(10).nullish(),
    nextFollowUpOn: calendarDay.nullish(),
  })
  .strict();
export type CreateOpportunityRequest = z.infer<typeof createOpportunityRequestSchema>;

/**
 * `companyId` BURADA YOKTUR — backend de kabul etmez.
 *
 * Fırsatı başka şirkete taşımak bir TAŞIMA işlemidir; sessizce izin vermek
 * şirket silindiğinde yanlış fırsatların cascade ile gitmesine yol açardı.
 */
export const updateOpportunityRequestSchema = createOpportunityRequestSchema
  .omit({ companyId: true })
  .partial();
export type UpdateOpportunityRequest = z.infer<typeof updateOpportunityRequestSchema>;

/* ========================================================================== */
/* Takipler                                                                   */
/* ========================================================================== */

/**
 * Takip satırı — fırsat ENTITY'si DEĞİL, türetilmiş bir projeksiyon.
 *
 * ⚠️ Ayrı bir `follow_ups` tablosu YOKTUR (ADR-0031 §3): görünüm
 * `crm.opportunities` üzerinde bir sorgudur. Somut sonucu, kapanan fırsatın
 * listeden KENDİLİĞİNDEN düşmesidir.
 *
 * `nextFollowUpOn` burada `nullable` DEĞİLDİR: tarihi olmayan fırsat sorguya
 * hiç girmez.
 */
export const followUpSchema = z.object({
  opportunityId: z.string().min(1),
  title: z.string().min(1),
  stage: opportunityStageSchema,
  companyId: z.string().min(1),
  companyName: z.string().min(1),
  nextFollowUpOn: calendarDay,
});
export type FollowUp = z.infer<typeof followUpSchema>;

export const followUpListResponseSchema = listEnvelope(followUpSchema);
export type FollowUpListResponse = z.infer<typeof followUpListResponseSchema>;
