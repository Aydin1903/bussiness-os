import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import {
  type PublishTenantEventsResult,
  type PublishTenantEventsUseCase,
} from '../application/publish-tenant-events.use-case';

export interface TenantOutboxRelayOptions {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

/**
 * Tenant outbox tuketicisini belirli araliklarla calistiran arka plan sureci
 * (ADR-0006).
 *
 * ============================================================================
 * NEDEN CIPLAK `setInterval`, NEDEN ZAMANLAMA KUTUPHANESI DEGIL
 * ============================================================================
 * Kuyruk/mesaj broker karari HENUZ VERILMEDI (ROADMAP Faz 4). Bu relay, o karar
 * gelene kadarki KOPRUDUR ve gercek kuyruk geldiginde sokulecektir. Simdiden
 * bir zamanlama kutuphanesi eklemek, gecici bir cozum icin kalici bir bagimlilik
 * secmek olurdu.
 *
 * Bedeli durustce: cok-instance'li kurulumda her instance kendi turunu calistirir.
 * Bu GUVENLIDIR — `SKIP LOCKED` ayni satirin iki kez alinmasini engeller — ama
 * bos turlar tekrarlanir. Gercek kuyruk bu israfi da ortadan kaldiracak.
 * ============================================================================
 *
 * Zamanlayici SORUMLULUGU YALNIZCA ZAMANLAMADIR: ne kilit, ne teslimat, ne SQL
 * bilir. Ne yapilacagi use case'te, ne zaman yapilacagi burada durur.
 * `IdentityOutboxRelay` ile birebir ayni desen.
 */
@Injectable()
export class TenantOutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly #logger = new Logger(TenantOutboxRelay.name);

  #timer: NodeJS.Timeout | null = null;
  /** Onceki tur bitmediyse yenisi baslamaz — turlar birbirinin ustune binmez. */
  #running = false;

  constructor(
    private readonly publishEvents: PublishTenantEventsUseCase,
    private readonly options: TenantOutboxRelayOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      // Sessiz kalmaz: tuketimin KAPALI oldugu, arayan birinin gorebilecegi
      // tek yer burasidir.
      this.#logger.warn('Tenant outbox relay KAPALI — event ler islenmeyecek, kuyruk birikecek.');
      return;
    }

    this.#timer = setInterval(() => {
      void this.runOnce();
    }, this.options.intervalMs);

    // `unref`: bekleyen bir zamanlayici surecin kapanmasini ENGELLEMEZ. Aksi
    // halde graceful shutdown bir tur suresi boyunca asilir.
    this.#timer.unref();

    this.#logger.log(`Tenant outbox relay calisiyor (${String(this.options.intervalMs)} ms).`);
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
  async runOnce(): Promise<void> {
    if (this.#running) {
      // Yavas bir tur (buyuk batch) bir sonrakini tetiklemez.
      return;
    }
    this.#running = true;

    try {
      this.#report(await this.publishEvents.execute());
    } catch (error) {
      // Arka plan surecinde YAKALANMAYAN hata sureci dusurebilir; tur atlanir,
      // kayitlar islenmemis kalir ve sonraki turda yeniden denenir.
      this.#logger.error(`Tenant outbox turu basarisiz: ${describe(error)}`);
    } finally {
      this.#running = false;
    }
  }

  /** Sessiz turlar log uretmez: 5 saniyede bir "0 kayit" gurultudur. */
  #report(result: PublishTenantEventsResult): void {
    if (result.delivered > 0) {
      this.#logger.log(`Tenant outbox: ${String(result.delivered)} event islendi.`);
    }

    for (const failure of result.failures) {
      if (failure.deadLettered) {
        // ⚠️ ALARM: kayit kuyruktan CIKARILDI ve bir daha denenmeyecek. Bu,
        // sessizce kaybolan bir domain event'idir; gorunmesi zorunludur.
        this.#logger.error(
          `⚠️ Tenant outbox OLU MEKTUP (${failure.eventType}, ${failure.id}) — ` +
            `${String(failure.attemptCount)} deneme sonrasi vazgecildi: ${failure.reason}`,
        );
        continue;
      }

      this.#logger.warn(
        `Tenant outbox islemesi basarisiz, yeniden denenecek (${failure.eventType}, ` +
          `${failure.id}, deneme ${String(failure.attemptCount)}): ${failure.reason}`,
      );
    }

    if (result.unhandledEventTypes.length > 0) {
      // Eksik handler UYARIDIR: kayitlar bekliyor ve birikiyor. Faz 4'te gercek
      // modul event'leri geldiginde handler'i unutulan tip burada gorunur.
      this.#logger.warn(
        `Tenant outbox: handler i olmayan event tipleri: ${result.unhandledEventTypes.join(', ')}`,
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
