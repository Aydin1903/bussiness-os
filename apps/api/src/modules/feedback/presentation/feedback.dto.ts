import { z } from 'zod';

import {
  MAX_FEEDBACK_CHANNEL_CHARS,
  MAX_FEEDBACK_COMMENT_CHARS,
  MAX_RATING,
  MIN_RATING,
} from '../domain/feedback-response.entity';

/**
 * Geri bildirim istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * ISO 8601 AN — takvim gunu DEGIL (ADR-0045 §1.1).
 *
 * ⚠️ `z.iso.datetime()` OFFSET ISTER (`Z` ya da `+03:00`); ofsetsiz bir dize
 * REDDEDILIR ve bu KASITLIDIR (ADR-0035'in dersi, ikinci kez). Ofsetsiz
 * `2026-08-25T14:30` sunucunun yerel saatine gore yorumlanirdi — yani ayni
 * istek iki farkli sunucuda IKI FARKLI ANI kaydederdi ve fark SESSIZ olurdu.
 *
 * ⚠️ Zod yalnizca ISO KALIBINI dogrular; `2026-02-31T10:00:00Z` bu kalibi
 * GECEBILIR ve gercek bir an olup olmadigi DOMAINDE kontrol edilir
 * (`InvalidFeedbackReceivedAtError`) — kontrol edilmeseydi `Invalid Date`
 * sessizce veritabanina kadar gider ve kullanici 422 yerine 500 alirdi.
 *
 * ⚠️ `date` DEGIL `timestamptz` secilmesinin sebebi §1.1'dedir: bir geri
 * bildirim bir ANDA gelir ve ayni gun icindeki SIRASI anlamlidir. Tedarikci
 * gorusmesi (`occurred_on`, `date`) tersi karardi.
 */
const instant = z.iso.datetime({ offset: true, message: 'Zaman ISO 8601 (ofsetli) olmali' });

/**
 * ⚠️ OLCEK SABIT 1..5 — ve UC KATMANDA korunuyor (§1.3):
 *
 *     Zod    -> istemciye HIZLI ve ALAN ADIYLA cevap verir (burasi)
 *     domain -> HTTP'yi ATLAYAN her yolu baglar (`assertRating`)
 *     CHECK  -> UYGULAMAYI ATLAYAN her yolu baglar (migration `0037`)
 *
 * ⚠️ `.int()` SART: `4.5` yalnizca `min/max` ile gecerdi ve `smallint` kolonuna
 * yazilirken PostgreSQL onu YUVARLARDI — kullanici 422 yerine SESSIZCE FARKLI
 * BIR PUAN kaydederdi.
 *
 * ⚠️ `scale` alani YOKTUR: NPS bir sayi degil bir METODOLOJIDIR (§1.3, §10).
 */
const rating = z.coerce
  .number()
  .int('Puan tam sayi olmali')
  .min(MIN_RATING, `Puan en az ${String(MIN_RATING)} olmali`)
  .max(MAX_RATING, `Puan en fazla ${String(MAX_RATING)} olabilir`);

export const createFeedbackSchema = z
  .object({
    rating,

    /**
     * ⚠️ `nullish()` — YORUM OPSIYONELDIR (§1.4).
     *
     * Tedarikci'nin `body`si ZORUNLUYDU ("metinsiz bir gorusme kaydi diye bir
     * sey yoktur"); burada tersi: gercek geri bildirimlerin cogu YALNIZCA BIR
     * PUANDIR (QR kod, tek tikla anket). Zorunlu kilmak kullaniciyi `"-"`
     * yazmaya iterdi ve havuza ANLAMSIZ VEKTORLER girerdi (ADR-0033'un "sahte
     * Genel projesi" dersi).
     *
     * ⚠️ BEDELI §3.5'te kayitli ve gizlenmiyor: yorumsuz bir kaydin
     * `POST /ask` havuzunda HICBIR SESI OLMAZ.
     *
     * ⚠️ UST SINIR DOMAINDEN GELIR (`MAX_FEEDBACK_COMMENT_CHARS`), burada ICAT
     * EDILMEZ. Kaynagi `shared/chunking.ts`in TEK PARCA hedefidir: bu modulde
     * chunking YOKTUR (§1.2), dolayisiyla metnin TAMAMI bir parcanin
     * buyuklugunde kalmak zorundadir.
     *
     * ⚠️ SINIR ASILIRSA 422 — SESSIZ KIRPMA YOK. Zod burada da reddeder, domain
     * de reddeder; ikisi AYNI sabiti okur.
     */
    comment: z.string().trim().max(MAX_FEEDBACK_COMMENT_CHARS).nullish(),

    /**
     * ⚠️ SERBEST METIN (§1.5) — enum DEGIL, tenant-tanimli sozluk DE degil.
     *
     * Kanal listesi tenant'a gore degisir (Google, Trendyol, telefon, kagit
     * form); bir enum ILK MUSTERIDE yanlis olurdu.
     *
     * ⚠️ Kabul edilen bedel: `"google"` ve `"Google"` iki ayri deger olur ve
     * kanala gore gruplama GUVENILMEZDIR. Kanal bir ETIKETTIR, bir boyut degil.
     */
    channel: z.string().trim().max(MAX_FEEDBACK_CHANNEL_CHARS).nullish(),

    /**
     * ⚠️ OPSIYONEL VE `null` YAYGIN DURUMDUR (§6.2): gercek geri bildirimlerin
     * cogu ANONIMDIR.
     *
     * ⚠️ Zorunlu olsaydi kullanici SAHTE CRM KISILERI acardi — ve bedeli bu
     * modulde kalmazdi: BASKA BIR MODULUN (CRM'in) musteri listesi kirlenirdi.
     *
     * Kisinin GORUNURLUGU use case'te dogrulanir (`#assertContactVisible`) ve
     * kapi `ContactDirectory`nin ICINDEDIR — goremedigi bir kisiye geri bildirim
     * baglayamaz.
     */
    crmContactId: z.uuid('crmContactId gecerli bir UUID olmali').nullish(),

    /**
     * ⚠️ ZORUNLU ve ISTEMCIDEN GELIR: kayit GECMISE DONUK girilebilir (dun
     * gelen bir telefon, gecen hafta doldurulmus bir kagit form). `now()`
     * varsayilani, gecmis kayitlari BUGUNE yigar ve "son 30 gun" penceresini
     * anlamsizlastirirdi.
     */
    receivedAt: instant,
  })
  .strict();

/**
 * ⚠️ `updateFeedbackSchema` DIYE BIR SEMA YOKTUR — VE ARANMASIN.
 *
 * Kayit GUNCELLENMEZ (§2): bir geri bildirim BIZIM SOZUMUZ DEGIL, bir ucuncu
 * kisinin beyanidir. Bir `PATCH` semasi yazmak, olmayan bir ucun VAR OLDUGUNU
 * ima ederdi — ve uc yazilsa bile `feedback:write` izni olmadigi icin 403,
 * veritabani yetkisi olmadigi icin de `permission denied` alirdi.
 *
 * Yanlis girilen bir kaydin yolu: SIL ve YENIDEN GIR (`feedback:delete`,
 * owner/admin).
 */

export const listFeedbackQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),

    /**
     * Puan bandi filtresi — ekranin "dusuk / orta / yuksek" seridi.
     *
     * ⚠️ ANLAMSAL ARAMA DEGIL (ADR-0011, ONUNCU kez): bu bir LISTE
     * FILTRESIDIR. Yorum metni uzerinde arama YOKTUR — ne anlamsal ne klasik;
     * anlamsal arama `POST /ask`in isidir.
     */
    minRating: rating.optional(),
    maxRating: rating.optional(),
  })
  .strict()
  .refine(
    (query) =>
      query.minRating === undefined ||
      query.maxRating === undefined ||
      query.minRating <= query.maxRating,
    { message: 'minRating, maxRating degerinden buyuk olamaz' },
  );

/**
 * `POST /feedback/reindex` govdesi.
 *
 * ============================================================================
 * ⚠️ BOS GOVDE — VE BU, ADR-0040'TAN AYRILDIGIMIZ YER
 * ============================================================================
 * `reindexSuppliersSchema` opsiyonel bir `supplierId` tasiyordu cunku onarimin
 * IKI isi vardi: (1) eksik vektor, (2) BAYAT baslik (tedarikci yeniden
 * adlandirilinca).
 *
 * Burada IKINCI IS YOKTUR (§4): basligin uc bileseni de (tarih · puan · kanal)
 * DEGISTIRILEMEZ (§2), yani BU MODULDE BAYATLAMA PENCERESI YOKTUR — projede
 * ILK. Hedef parametresi eklemek, olmayan bir ihtiyaci IMA EDERDI.
 *
 * ⚠️ `.strict()` yine de bos bir nesne bekler: bilinmeyen bir anahtar
 * gonderen istemci 422 alir ve yanlis varsayimini HEMEN ogrenir.
 */
export const reindexFeedbackSchema = z.object({}).strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>;
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;
export type ReindexFeedbackBody = z.infer<typeof reindexFeedbackSchema>;
