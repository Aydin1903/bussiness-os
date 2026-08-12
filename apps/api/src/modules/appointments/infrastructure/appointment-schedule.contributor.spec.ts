import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type AppointmentRepository,
  type PeriodSummary,
  type UpcomingAppointment,
} from '../application/appointment.repository.port';
import { AppointmentScheduleContributor } from './appointment-schedule.contributor';

/**
 * `AppointmentScheduleContributor` (ADR-0035 §6.2).
 *
 * ⚠️ TESTLERIN AGIRLIK MERKEZI SKORDUR. Yapisal katkicinin iceriginin dogru
 * bicimlenmesi ikincildir; ASIL RISK duz sabit skora donmektir — o gun DORT
 * yapisal katkici sekiz yuvali havuzun tamamini kaplar ve BES anlamsal kaynagin
 * hicbiri giremez. Bu dosya o regresyonu kilitler.
 */

const NOW = new Date('2026-08-12T09:00:00.000Z');
const ALERT_RATE = 0.2;

const clock: Clock = { now: () => NOW };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function upcoming(count: number): UpcomingAppointment[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `018f3a2b-7c4d-7e1f-9c4d-${String(index).padStart(12, '0')}`,
    scheduledAt: new Date('2026-08-12T14:30:00.000Z'),
    durationMinutes: 30,
    crmContactId: null,
  }));
}

function build(overrides: { summary?: Partial<PeriodSummary>; upcomingCount?: number } = {}) {
  const summary: PeriodSummary = {
    total: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    ...overrides.summary,
  };

  const summarizePeriod = vi
    .fn<AppointmentRepository['summarizePeriod']>()
    .mockResolvedValue(summary);
  const findUpcoming = vi
    .fn<AppointmentRepository['findUpcoming']>()
    .mockResolvedValue(upcoming(overrides.upcomingCount ?? 0));

  const contributor = new AppointmentScheduleContributor(
    { summarizePeriod, findUpcoming } as unknown as AppointmentRepository,
    transactionManager,
    clock,
    ALERT_RATE,
  );

  return { contributor, summarizePeriod, findUpcoming };
}

/** Katkicinin dondurdugu ILK skor — tum fragment'lar ayni skoru tasir. */
async function scoreOf(contributor: AppointmentScheduleContributor): Promise<number | undefined> {
  const fragments = await contributor.contribute();
  return fragments[0]?.score;
}

/**
 * ⚠️ `contribute()` PARAMETRESIZ CAGRILIYOR — ve bu bir kolaylik degil, bir
 * IDDIA. Yapisal katki DETERMINISTIKTIR: soruya ve onun vektorune gore
 * DEGISMEZ. Metot port sozlesmesini karsilamak icin imzada `input` tasiyabilir
 * ama gercekte hicbirini okumaz; parametresiz cagirmak bunu KAYDEDIYOR.
 */

describe('AppointmentScheduleContributor — SKOR RISKE GORE (§6.2)', () => {
  it('⚠️ YUKSEK gelmedi orani -> 0.95 (gercek alarm)', async () => {
    // 20 sonuclanmis randevunun 6'sina gelinmemis = %30 > %20 esik.
    const { contributor } = build({
      summary: { total: 25, completed: 14, noShow: 6, cancelled: 5 },
    });

    expect(await scoreOf(contributor)).toBe(0.95);
  });

  it('⚠️ BUGUN/YARIN yaklasan randevu var -> 0.90 (dikkat)', async () => {
    const { contributor } = build({
      summary: { total: 10, completed: 10, noShow: 0, cancelled: 0 },
      upcomingCount: 2,
    });

    expect(await scoreOf(contributor)).toBe(0.9);
  });

  it('⚠️ SAGLIKLI -> 0.75 (anlatisala YENILIR)', async () => {
    const { contributor } = build({
      summary: { total: 10, completed: 10, noShow: 0, cancelled: 0 },
      upcomingCount: 0,
    });

    expect(await scoreOf(contributor)).toBe(0.75);
  });

  it('⚠️ ALARM, yaklasan randevudan ONCE gelir', async () => {
    // Dolu VE sorunlu bir takvimde alarm kazanir: "yarin uc randevun var"
    // bilgisi, "musterilerin ucte biri gelmiyor" uyarisindan daha az aciledir.
    const { contributor } = build({
      summary: { total: 25, completed: 14, noShow: 6, cancelled: 5 },
      upcomingCount: 3,
    });

    expect(await scoreOf(contributor)).toBe(0.95);
  });

  it('⚠️ TEK ORNEKTE ALARM VERMEZ — %100 gelmedi orani bir TESADUFTUR', async () => {
    // ⚠️ BU TESTIN ISI ISTATISTIKSEL BIR TUZAGI KAPATMAKTIR. Esik olmasaydi
    // yeni her tenant ILK gelmeyen musterisinde en yuksek skoru alir ve yapisal
    // satir anlatisal icerigi havuzdan iterdi.
    const { contributor } = build({
      summary: { total: 1, completed: 0, noShow: 1, cancelled: 0 },
    });

    expect(await scoreOf(contributor)).toBe(0.75);
  });

  it('IPTALLER "gelmedi" paydasina GIRMEZ', async () => {
    // ADR-0035 §2b: iptal bir HABERDIR, gelmemek bir KAYIPTIR. Iptaller
    // paydaya girseydi cok iptal eden bir tenant'in orani SESSIZCE seyrelirdi.
    //
    // 6 sonuclanmis (5 tamamlanan + 1 gelmeyen) = %16.7 < %20 -> alarm YOK.
    // Iptaller paydaya girseydi 1/26 = %3.8 olurdu; ikisi de alarm vermez ama
    // asil fark TERS ornekte gorunur (asagida).
    const { contributor } = build({
      summary: { total: 26, completed: 5, noShow: 1, cancelled: 20 },
    });

    expect(await scoreOf(contributor)).toBe(0.75);
  });

  it('COK IPTAL, YUKSEK gelmedi orani -> yine 0.95', async () => {
    // 10 sonuclanmis (5 + 5) = %50. Iptaller paydaya girseydi 5/55 = %9 olur ve
    // ALARM KACARDI — testin asil kanitladigi sey budur.
    const { contributor } = build({
      summary: { total: 55, completed: 5, noShow: 5, cancelled: 45 },
    });

    expect(await scoreOf(contributor)).toBe(0.95);
  });
});

describe('AppointmentScheduleContributor — icerik SABIT ve KUCUK', () => {
  it('BOS tenant HICBIR SEY gondermez', async () => {
    // "0 randevu" demek modele bilgi degil GURULTU tasir ve sekiz yuvadan
    // birini bosa harcardi.
    const { contributor } = build();

    await expect(contributor.contribute()).resolves.toEqual([]);
  });

  it('yaklasan randevu sayisi SINIRLIDIR', async () => {
    const { contributor, findUpcoming } = build({
      summary: { total: 5, completed: 5, noShow: 0, cancelled: 0 },
      upcomingCount: 3,
    });

    await contributor.contribute();

    // Katki HER SORUDA gonderilir; limit repository'ye ACIKCA gecilir.
    expect(findUpcoming).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });

  it('ozet satiri ORANI ACIKCA isaretler', async () => {
    const { contributor } = build({
      summary: { total: 25, completed: 14, noShow: 6, cancelled: 5 },
    });

    const [summary] = await contributor.contribute();

    // Modelin "6/20" ifadesinden kendi cikarim yapmasini beklemek guvenilmez.
    expect(summary?.content).toMatch(/gelmedi orani %30 — YUKSEK/);
  });

  it('yaklasan randevu SAATI tasir — takvim gunu DEGIL', async () => {
    // ADR-0035 §2c: bu modulun tasidigi bilgi tam olarak SAATTIR.
    const { contributor } = build({ upcomingCount: 1 });

    const fragments = await contributor.contribute();

    expect(fragments[0]?.content).toMatch(/2026-08-12T14:30:00.000Z/);
  });

  it('kaynak etiketi ANLAMSAL katkicidan AYRIDIR', async () => {
    const { contributor } = build({ upcomingCount: 1 });

    const fragments = await contributor.contribute();

    expect(fragments[0]?.source).toBe('appointment-schedule');
  });
});

describe('izin kapisi (ADR-0035 §6, §9)', () => {
  it('⚠️ katkici `appointment:read` DEKLARE eder — eleme PLATFORMUN isi', () => {
    // ============================================================================
    // ⚠️ BU IDDIA NEDEN BURADA, ENTEGRASYON TESTINDE DEGIL
    // ============================================================================
    // Kabul olcutu: "izni olmayan role icin katkici HIC CAGRILMAZ ve
    // `degradedSources`ta bile gorunmez". Bu davranis GERCEK BIR ROLLE
    // URETILEMEZ: `appointment:read` izni DORT ROLUN DORDUNDE DE var
    // (ADR-0035 §9 — bir randevu takvimi PAYLASILAN bir is gercegidir).
    //
    // Yani bu modul `POST /ask` izin filtresini TETIKLEMEZ; tetikci HALA
    // yalnizca Finans'tir (`cashflow:read` / `commentary:read` — `member`
    // tasimaz). Elemenin kendisi `context-contributors.integration.spec`te
    // Finans uzerinden ZATEN kanitli ve mekanizma PLATFORMUNDUR.
    //
    // Modulun sorumlulugu tek satirdir: DOGRU izni deklare etmek. Yanlis bir
    // izin yazilsaydi (ornegin `appointment:write`) hata SESSIZ olurdu —
    // okuma yapan bir kullanici kendi randevularini AI'a soramaz hale gelirdi
    // ve hicbir test kirmizi yanmazdi. Bu satir tam olarak onu kilitliyor.
    const { contributor } = build();

    expect(contributor.permission).toBe('appointment:read');
  });
});
