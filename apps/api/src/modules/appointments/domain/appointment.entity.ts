import {
  InvalidAppointmentDurationError,
  InvalidAppointmentStatusError,
  InvalidAppointmentsTimestampError,
  InvalidScheduledAtError,
} from './appointments.error';

/**
 * Randevu durumu (ADR-0035 §2a).
 *
 * ============================================================================
 * NEDEN KODDA ENUM, `finance.categories` GIBI TENANT TABLOSU DEGIL
 * ============================================================================
 * Finans kategorisi tenant tablosuna cikti cunku bir yazilim sirketinin
 * "Sunucu maliyeti" kalemiyle bir kafenin "Hammadde" kalemi ayni listede
 * yasayamaz. Randevu durumu OYLE DEGILDIR: bir randevu ya planlanmistir, ya
 * gerceklesmistir, ya iptal edilmistir, ya da KISI GELMEMISTIR. Bu dort hal her
 * sektorde AYNI seyi anlatir — `OpportunityStage` / `ProjectStatus` ile ayni
 * degerlendirme.
 *
 * Tenant tablosuna cikarmak Slice 4'un yapisal katkicisini de bozardi:
 * "gelmedi orani" ancak `no_show`un ANLAMI SABITSE hesaplanabilir.
 *
 * ============================================================================
 * ⚠️ `no_show` NEDEN `cancelled`DAN AYRI — bu modulun en degerli ayrimi
 * ============================================================================
 * Ikisi de "randevu gerceklesmedi" demektir ama ISLETME ICIN AYNI SEY DEGILDIR:
 * iptal bir HABERDIR (yer bosaldi, baskasina verilebilir), gelmemek bir
 * KAYIPTIR (ayrilan zaman bosa gitti). Tek degerde birlestirmek, Slice 4'un
 * alarm sinyalini TUMUYLE yok ederdi.
 *
 * ⚠️ Sozluk BURADA ve migration `0026`'nin `appointments_status_valid`
 * CHECK'inde IKI KEZ yazilir; ikisi senkron kalmak zorundadir. Ayrim bilincli:
 * CHECK, uygulamayi ATLAYAN yollari da baglar.
 */
export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return APPOINTMENT_STATUSES.some((status) => status === value);
}

/**
 * KAPANMIS randevu durumlari — Slice 4'un yapisal katkicisi "yaklasan" sayarken
 * bunlari DISLAR.
 *
 * `CLOSED_PROJECT_STATUSES` / `CLOSED_TASK_STATUSES` ile ayni is: yuklem iki
 * yerde ayri yazilsaydi biri degistiginde digeri SESSIZCE ayrisirdi.
 *
 * ⚠️ Bugun HIC KULLANILMIYOR ve bu bilincli: sozluk burada, tuketicisi Slice
 * 4'te. Alternatifi o gun hatirlamaya guvenmekti ve `no_show`un "kapanmis" mi
 * "yaklasan" mi sayilacagi tam olarak unutulacak turden bir ayrimdir.
 */
export const CLOSED_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'completed',
  'cancelled',
  'no_show',
];

/**
 * Randevu (ADR-0035 §2).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez — `Project`, `Category` ve `Note` ile ayni disiplin.
 *
 * ============================================================================
 * DURUM GECISLERI SERBEST — kisitlayici bir durum makinesi YOK
 * ============================================================================
 * `Tenant`, `Membership` ve `User` durum makineleri var; randevu durumu
 * onlardan FARKLIDIR ve `ProjectStatus` ile ayni sinifa girer.
 * `no_show` -> `completed` (kisi bir saat gec geldi) ya da `cancelled` ->
 * `scheduled` (iptal geri alindi) gercek isde OLAGANDIR.
 *
 * Engellemek kullaniciyi yazilima YALAN SOYLEMEYE iter: durumu hic guncellemez,
 * veri bayatlar ve Slice 4'te AI bayat veriyle "gelmedi orani yuksek" der.
 *
 * ============================================================================
 * ⚠️ GUNCELLENEBILIR VE SILINEBILIR — VE BUNUN BEDELI YAZILI
 * ============================================================================
 * Randevu ertelenir, suresi degisir, saati kayar; bu modulun NORMAL
 * kullanimidir (`FinanceTransaction` ile ayni karar). Bedeli acikca:
 * DEGISIKLIK DENETIM IZI YOKTUR. `createdByUserId` yalnizca OLUSTURANI tutar;
 * bir randevunun saatini kimin degistirdigi SORULAMAZ (ADR-0035 §5).
 *
 * ============================================================================
 * ⚠️ CAKISMA KONTROLU YOK — VE BU BILINCLI
 * ============================================================================
 * Iki randevu ayni saate yazilabilir. Engellemek COKLU PERSONEL TAKVIMI
 * demektir (ADR-0035 §10 — kapsam disi): tek takvimde cakisma bir hatadir, iki
 * personelli bir isletmede NORMALDIR. Yanlis tarafa karar vermek yerine v1
 * KAYIT TUTAR, KURAL KOYMAZ; haftalik grid cakisan bloklari yan yana cizerek
 * durumu GORUNUR kilar (Slice 5).
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * `Project` / `Category` / `FinanceTransaction` ile ayni bilinen sinir.
 * ============================================================================
 */
export interface AppointmentFields {
  /**
   * Randevunun BASLADIGI an.
   *
   * ⚠️ `Date`, `string` DEGIL — ve onceki uc modulun `YYYY-MM-DD` dizesinden
   * bilincli sapma. Orada tip `date`ti ve dize karsilastirmasi takvim
   * sirasiyla ayniydi; burada tip `timestamptz` ve saat bilgisi ANLAMLIDIR.
   */
  readonly scheduledAt: Date;

  /** Bitis TURETILIR; `endsAt` diye bir alan YOKTUR (ADR-0035 §2d). */
  readonly durationMinutes: number;

  readonly status: AppointmentStatus;

  /**
   * Cross-modul YUMUSAK referans: `crm.contacts.id` — ama FK DEGIL
   * (ADR-0035 §4).
   *
   * ⚠️ SLICE 2'DE `AppointmentFields`E GIRDI. Slice 1'de bilerek disaridaydi:
   * dogrulamasi ve adin cozulmesi icin gereken `ContactDirectory` o gun YOKTU
   * (`crm.public.ts` yalnizca `CompanyDirectory` tasiyordu) ve dogrulanamayan
   * bir isaretciyi kabul etmek ILK GUNDEN sarkan satir uretmek olurdu —
   * ADR-0033 Slice 1'in ogrettigi ders, ikinci kez uygulandi.
   *
   * ⚠️ VARLIK KONTROLU BURADA DEGIL: bir veritabani sorgusu gerektirir ve
   * `domain` katmani framework'suzdur. Kontrol use case'tedir
   * (`#assertContactVisible`).
   *
   * `null` MESRUDUR ve yaygindir: bir randevu bir CRM kisisine bagli olmak
   * ZORUNDA degildir (ic toplanti, ilk kez gelen bir musteri, telefonla
   * alinmis bir kayit).
   */
  readonly crmContactId: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<AppointmentFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o
 * tip "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()`
 * ciktisi ikincisidir.
 *
 * ⚠️ SLICE 2'DE BU AYRIM DOGDU. Slice 1'de uc alanin ucu de zorunluydu ve
 * "`null` = temizle" diye bir sey YOKTU (bir randevunun saatsiz ya da suresiz
 * olmasi diye bir sey yoktur). `crmContactId` ILK nullable alandir:
 * `undefined` = DOKUNMA, `null` = BAGLANTIYI KALDIR. Ikincisi mesrudur —
 * yanlis kisiye baglanmis bir randevuyu ic randevuya cevirmek
 * (`TransactionPatch`in `companyId`si icin verilmis ayni karar).
 */
export type AppointmentPatch = {
  readonly [K in keyof AppointmentFields]?: AppointmentFields[K] | undefined;
};

export interface AppointmentState extends AppointmentFields {
  readonly id: string;
  readonly tenantId: string;
  /** ⚠️ Yalnizca OLUSTURANI tutar; denetim izi DEGILDIR (ADR-0035 §5). */
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * ⚠️ `serviceNote` ve `embedding` BU TIPTE HALA YOK — yazma yollari Slice 3.
 *
 * Kolonlari migration `0026`'da acik durur. `crmContactId` SLICE 2'DE GIRDI:
 * `crm.public.ts`e `ContactDirectory` yazildi, yani bir kisi isaretcisi artik
 * GORUNURLUK acisindan dogrulanabiliyor. ADR-0033 Slice 1'in dersi tam olarak
 * buydu — isaretci, onu dogrulayacak yuzey var olduktan SONRA kabul edilir.
 */
export class Appointment {
  private constructor(private readonly state: AppointmentState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: AppointmentFields;
    now: Date;
  }): Appointment {
    return new Appointment({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: AppointmentState): Appointment {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidAppointmentsTimestampError();
    }
    return new Appointment(state);
  }

  /**
   * KISMI guncelleme.
   *
   * `undefined` = "dokunma". `PUT` secilseydi unutulan her alan sessizce
   * varsayilanina duserdi — bir randevuda bu, saatin kaymasi demekti.
   *
   * ⚠️ Durum gecisi de BURADAN gecer ve kisitlanmaz (gerekce sinif yorumunda).
   */
  update(changes: AppointmentPatch, now: Date): Appointment {
    const current = this.state;

    const merged: AppointmentFields = {
      scheduledAt: changes.scheduledAt ?? current.scheduledAt,
      durationMinutes: changes.durationMinutes ?? current.durationMinutes,
      status: changes.status ?? current.status,
      // ⚠️ `??` DEGIL: `null` = BAGLANTIYI KALDIR ve mesrudur.
      // `changes.crmContactId ?? current.crmContactId` yazilsaydi `null`
      // gonderen bir istek SESSIZCE yok sayilirdi — kullanici baglantiyi
      // kaldirdigini sanip kaldirmamis olurdu.
      crmContactId:
        changes.crmContactId === undefined ? current.crmContactId : changes.crmContactId,
    };

    return new Appointment({ ...current, ...normalize(merged), updatedAt: now });
  }

  /**
   * Randevunun BITIS ani — TURETILIR, saklanmaz (ADR-0035 §2d).
   *
   * ⚠️ Tek tanim: haftalik grid, cakisma gosterimi ve Slice 4'un "yaklasan
   * randevu" sorgusu ayni cevabi vermek zorunda. Iki yerde hesaplansaydi biri
   * degistiginde digeri SESSIZCE ayrisirdi.
   */
  endsAt(): Date {
    return new Date(this.state.scheduledAt.getTime() + this.state.durationMinutes * 60_000);
  }

  toState(): AppointmentState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: AppointmentFields): AppointmentFields {
  if (!isAppointmentStatus(fields.status)) {
    throw new InvalidAppointmentStatusError(fields.status);
  }

  // ⚠️ `Number.isInteger` TEK BASINA YETMEZ ve `> 0` da tek basina yetmez:
  // `1.5` pozitiftir ama dakika degildir, ve `Infinity` her iki kontrolu de
  // gecmez ama `NaN` yalnizca birincisini gecmez. Ucu birden burada kapali.
  if (!Number.isInteger(fields.durationMinutes) || fields.durationMinutes <= 0) {
    throw new InvalidAppointmentDurationError(fields.durationMinutes);
  }

  // ⚠️ `Invalid Date` TIP OLARAK `Date`TIR ve sessizce veritabanina kadar
  // giderdi; PostgreSQL onu reddeder ve kullanici 422 yerine 500 alirdi.
  if (Number.isNaN(fields.scheduledAt.getTime())) {
    throw new InvalidScheduledAtError(String(fields.scheduledAt));
  }

  return {
    scheduledAt: fields.scheduledAt,
    durationMinutes: fields.durationMinutes,
    status: fields.status,
    // ⚠️ BURADA DOGRULANMAZ: gorunurluk kontrolu bir veritabani sorgusu
    // gerektirir ve `domain` katmani framework'suzdur. Kontrol use case'tedir
    // (`#assertContactVisible`) — `TransactionFields`in cross-modul
    // isaretcileri icin verilmis ayni karar.
    crmContactId: fields.crmContactId,
  };
}
