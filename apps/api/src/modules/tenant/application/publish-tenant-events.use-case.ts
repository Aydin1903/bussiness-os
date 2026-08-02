import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { TenantProvisioningRequested } from '../domain/tenant-provisioning-requested.event';
import { decideTenantDeliveryRetry } from './tenant-outbox-retry.policy';
import {
  type TenantOutboxDeliveryFailure,
  type TenantOutboxRecord,
  type TenantOutboxRepository,
} from './tenant-outbox.repository.port';

/** Teslimati BASARISIZ olan kayit. */
export interface TenantOutboxFailure {
  readonly id: string;
  readonly eventType: string;
  readonly reason: string;
  /** Bu denemeden sonraki sayac. */
  readonly attemptCount: number;
  /** `true` ise kayit kuyruktan CIKARILDI ve ALARM gerektirir. */
  readonly deadLettered: boolean;
}

export interface PublishTenantEventsResult {
  /** Bu turda kilitlenen kayit sayisi. */
  readonly claimed: number;
  /** Gercekten yan etki uygulanan kayit sayisi. */
  readonly delivered: number;
  /** `published_at` yazilan kayit sayisi (teslim edilenler + is gerektirmeyenler). */
  readonly acknowledged: number;
  readonly failures: readonly TenantOutboxFailure[];
  /** Bu turda olu mektuba dusen kayit sayisi — ALARM konusu. */
  readonly deadLettered: number;
  /** Handler'i OLMAYAN event tipleri — isaretlenmez, gorunur kalir. */
  readonly unhandledEventTypes: readonly string[];
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface PublishTenantEventsDependencies {
  readonly outboxRepository: TenantOutboxRepository;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
  /** Tek turda islenecek en fazla kayit. Config'ten gelir. */
  readonly batchSize: number;
}

/**
 * Teslimat GEREKTIRMEYEN event'ler.
 *
 * ============================================================================
 * BUGUN LISTEDEKI TEK EVENT BU — ve bu bilincli
 * ============================================================================
 * `tenant.provisioning_requested` bir DENETIM kaydidir: V1 provisioning
 * SENKRONDUR (ADR-0016, tenant aninda `active` acilir), dolayisiyla event'in
 * tuketici tarafinda yapmasi gereken bir isi yoktur.
 *
 * Yine de ISARETLENIR: birakilsaydi `outbox_pending_idx` sonsuza kadar buyur ve
 * her tur ayni satirlar yeniden okunurdu. "Islendi" demek ile "is yoktu" demek
 * arasindaki fark burada kayit altina alinir (Identity ile ayni gerekce).
 * ============================================================================
 */
const NO_DELIVERY_EVENT_TYPES: readonly string[] = [TenantProvisioningRequested.TYPE];

/** Tek turun ic muhasebesi; disariya `PublishTenantEventsResult` olarak cikar. */
interface BatchOutcome {
  readonly publishedIds: string[];
  readonly deliveryFailures: TenantOutboxDeliveryFailure[];
  readonly failures: TenantOutboxFailure[];
  readonly unhandledEventTypes: string[];
  delivered: number;
}

/** Hata mesajini guvenle metne cevirir; `Error` disi firlatilan degerler de olur. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY_RESULT: PublishTenantEventsResult = Object.freeze({
  claimed: 0,
  delivered: 0,
  acknowledged: 0,
  failures: Object.freeze([]),
  deadLettered: 0,
  unhandledEventTypes: Object.freeze([]),
});

/**
 * `platform.outbox`'i tuketir ve yan etkilerini uygular (ADR-0006).
 *
 * ============================================================================
 * BUGUN NE YAPIYOR — durustce
 * ============================================================================
 * Hicbir event'in teslimat isi YOKTUR. Bu use case bugun yalnizca bekleyen
 * kayitlari `published_at` ile isaretler ve kuyrugu bosaltir.
 *
 * O halde neden yaziliyor: ilk is modulu (Faz 4) domain event uretmeye
 * basladiginda ALTYAPININ HAZIR olmasi icin. Drain sureci olmadan yazilan bir
 * modul, "event yayinliyorum" sanan ama hicbir sey yayinlamayan bir moduldur —
 * ADR-0006'nin tam olarak engellemek icin var oldugu sessiz hata. Tuketici
 * mantigi o gun, her event tipi icin AYRI AYRI yazilacaktir.
 * ============================================================================
 *
 * ============================================================================
 * TESLIMAT KILIDIN ICINDE — bilincli (Identity ile ayni)
 * ============================================================================
 * Kayitlar `FOR UPDATE SKIP LOCKED` ile kilitlenir, yan etki uygulanir, sonra
 * `published_at` yazilir ve transaction commit olur.
 *
 * Alternatifi — once isaretle, sonra uygula — daha kotudur: isaretleme commit
 * olur ve yan etki coker, event HIC islenmez ve kimse fark etmez. Bu sirayla en
 * kotu senaryo AYNI event'in iki kez islenmesidir; ADR-0006 teslimatin
 * at-least-once oldugunu zaten soyler ve handler'lar idempotent yazilir.
 * ============================================================================
 *
 * ============================================================================
 * BASARISIZLIK YOLU
 * ============================================================================
 * Teslimat basarisiz olursa kayit ne kaybolur ne de sonsuza kadar denenir:
 *   1. `attempt_count` artar ve `last_error` yazilir (teshis),
 *   2. `next_attempt_at` ile ustel backoff uygulanir — kayit o ana kadar
 *      kuyruktan CIKMIS gibi davranir ve arkasindakileri geciktirmez,
 *   3. Sinira ulasan (veya KALICI hata alan) kayit olu mektuba duser ve
 *      ALARM uretir.
 * Karari `tenant-outbox-retry.policy.ts` verir.
 * ============================================================================
 */
export class PublishTenantEventsUseCase {
  constructor(private readonly deps: PublishTenantEventsDependencies) {}

  /** Tek tur calistirir. Zamanlama cagiranin isidir (relay). */
  async execute(): Promise<PublishTenantEventsResult> {
    // `runInTransaction` — tenant context KURULMAZ ve kurulamaz: tuketici
    // tenant'lar ARASI okur. RLS asimi repository'nin SQL fonksiyonlarindadir.
    return this.deps.transactionManager.runInTransaction(() => this.#runBatch());
  }

  async #runBatch(): Promise<PublishTenantEventsResult> {
    const now = this.deps.clock.now();
    const records = await this.deps.outboxRepository.claimPending(this.deps.batchSize, now);
    if (records.length === 0) {
      return EMPTY_RESULT;
    }

    const outcome = await this.#deliverAll(records, now);

    await this.deps.outboxRepository.markPublished(outcome.publishedIds, now);
    // Basarisizliklar da YAZILIR: yazilmasaydi sayac artmaz, backoff uygulanmaz
    // ve kayit her turda yeniden denenirdi.
    await this.deps.outboxRepository.recordFailures(outcome.deliveryFailures);

    return {
      claimed: records.length,
      delivered: outcome.delivered,
      acknowledged: outcome.publishedIds.length,
      failures: outcome.failures,
      deadLettered: outcome.failures.filter((failure) => failure.deadLettered).length,
      unhandledEventTypes: outcome.unhandledEventTypes,
    };
  }

  async #deliverAll(
    records: readonly TenantOutboxRecord[],
    now: Date,
  ): Promise<BatchOutcome> {
    const outcome: BatchOutcome = {
      publishedIds: [],
      deliveryFailures: [],
      failures: [],
      unhandledEventTypes: [],
      delivered: 0,
    };

    for (const record of records) {
      try {
        // Sirayla islenir, paralel DEGIL: gercek handler'lar geldiginde ayni
        // dis servise es zamanli istek yagdirmak oran sinirlarini tetikler.
        const result = await this.deliver(record);

        if (result === 'unhandled') {
          // ISARETLENMEZ: eksik bir handler sessizce "islenmis" sayilmamali.
          outcome.unhandledEventTypes.push(record.eventType);
          continue;
        }

        if (result === 'delivered') {
          outcome.delivered += 1;
        }
        outcome.publishedIds.push(record.id);
      } catch (error) {
        // Bir kaydin hatasi turun tamamini goturmez; digerleri islenir.
        this.#registerFailure({ outcome, record, error, now });
      }
    }

    return outcome;
  }

  /** Basarisizligi politikaya danisarak backoff'a veya olu mektuba cevirir. */
  #registerFailure(input: {
    readonly outcome: BatchOutcome;
    readonly record: TenantOutboxRecord;
    readonly error: unknown;
    readonly now: Date;
  }): void {
    const { outcome, record, error, now } = input;
    const decision = decideTenantDeliveryRetry({
      previousAttemptCount: record.attemptCount,
      // Kalici/gecici ayrimi yapabilecek bir adapter henuz yok; bilinmeyen hata
      // GECICI sayilir. Fail-safe yon budur: gecici sanip yeniden denemek en
      // fazla birkac tur israf eder, kalici sanip olu mektuba atmak ise gecerli
      // bir event'i kaybeder.
      permanent: false,
      now,
    });
    const deadLettered = decision.action === 'dead-letter';

    outcome.deliveryFailures.push({
      id: record.id,
      attemptCount: decision.attemptCount,
      lastError: describe(error),
      nextAttemptAt: decision.action === 'retry' ? decision.nextAttemptAt : null,
      deadLetteredAt: deadLettered ? now : null,
    });

    outcome.failures.push({
      id: record.id,
      eventType: record.eventType,
      reason: describe(error),
      attemptCount: decision.attemptCount,
      deadLettered,
    });
  }

  /**
   * Tek kaydin yan etkisini uygular.
   *
   * BUGUN HICBIR EVENT'IN YAN ETKISI YOK. `TenantProvisioningRequested`
   * `no-op` doner (isaretlenir), bilinmeyen her tip `unhandled` doner
   * (isaretlenmez, gorunur kalir). Faz 4'te gercek handler'lar buraya, her
   * event tipi icin ayri bir dal olarak eklenecektir — Identity'nin
   * `#deliver`'i ile ayni bicimde.
   *
   * ============================================================================
   * NEDEN `protected`, Identity'de `#private` IKEN
   * ============================================================================
   * Identity'nin basarisizlik yolu sahte bir `EmailPort` ile test edilebilir:
   * teslimat gercek bir port'a gider ve o port firlatabilir. BURADA HENUZ
   * TESLIMAT YOK — bu metot bugun ASLA firlatmaz, dolayisiyla `#registerFailure`
   * (politika karari -> backoff/olu mektup yazimi) hicbir test tarafindan
   * calistirilamazdi.
   *
   * Test icin sahte bir port ICAT ETMEK yerine (kapsam disi ve gercek olmayan
   * bir soyutlama uretirdi) metot `protected` yapildi: test bir alt sinifla
   * firlatan bir teslimat taklit eder ve GERCEK basarisizlik yolu calisir.
   *
   * Bu ayni zamanda Faz 4'un dogal genisleme noktasidir; `private` olsaydi
   * handler eklemek bu dosyayi degistirmeyi zorunlu kilardi.
   * ============================================================================
   */
  protected deliver(record: TenantOutboxRecord): Promise<'delivered' | 'no-op' | 'unhandled'> {
    if (NO_DELIVERY_EVENT_TYPES.includes(record.eventType)) {
      return Promise.resolve('no-op');
    }

    return Promise.resolve('unhandled');
  }
}
