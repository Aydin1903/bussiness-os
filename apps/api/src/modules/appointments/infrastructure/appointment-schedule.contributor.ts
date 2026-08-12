import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type AppointmentRepository,
  type PeriodSummary,
  type UpcomingAppointment,
} from '../application/appointment.repository.port';
import { APPOINTMENT_READ } from '../appointments.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const APPOINTMENT_SCHEDULE_SOURCE = 'appointment-schedule';

/** Gecmis pencere (gun): "gelmedi orani" bu araliktan hesaplanir. */
const WINDOW_DAYS = 30;

/** "Yaklasan" penceresi: BUGUN + YARIN (§6.2). */
const UPCOMING_DAYS = 2;

/** Katkida gosterilecek EN FAZLA yaklasan randevu — icerik SABIT ve KUCUK. */
const UPCOMING_LIMIT = 3;

/**
 * ⚠️ ORAN HESAPLANMADAN ONCE GEREKEN EN AZ ORNEK SAYISI.
 *
 * Tek randevusu olan ve o randevuya gelinmemis bir tenant'ta oran %100'dur —
 * ve bu bir ALARM DEGILDIR, bir tesadufttur. Esik olmadan yeni her tenant ilk
 * gelmeyen musterisinde en yuksek skoru alir ve yapisal satir, anlatisal
 * icerigi sekiz yuvali havuzdan iter.
 *
 * ⚠️ Config'e ACILMADI (oran acildi ama bu acilmadi): bu bir IS TERCIHI degil,
 * istatistiksel bir ALT SINIRDIR. Ayarlanabilir olsaydi 1'e cekilebilir ve
 * yukaridaki tuzak geri gelirdi.
 */
const MIN_SAMPLE = 5;

/**
 * ============================================================================
 * SKOR RISKE GORE — DUZ SABIT SKOR YASAK (ADR-0035 §6.2)
 * ============================================================================
 * Slice 6'da CRM ve Projeler icin HIZALANAN, Finans'ta ILK GUNDEN uygulanan
 * politika burada da ilk gunden uygulaniyor. Aritmetik bunu zorunlu kiliyor:
 *
 *   global top-K = 8
 *   CRM 3 + Projeler 5 + Finans 3 + Randevu 3  =  14 > 8
 *
 * DORT yapisal katkici ayni havuzu paylasiyor. Dordu de sabit yuksek skor
 * verseydi yapisal satirlar sekiz yuvanin TAMAMINI kaplar ve BES anlamsal
 * kaynagin hicbiri giremezdi.
 *
 * Cozum modul basina KOTA DEGIL (ADR-0031 §5.1 onu acikca reddetti): skoru
 * ANLAMLI kilmak. Port zaten "0..1, yuksek = daha alakali" diyor.
 *
 *   son 30 gunde GELMEDI ORANI esigi asti  -> 0.95  (gercek alarm)
 *   BUGUN/YARIN yaklasan randevu var        -> 0.90  (dikkat)
 *   saglikli                                 -> 0.75  (bilgi; anlatisala yenilir)
 *
 * Sonuc kendi kendini duzenler: SAKIN bir takvimde randevu satirlari yuvalari
 * anlatisal icerige birakir, DOLU ya da SORUNLU bir takvimde one cikar.
 * ============================================================================
 */
const SCORE_HIGH_NO_SHOW = 0.95;
const SCORE_UPCOMING = 0.9;
const SCORE_HEALTHY = 0.75;

/**
 * Randevu'nun YAPISAL katkisi (ADR-0035 §6.2).
 *
 * ============================================================================
 * NEDEN YAPISAL KATKICI GEREKLI
 * ============================================================================
 * _"Yarin kim geliyor?"_ ve _"Musteriler randevuya geliyor mu?"_ sorularinin
 * cevabi bir servis notunda YAZMAZ; `scheduled_at` ve `status` kolonlarinda
 * yazar. Yalnizca anlatisal veriyi gomseydik model bu sorulari bayat notlardan
 * TAHMIN EDEREK cevaplardi ve kendinden emin sekilde yanilirdi. Bu, dort
 * modulde verilmis ayni kararin dorduncusudur.
 *
 * ⚠️ BU KATKICI ZAMANI GELECEGE DOGRU OKUYAN ILK KATKICIDIR. Onceki dordu
 * GECMISE bakiyordu (olan gorusme, yazilan not, gerceklesen odeme, kapanan
 * firsat). "Yarin kim geliyor" sorusunun cevabi bugune kadar HICBIR modulde
 * yoktu.
 *
 * ============================================================================
 * ⚠️ ICERIK SABIT VE KUCUK — anlatisal detay YOK
 * ============================================================================
 * En fazla `UPCOMING_LIMIT` yaklasan randevu + tek satirlik donem ozeti.
 * `service_note` BURAYA GIRMEZ: o ANLAMSAL katkicinin isidir
 * (`appointment-notes`). Ikisi ayni tabloyu okur ama FARKLI SORULARA cevap
 * verir — ve yapisal katkiya not eklemek, her soruda tum notlari tasimak
 * demekti.
 *
 * Bedeli acikca: bu katki HER SORUDA gonderilir, yani soru randevuyla ilgisiz
 * olsa bile birkac yuz token maliyeti vardir — ve bu maliyet artik DORDUNCU kez
 * ekleniyor (ADR-0035 § Sonuclari).
 */
@Injectable()
export class AppointmentScheduleContributor implements RetrievalContributor {
  readonly source = APPOINTMENT_SCHEDULE_SOURCE;
  readonly permission = APPOINTMENT_READ;

  constructor(
    private readonly repository: AppointmentRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    /** Alarm esigi (0..1). Config'ten gelir; gerekce `env.schema.ts`te. */
    private readonly noShowAlertRate: number,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki deterministiktir; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const now = this.clock.now();
    const windowStart = shiftDays(now, -WINDOW_DAYS);
    const upcomingEnd = shiftDays(now, UPCOMING_DAYS);

    const { summary, upcoming } = await this.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const period = await this.repository.summarizePeriod({ from: windowStart, to: now });

        // ⚠️ AYRI SORGU: biri GECMISI toplar, digeri GELECEGI listeler. Tek
        // sorguda birlestirmek, toplamlari satir sayisi kadar TEKRARLARDI
        // (`summarizeByCurrency` / `summarizeByCategory` ayriminin ayni
        // gerekcesi).
        const next = await this.repository.findUpcoming({
          from: now,
          to: upcomingEnd,
          limit: UPCOMING_LIMIT,
        });

        return { summary: period, upcoming: next };
      },
    );

    const score = classify(summary, upcoming.length, this.noShowAlertRate);

    // ⚠️ HICBIR SEY YOKSA HICBIR SEY GONDERILMEZ. Bos bir tenant'ta "0 randevu"
    // demek, modele bilgi degil GURULTU tasir ve sekiz yuvadan birini bosa
    // harcardi.
    if (summary.total === 0 && upcoming.length === 0) {
      return [];
    }

    return [
      ...(summary.total === 0 ? [] : [summaryFragment(summary, score, this.noShowAlertRate)]),
      ...upcoming.map((row) => upcomingFragment(row, score)),
    ];
  }
}

/**
 * Skoru belirleyen SINIFLANDIRMA (§6.2).
 *
 * ⚠️ SIRA ONEMLIDIR: gelmedi orani, yaklasan randevudan ONCE bakilir. Dolu ve
 * ayni zamanda sorunlu bir takvimde alarm SINYALI kazanir — "yarin uc randevun
 * var" bilgisi, "musterilerin ucte biri gelmiyor" uyarisindan daha az aciledir.
 */
function classify(summary: PeriodSummary, upcomingCount: number, alertRate: number): number {
  // ⚠️ PAYDA `completed + noShow` — `total` DEGIL. Iptal edilmis bir randevu
  // "gelmedi" sayilmaz (ADR-0035 §2b: iptal bir HABERDIR, gelmemek bir
  // KAYIPTIR) ve hala `scheduled` olan gelecek randevular da paydaya girmemeli;
  // aksi halde yogun bir takvim orani SESSIZCE seyreltirdi.
  const resolved = summary.completed + summary.noShow;

  if (resolved >= MIN_SAMPLE && summary.noShow / resolved >= alertRate) {
    return SCORE_HIGH_NO_SHOW;
  }

  return upcomingCount > 0 ? SCORE_UPCOMING : SCORE_HEALTHY;
}

/** Donem ozeti — TEK SATIRLIK dogal dil, JSON ya da tablo DEGIL. */
function summaryFragment(
  summary: PeriodSummary,
  score: number,
  alertRate: number,
): ContextFragment {
  const resolved = summary.completed + summary.noShow;
  const parts = [
    `Randevu ozeti (son ${String(WINDOW_DAYS)} gun)`,
    `toplam ${String(summary.total)}`,
    `tamamlanan ${String(summary.completed)}`,
    `gelmeyen ${String(summary.noShow)}`,
    `iptal ${String(summary.cancelled)}`,
  ];

  if (resolved >= MIN_SAMPLE) {
    const rate = Math.round((summary.noShow / resolved) * 100);
    // Esigi asan orani ACIKCA isaretle: modelin "8/20" ifadesinden kendi
    // cikarim yapmasini beklemek guvenilmez.
    parts.push(
      summary.noShow / resolved >= alertRate
        ? `gelmedi orani %${String(rate)} — YUKSEK`
        : `gelmedi orani %${String(rate)}`,
    );
  }

  return {
    content: parts.join(' · '),
    score,
    source: APPOINTMENT_SCHEDULE_SOURCE,
    // ⚠️ `id` bir SATIR id'si DEGIL, pencerenin adidir — bu katkinin isaret
    // ettigi sey bir kayit degil bir DONEMDIR. Uydurulmus bir UUID dondurmek,
    // arayuzun acamayacagi bir baglanti vaat ederdi (`cashflow` ile ayni karar).
    reference: { kind: 'appointment-summary', id: `last-${String(WINDOW_DAYS)}-days` },
  };
}

/** Yaklasan tek randevu. */
function upcomingFragment(row: UpcomingAppointment, score: number): ContextFragment {
  // ⚠️ AN olarak yazilir (`toISOString`), takvim gunu olarak DEGIL: bu modulun
  // tasidigi bilgi tam olarak SAATTIR (ADR-0035 §2c). "20 Agustos'ta randevu
  // var" cumlesi, "14:30'da randevu var" bilgisini kaybederdi.
  //
  // ⚠️ KISI ADI YOK — yalnizca bagli olup olmadigi. Ad `crm.contacts`tadir ve
  // okumak izin kapili bir dizin cagrisi (dolayisiyla cagiranin ROLU) ister;
  // `ContributeInput` rol TASIMAZ. Gerekce `appointment-notes.contributor.ts`te.
  const parts = [
    `Yaklasan randevu ${row.scheduledAt.toISOString()}`,
    `${String(row.durationMinutes)} dk`,
    row.crmContactId === null ? 'kisiye bagli degil' : 'bir musteriye bagli',
  ];

  return {
    content: parts.join(' · '),
    score,
    source: APPOINTMENT_SCHEDULE_SOURCE,
    reference: { kind: 'appointment', id: row.id },
  };
}

/** Gun kaydirma — `Date` aritmetigi TEK yerde. */
function shiftDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
