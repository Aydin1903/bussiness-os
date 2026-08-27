import { z } from 'zod';

/**
 * Sadakat Programi sozlesmeleri (ADR-0051).
 *
 * ⚠️ Sinirlar BURADA yasar ve IKI TARAF DA onlari okur: sunucu bu sayilari
 * dogrular, arayuz ayni sayilari sayaclarda gosterir. Iki yerde ayri
 * yazilsalardi ekran bir sayi der, sunucu baska bir sayida 422 dondururdu ve
 * fark SESSIZ olurdu.
 */
export const MAX_POINT_ENTRY_NOTE_CHARS = 160;

/**
 * ⚠️ ARITMETIK EKSEN — isaretli puan DEGIL (ADR-0051 §1.4).
 *
 * ADR-0034 §5 (gelir/gider) ve ADR-0039 §3 (giris/cikis) kararlarinin UCUNCU
 * uygulamasi: miktar HER ZAMAN POZITIFTIR, yon ayri bir alanda yasar.
 *
 * ⚠️ UCUNCU BIR DEGER YOKTUR: "duzeltme" bir yon degildir, TERS YONDE BIR
 * SATIRDIR (ADR-0041'in iskonto karariyla ayni sekil).
 *
 * ⚠️ Bu liste veritabanindaki `point_entries_direction_valid` CHECK'i ve
 * API'nin Zod semasiyla SENKRON kalmak zorundadir.
 */
export const POINT_DIRECTIONS = ['earn', 'spend'] as const;
export type PointDirection = (typeof POINT_DIRECTIONS)[number];

const instant = z.iso.datetime({ offset: true });

/**
 * Bir musterinin sadakat hesabi.
 *
 * ⚠️ `balance` SAKLANMAZ, HER OKUMADA TURETILIR (ADR-0051 §4.1) — sunucuda
 * `balance` diye bir kolon YOKTUR. Projede ON DORDUNCU kez ayni karar.
 *
 * ⚠️ VE ARAYUZ ONU KENDI HESAPLAMAZ: defter satirlarini toplamak, ekranin
 * yalnizca GORDUGU SAYFAYI toplamasi demekti ve sayfalama yuzunden SESSIZCE
 * yanlis olurdu. Bakiye tek dogruluk kaynagindan (`BALANCE_SUM`) gelir.
 */
export const loyaltyAccountSchema = z.object({
  id: z.uuid(),
  /**
   * ⚠️ ZORUNLU — projede ILK zorunlu cross-modul isaretcisi (ADR-0051 §6.1).
   * Bes modulde "zorunluluk sahte kayit uretir" dersi burada TERS ISLER.
   */
  crmContactId: z.uuid(),
  /**
   * ⚠️ Kolonda SAKLANMAZ, her okumada CRM'den cozulur.
   *
   * ⚠️ `null` GELEBILIR ve bu modulde bedeli DIGERLERINDEN AGIRDIR: adi
   * cozulemeyen bir hesap KULLANILAMAZ (kimin oldugu bilinmeyen bir bakiye).
   * Satir yine de listeden DUSMEZ — dusseydi bakiye gorunmez olurdu ve
   * duvarin toplami listeyle TUTMAZDI.
   */
  contactName: z.string().nullable(),
  balance: z.number().int(),
  entryCount: z.number().int().min(0),
  /** ⚠️ TURETILMIS (`max(occurred_at)`) — `last_activity_at` kolonu YOKTUR. */
  lastEntryAt: instant.nullable(),
  createdByUserId: z.uuid(),
  createdAt: instant,
});
export type LoyaltyAccount = z.infer<typeof loyaltyAccountSchema>;

export const loyaltyAccountListResponseSchema = z.object({
  items: z.array(loyaltyAccountSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
});
export type LoyaltyAccountListResponse = z.infer<typeof loyaltyAccountListResponseSchema>;

export const createLoyaltyAccountRequestSchema = z.object({
  crmContactId: z.uuid(),
});
export type CreateLoyaltyAccountRequest = z.infer<typeof createLoyaltyAccountRequestSchema>;

/**
 * Defterin tek satiri — ⚠️ DEGISTIRILEMEZ (ADR-0051 §2.3).
 *
 * ⚠️ Bir `updatePointEntry` / `deletePointEntry` sozlesmesi YOKTUR ve
 * olmayacaktir: bir satiri degistirmek BUGUNKU BAKIYEYI SESSIZCE YENIDEN
 * YAZAR. `feedback`in ayni sekli, ikinci kez.
 */
export const pointEntrySchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  direction: z.enum(POINT_DIRECTIONS),
  /** ⚠️ HER ZAMAN POZITIF — isaret `direction`dadir (§1.4). */
  points: z.number().int().positive(),
  note: z.string().nullable(),
  occurredAt: instant,
  createdByUserId: z.uuid(),
  createdAt: instant,
});
export type PointEntry = z.infer<typeof pointEntrySchema>;

export const pointEntryListResponseSchema = z.object({
  items: z.array(pointEntrySchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
});
export type PointEntryListResponse = z.infer<typeof pointEntryListResponseSchema>;

export const createPointEntryRequestSchema = z.object({
  direction: z.enum(POINT_DIRECTIONS),
  points: z.number().int().positive(),
  note: z.string().max(MAX_POINT_ENTRY_NOTE_CHARS).nullish(),
  occurredAt: instant.nullish(),
});
export type CreatePointEntryRequest = z.infer<typeof createPointEntryRequestSchema>;

/**
 * ⚠️ CEVAP YENI BAKIYEYI TASIR — ve bu, ISTEMCININ HESAPLAMAMASININ karsiligidir.
 *
 * ADR-0051 §4.2: kullanici KAC PUAN harcanacagini yazar, yeterli olup
 * olmadigina SUNUCU karar verir (`SELECT ... FOR UPDATE` altinda). Istemci
 * kendi bakiyesini guncelleseydi, es zamanli bir hareket sonrasi ekranda
 * SESSIZCE yanlis bir sayi kalirdi.
 */
export const createPointEntryResponseSchema = z.object({
  entry: pointEntrySchema,
  balance: z.number().int(),
});
export type CreatePointEntryResponse = z.infer<typeof createPointEntryResponseSchema>;

/**
 * Duvarin ozeti (ADR-0051 §9.1).
 *
 * ⚠️ `outstandingPoints` PROJEDE ILK KEZ ANLAMLI BIR TOPLAMDIR: ADR-0034'un
 * para birimi kurali ve ADR-0039'un birim kurali burada TETIKLENMEZ — puanin
 * para birimi YOKTUR ve tek bir birim vardir ("puan").
 *
 * ⚠️ Yine de bir PARA rakami DEGILDIR: puanin karsiligi bu modulde
 * modellenmez (§10), yani "12.400 puan" bir TL degeri ifade etmez ve arayuz
 * onu para gibi bicimlendirmez.
 */
export const loyaltySummarySchema = z.object({
  windowDays: z.number().int().min(1),
  /** Dolasimdaki toplam puan — duvarin kahraman rakami ve bir YUKUMLULUK. */
  outstandingPoints: z.number().int(),
  accountCount: z.number().int().min(0),
  earnedInWindow: z.number().int().min(0),
  spentInWindow: z.number().int().min(0),
});
export type LoyaltySummary = z.infer<typeof loyaltySummarySchema>;
