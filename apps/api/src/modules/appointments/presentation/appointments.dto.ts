import { z } from 'zod';

import { APPOINTMENT_STATUSES } from '../domain/appointment.entity';

/**
 * Randevu istek govdeleri (DEVELOPMENT_RULES 2.3: her dis veri Zod ile
 * dogrulanir).
 *
 * `tenantId` HICBIR govdede YOKTUR: dogrulanmis token'dan gelir
 * (DEVELOPMENT_RULES 4.5).
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * ⚠️ VARSAYILAN 50, ONCEKI UC MODULDEKI 20 DEGIL.
 *
 * Onlarin birincil tuketicisi bir LISTE ekraniydi ve 20 satir bir sayfayi
 * doldurur. Buradaki birincil tuketici HAFTALIK TAKVIM GRIDIDIR (Slice 5): dolu
 * bir haftada 20 randevu kolayca asilir ve grid, sayfanin GERI KALANINI
 * SESSIZCE BOS gosterirdi — ekran calisir, hicbir hata dusmez, sadece persembe
 * ve cuma bos gorunur.
 *
 * ⚠️ `MAX_LIMIT` 100 kaldi: bir hafta 100 randevuyu asiyorsa dogru cevap
 * limiti buyutmek degil, gorunumu daraltmaktir (gunluk gorunum — v2).
 */

/**
 * ISO 8601 AN — takvim gunu DEGIL (ADR-0035 §2c).
 *
 * ⚠️ Zod yalnizca ISO KALIBINI dogrular. `2026-02-31T10:00:00Z` bu kalibi
 * GECEBILIR ve gercek bir an olup olmadigi domain'de (`appointment.entity.ts`)
 * kontrol edilir — kontrol edilmeseydi `Invalid Date` sessizce veritabanina
 * kadar gider ve kullanici 422 yerine 500 alirdi. `finance.dto.ts`'in
 * `calendarDay` yorumundaki ayrimin birebir aynisi.
 *
 * ⚠️ `z.iso.datetime()` OFFSET ISTER (`Z` ya da `+03:00`); ofsetsiz bir dize
 * REDDEDILIR ve bu KASITLIDIR. Ofsetsiz `2026-08-20T14:30` sunucunun yerel
 * saatine gore yorumlanirdi — yani ayni istek iki farkli sunucuda IKI FARKLI
 * ANI kaydederdi ve fark SESSIZ olurdu.
 */
const instant = z.iso.datetime({ offset: true, message: 'Zaman ISO 8601 (ofsetli) olmali' });

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

/**
 * ⚠️ SURE UST SINIRI BURADA, VERITABANINDA DEGIL.
 *
 * Migration `0026` yalnizca `> 0` zorlar (ADR-0035'in yazdigi kisit). Ust sinir
 * bir GIRDI kuralidir, bir veri butunlugu kurali degil: bir gunu asan "randevu"
 * diye bir sey yoktur ve boyle bir kayit haftalik gridde ekrani BASTAN SONA
 * kaplardi.
 *
 * 1440 = 24 saat. Gun tasan bir bulusma (konferans, kamp) bu modulun konusu
 * degildir; `MAX_NAME` / `MAX_DESCRIPTION` sinirlarinin veritabaninda
 * karsiliginin olmamasiyla ayni desen.
 */
const MAX_DURATION_MINUTES = 1440;

const durationSchema = z
  .number()
  .int('Sure tam sayi olmali')
  .min(1, 'Sure sifirdan buyuk olmali')
  .max(MAX_DURATION_MINUTES, 'Sure 24 saati asamaz');

/**
 * ⚠️ `crmContactId` ve `serviceNote` BU SEMADA YOK — ve `.strict()` sayesinde
 * gonderilirlerse 422 ile REDDEDILIRLER, SESSIZCE YOK SAYILMAZLAR.
 *
 * Ayrim onemlidir: sessizce yok saymak, istemcinin kisi bagladigini SANMASINA
 * ve baglanti kurulmadigini HIC OGRENMEMESINE yol acardi. Yazma yollari Slice 2
 * (`crmContactId`) ve Slice 3 (`serviceNote`) ile acilir.
 */
export const createAppointmentSchema = z
  .object({
    scheduledAt: instant,
    durationMinutes: durationSchema,
    /**
     * Varsayilani `scheduled` — ve bu varsayilan MESRUDUR.
     *
     * `createCategorySchema`'nin `direction`i bilerek varsayilansizdi ("hangi
     * yonun dogal baslangic oldugu diye bir sey yoktur"). Burada tersi dogru:
     * bir randevu tanimi geregi PLANLANARAK dogar. Gecmise donuk bir kayit
     * girmek isteyen `completed` gonderir.
     */
    status: appointmentStatusSchema.default('scheduled'),
  })
  .strict();

/**
 * KISMI guncelleme.
 *
 * ⚠️ `status` BURADA VAR ve ADR-0035 §9'un "durum gecisi burada" satirinin
 * karsiligidir. `updateCategorySchema`'dan farki bilinclidir: kategorinin yonu
 * kalici bir SINIFLANDIRMADIR ve gecmis kayitlarin anlamini degistirir; randevu
 * durumu ise kaydin YASAM DONGUSUDUR ve degismek icin vardir.
 *
 * ⚠️ Gecisler KISITLANMAZ (`no_show` -> `completed` mesrudur: kisi bir saat gec
 * geldi). Gerekce `Appointment` sinif yorumunda.
 *
 * En az bir alan zorunlu: bos bir `PATCH` govdesi anlamsizdir ve bir istemci
 * hatasini sessizce 200'e cevirirdi.
 */
export const updateAppointmentSchema = z
  .object({
    scheduledAt: instant,
    durationMinutes: durationSchema,
    status: appointmentStatusSchema,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

/**
 * Takvim penceresi sorgusu.
 *
 * ⚠️ `from` DAHIL, `to` HARIC (`>= from` ve `< to`) — onceki uc modulun
 * "ikisi de dahil" kuralindan BILINCLI SAPMA. Orada sinirlar takvim GUNUYDU;
 * burada bir ANDIR ve haftalik grid "pazartesi 00:00'dan gelecek pazartesi
 * 00:00'a" diye sorar. `<=` olsaydi sinirdaki bir randevu IKI HAFTADA DA
 * gorunurdu.
 *
 * ⚠️ Karsilastirma `Date` uzerinde yapilir, DIZE uzerinde DEGIL. Onceki uc
 * modulde `YYYY-MM-DD` sozluk sirasi takvim sirasiyla ayniydi ve dize
 * karsilastirmasi dogruydu; ISO an dizelerinde OFSET farki bunu bozar
 * (`2026-08-20T00:00:00Z` ile `2026-08-20T03:00:00+03:00` AYNI andir ama farkli
 * dizelerdir).
 */
export const listAppointmentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    from: instant.optional(),
    to: instant.optional(),
    status: appointmentStatusSchema.optional(),
  })
  .strict()
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      new Date(query.from) < new Date(query.to),
    { message: 'from, to dan once olmali' },
  );

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentBody = z.infer<typeof updateAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
