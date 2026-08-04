import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import {
  type GenerateDailyReportsResult,
  type GenerateDailyReportsUseCase,
} from '../application/generate-daily-reports.use-case';

export interface DailyReportWorkerOptions {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

/**
 * Gunluk rapor uretimini belirli araliklarla calistiran arka plan sureci
 * (ADR-0030 §2.1).
 *
 * ============================================================================
 * `TenantOutboxRelay` ILE BIREBIR AYNI DESEN — ve ayni gerekce
 * ============================================================================
 * Ciplak `setInterval`; zamanlama kutuphanesi YOK. ADR-0030 §2.1 ayri bir mesaj
 * kuyrugu teknolojisinin (BullMQ/Redis) KURULMAYACAGINI karara bagladi: bu is
 * icin PostgreSQL tabanli zamanlanmis gorev secildi. Bir zamanlama
 * kutuphanesi eklemek, bu kararin cozdugu problemi geri getirmek olurdu.
 *
 * ⚠️ Aralik, raporun URETILME SAATI DEGILDIR. Worker sik sik uyanir (orn. her
 * 5 dakika) ve "vadesi gelen var mi" diye sorar; vade karari
 * `DAILY_REPORT_HOUR_UTC` ile use case'te verilir (`dueDate`). Aralik yalnizca
 * "ne siklikta bakilacagi"dir — saati aralikla kodlamak, worker'in yeniden
 * baslatildigi gun raporu kacirmasi demekti.
 *
 * Bedeli durustce: cok-instance'li kurulumda her instance kendi turunu
 * calistirir. GUVENLIDIR (`SKIP LOCKED` + idempotent `mark`), ama bos turlar
 * tekrarlanir.
 * ============================================================================
 *
 * Zamanlayici SORUMLULUGU YALNIZCA ZAMANLAMADIR: ne kilit, ne LLM, ne SQL
 * bilir. Ne yapilacagi use case'te, ne zaman yapilacagi burada durur.
 */
@Injectable()
export class DailyReportWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(DailyReportWorker.name);

  #timer: NodeJS.Timeout | null = null;
  /** Onceki tur bitmediyse yenisi baslamaz — turlar birbirinin ustune binmez. */
  #running = false;

  constructor(
    private readonly generateReports: GenerateDailyReportsUseCase,
    private readonly options: DailyReportWorkerOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      // Sessiz kalmaz: uretimin KAPALI oldugu, arayan birinin gorebilecegi tek
      // yer burasidir. Kullanici "raporum neden gelmedi" dediginde ilk bakilacak
      // sey bu satirdir.
      this.#logger.warn('Gunluk rapor worker KAPALI — rapor uretilmeyecek, kuyruk birikecek.');
      return;
    }

    this.#timer = setInterval(() => {
      void this.runOnce();
    }, this.options.intervalMs);

    // `unref`: bekleyen bir zamanlayici surecin kapanmasini ENGELLEMEZ. Aksi
    // halde graceful shutdown bir tur suresi boyunca asilir.
    this.#timer.unref();

    this.#logger.log(`Gunluk rapor worker calisiyor (${String(this.options.intervalMs)} ms).`);
  }

  onApplicationShutdown(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Tek tur calistirir. `public` olmasi bilincli: testler zamanlayiciyi
   * beklemeden turu tetikleyebilmelidir.
   */
  async runOnce(): Promise<GenerateDailyReportsResult | null> {
    if (this.#running) {
      return null;
    }

    this.#running = true;
    try {
      const result = await this.generateReports.execute();
      this.#report(result);
      return result;
    } catch (error) {
      // Tur cokerse SUREC olmez: bir sonraki tur yeniden dener. Hata yutulmaz,
      // loglanir — sessiz bir zamanlayici, hic calismayan bir zamanlayicidir.
      this.#logger.error(`Gunluk rapor turu basarisiz: ${describe(error)}`);
      return null;
    } finally {
      this.#running = false;
    }
  }

  /** Bos turlar SESSIZDIR: her 5 dakikada bir "0 rapor" logu gurultudur. */
  #report(result: GenerateDailyReportsResult): void {
    if (result.claimed === 0) {
      return;
    }

    this.#logger.log(
      `Gunluk rapor turu: ${String(result.claimed)} claim, ` +
        `${String(result.generated)} uretildi (${String(result.empty)} bos gun).`,
    );

    for (const failure of result.failures) {
      const message =
        `Rapor uretilemedi (tenant ${failure.tenantId}, deneme ` +
        `${String(failure.attemptCount)}): ${failure.reason}`;

      // Olu mektup ALARM konusudur: bir sirket o gunun raporunu ARTIK
      // ALMAYACAK ve bunu kimse istemeden fark etmeyecek.
      if (failure.deadLettered) {
        this.#logger.error(`${message} — OLU MEKTUP, elle mudahale gerekir.`);
      } else {
        this.#logger.warn(message);
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
