import { z } from 'zod';

/**
 * Belge istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 *
 * ============================================================================
 * ⚠️ YUKLEME GOVDESI `multipart/form-data` — VE BU HER ALANI DIZE YAPAR
 * ============================================================================
 * Projede ILK KEZ bir uc JSON DISI bir govde aliyor. Sonucu bu dosyanin
 * sekline dogrudan yansiyor: `multipart` alanlari HER ZAMAN dizedir; `null`,
 * `undefined` ve sayi diye bir sey YOKTUR.
 *
 * Bu yuzden yukleme semasi `nullish()` DEGIL, "bos dize = verilmedi" kuralini
 * kullanir. JSON alan `PATCH` semasi ise ONCEKI BES MODULLE AYNI kalir
 * (`null` = temizle, `undefined` = dokunma) — ikisini ayni sekilde yazmak,
 * tasima bicimlerinin gercekten farkli oldugu bir yerde sahte bir benzerlik
 * uretirdi.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Etiket ust siniri.
 *
 * ⚠️ Etiket BAGLAM BASLIGINA girer (ADR-0037 §8.1), yani her parcanin metnine
 * eklenir ve TOKEN harcar. Sinirsiz birakmak, bir kullanicinin 2000 karakterlik
 * bir "etiket" yazip belgenin her parcasini o metinle sismesine izin vermek
 * olurdu — 300 parcali bir belgede ayni metin 300 kez gomulurdu.
 */
const MAX_LABEL_CHARS = 120;

/**
 * `multipart` metin alani: bos dize "verilmedi" demektir.
 *
 * ⚠️ `undefined`A CEVIRIYOR, `null`A DEGIL. Fark onemli: yukleme yolunda
 * "temizle" diye bir sey YOKTUR (henuz temizlenecek bir deger yok) ve iki
 * kavrami tek tipte birlestirmek, `PATCH`teki gercek ayrimi bulaniklastirirdi.
 */
const optionalFormText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value));

const optionalFormUuid = optionalFormText.pipe(z.uuid('Gecerli bir UUID olmali').optional());

/**
 * Yukleme govdesi — DOSYA HARIC (dosya `FileInterceptor` ile ayrilir).
 *
 * ⚠️ `.strict()` YOK ve bu BILINCLI bir sapmadir. `multipart` istekleri
 * tarayicilar ve HTTP istemcileri tarafindan ek alanlarla (ornegin
 * `Content-Type` sinirlari icin uretilen yardimci alanlar) genisletilebilir;
 * `.strict()` bu istekleri 422 ile reddederdi ve hata KULLANICININ
 * ANLAYAMAYACAGI bir yerde olurdu. Taninmayan alanlar sessizce ATILIR —
 * govdenin kendisi zaten dosya tasiyor, gizli bir yazma yuzeyi yok.
 */
export const createDocumentSchema = z.object({
  /**
   * SERBEST etiket (ADR-0037 §2) — sabit enum ya da tenant sozlugu YOK.
   *
   * ⚠️ Bos dize `undefined`a duser ve domain onu `null`a cevirir: "girilmedi"
   * ile "bos girildi" AYNI seydir.
   */
  label: optionalFormText.pipe(z.string().max(MAX_LABEL_CHARS).optional()),

  /**
   * CROSS-MODUL YUMUSAK REFERANSLAR (ADR-0037 §4) — hedefler `crm.contacts.id`
   * ve `projects.projects.id`.
   *
   * ⚠️ IKISI DE OPSIYONEL VE BAGIMSIZ: bir belge ikisine birden, yalnizca
   * birine ya da HICBIRINE bagli olabilir. Zorunlu kilmak kullaniciyi sahte
   * baglantilar kurmaya iterdi — bir sirket ana kira sozlesmesi hicbirine ait
   * degildir.
   *
   * ⚠️ ALAN ADLARI `contactId` / `projectId`, kolon adlari `crm_contact_id` /
   * `project_id`. Kolonda `crm_` oneki VAR cunku bir veritabani satirinda
   * "hangi modulun kisisi" sorusu baska hicbir yerde yazmiyor; API govdesinde
   * ise baglam zaten belgedir.
   *
   * Verilen id'ler yazma aninda GORUNURLUK acisindan dogrulanir: goremedigin
   * bir kisiye/projeye belge baglayamazsin. Kontrol ilgili modulun public
   * interface'i uzerinden yapilir ve izin kapilari O ARAYUZLERIN ICINDEDIR.
   */
  contactId: optionalFormUuid,
  projectId: optionalFormUuid,
});

/**
 * KISMI metadata guncellemesi — JSON govde, DOSYA DEGISMEZ.
 *
 * ⚠️ Dosya degisimi AYRI BIR UCTADIR (`PUT /documents/:id/file`, ADR-0037 §10).
 * Ayni uca koymak JSON ve `multipart` govdelerini tek bir dogrulama semasinda
 * birlestirmeyi gerektirirdi; ustelik ikisinin YAN ETKISI taban tabana zittir —
 * biri bir kolonu yazar, digeri bir dosyayi ve TUM parcalari degistirir.
 *
 * ⚠️ `null` = TEMIZLE, `undefined` = DOKUNMA. Bes modulde ayni ayrim.
 *
 * ⚠️ ETIKET DEGISIMI PARCALARI YENIDEN URETIR (§8.1 — etiket baglam basliginin
 * parcasidir) ve ORAN SINIRI PAYI ODER. Baglanti degisimi odemez.
 */
export const updateDocumentSchema = z
  .object({
    label: z.string().trim().max(MAX_LABEL_CHARS).nullable(),
    contactId: z.uuid('contactId gecerli bir UUID olmali').nullable(),
    projectId: z.uuid('projectId gecerli bir UUID olmali').nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

/**
 * Liste sorgusu.
 *
 * ⚠️ ETIKET FILTRESI BUYUK-KUCUK HARF DUYARSIZDIR (§2c) ve bu SUNUCUDA
 * uygulanir. Randevu'nun "kisi filtresi ISTEMCIDE" bilinen sinirina
 * DUSULMEDI: orada filtre uc listesini bir arayuz ihtiyaci yuzunden
 * genisletmek olurdu, burada filtre modulun BIRINCIL okuma yoludur (bir arsiv,
 * filtresiz kullanilamaz).
 */
export const listDocumentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    label: z.string().trim().min(1).max(MAX_LABEL_CHARS).optional(),
    contactId: z.uuid('contactId gecerli bir UUID olmali').optional(),
    projectId: z.uuid('projectId gecerli bir UUID olmali').optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateDocumentBody = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentBody = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
