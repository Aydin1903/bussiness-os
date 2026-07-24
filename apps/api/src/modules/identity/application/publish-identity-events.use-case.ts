import { type Clock } from '../../../shared/clock.port';
import { EmailDeliveryError, type EmailPort } from '../../../shared/email.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { PasswordResetRequested } from '../domain/password-reset-requested.event';
import { UserEmailVerified } from '../domain/user-email-verified.event';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { UserPasswordChanged } from '../domain/user-password-changed.event';
import { UserRegistered } from '../domain/user-registered.event';
import {
  type IdentityOutboxRecord,
  type IdentityOutboxRepository,
  type OutboxDeliveryFailure,
} from './identity-outbox.repository.port';
import { buildPasswordChangedNotification } from './password-changed-email.builder';
import { buildPasswordResetEmail } from './password-reset-email.builder';
import { decideDeliveryRetry } from './outbox-retry.policy';
import { buildVerificationEmail } from './verification-email.builder';

/** Teslimati BASARISIZ olan kayit. */
export interface OutboxFailure {
  readonly id: string;
  readonly eventType: string;
  readonly reason: string;
  /** Bu denemeden sonraki sayac. */
  readonly attemptCount: number;
  /** `true` ise kayit kuyruktan CIKARILDI ve ALARM gerektirir. */
  readonly deadLettered: boolean;
}

export interface PublishIdentityEventsResult {
  /** Bu turda kilitlenen kayit sayisi. */
  readonly claimed: number;
  /** Gercekten e-posta gonderilen kayit sayisi. */
  readonly delivered: number;
  /** `published_at` yazilan kayit sayisi (gonderilenler + is gerektirmeyenler). */
  readonly acknowledged: number;
  readonly failures: readonly OutboxFailure[];
  /** Bu turda olu mektuba dusen kayit sayisi — ALARM konusu. */
  readonly deadLettered: number;
  /** Handler'i OLMAYAN event tipleri — isaretlenmez, gorunur kalir. */
  readonly unhandledEventTypes: readonly string[];
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface PublishIdentityEventsDependencies {
  readonly outboxRepository: IdentityOutboxRepository;
  readonly emailPort: EmailPort;
  readonly transactionManager: TransactionManager;
  readonly clock: Clock;
  /** Tek turda islenecek en fazla kayit. Config'ten gelir. */
  readonly batchSize: number;
}

/**
 * Teslimat GEREKTIRMEYEN event'ler.
 *
 * Denetim event'leridir; bugun hicbir yan etkileri yoktur. Yine de
 * ISARETLENIRLER: birakilsalardi `identity_outbox_pending_idx` sonsuza kadar
 * buyur ve her tur ayni satirlar yeniden okunurdu. "Islendi" demek ile "is
 * yoktu" demek arasindaki fark burada kayit altina alinir.
 */
const NO_DELIVERY_EVENT_TYPES: readonly string[] = [UserLoggedIn.TYPE, UserEmailVerified.TYPE];

/** Tek turun ic muhasebesi; disariya `PublishIdentityEventsResult` olarak cikar. */
interface BatchOutcome {
  readonly publishedIds: string[];
  readonly deliveryFailures: OutboxDeliveryFailure[];
  readonly failures: OutboxFailure[];
  readonly unhandledEventTypes: string[];
  delivered: number;
}

/** Hata mesajini guvenle metne cevirir; `Error` disi firlatilan degerler de olur. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Hata KALICI mi? Yalnizca adapter'in acikca isaretledigi hatalar kalicidir.
 *
 * Bilinmeyen bir hata (bozuk payload, beklenmedik istisna) GECICI sayilir —
 * fail-safe yon budur: gecici sanip yeniden denemek en fazla birkac tur israf
 * eder, kalici sanip olu mektuba atmak ise gecerli bir e-postayi kaybeder.
 */
function isPermanent(error: unknown): boolean {
  return error instanceof EmailDeliveryError && error.permanent;
}

const EMPTY_RESULT: PublishIdentityEventsResult = Object.freeze({
  claimed: 0,
  delivered: 0,
  acknowledged: 0,
  failures: Object.freeze([]),
  deadLettered: 0,
  unhandledEventTypes: Object.freeze([]),
});

/**
 * `platform.identity_outbox`'i tuketir ve yan etkilerini uygular (ADR-0006).
 *
 * ============================================================================
 * TESLIMAT KILIDIN ICINDE — bilincli
 * ============================================================================
 * Kayitlar `FOR UPDATE SKIP LOCKED` ile kilitlenir, e-posta GONDERILIR, sonra
 * `published_at` yazilir ve transaction commit olur. Yani ag cagrisi kilidin
 * icindedir.
 *
 * Alternatifi — once isaretle, sonra gonder — daha kotudur: isaretleme commit
 * olur ve gonderim coker, e-posta HIC gitmez ve kimse fark etmez. Bu sirayla en
 * kotu senaryo AYNI e-postanin iki kez gitmesidir; ADR-0006 teslimatin
 * at-least-once oldugunu zaten soyler.
 *
 * `SKIP LOCKED`: ikinci bir instance ayni satirda BEKLEMEZ, atlar ve digerlerini
 * isler. Kilit bekleseydi iki instance birbirini yavaslatirdi.
 * ============================================================================
 *
 * ============================================================================
 * BASARISIZLIK YOLU (0006, AUTH §16.1 — borc KAPATILDI)
 * ============================================================================
 * Teslimat basarisiz olursa kayit ne kaybolur ne de sonsuza kadar denenir:
 *   1. `attempt_count` artar ve `last_error` yazilir (teshis),
 *   2. `next_attempt_at` ile ustel backoff uygulanir — kayit o ana kadar
 *      kuyruktan CIKMIS gibi davranir ve arkasindakileri geciktirmez,
 *   3. Sinira ulasan (veya KALICI hata alan) kayit olu mektuba duser ve
 *      ALARM uretir.
 *
 * Kalici/gecici ayrimini adapter yapar (`EmailDeliveryError.permanent`); karari
 * `outbox-retry.policy.ts` verir. Gecersiz bir adresi 5 kez denemek, kuyrugu
 * bosuna mesgul edip ARKASINDAKI gecerli e-postalari geciktirirdi.
 * ============================================================================
 */
export class PublishIdentityEventsUseCase {
  constructor(private readonly deps: PublishIdentityEventsDependencies) {}

  /** Tek tur calistirir. Zamanlama cagiranin isidir (relay). */
  async execute(): Promise<PublishIdentityEventsResult> {
    return this.deps.transactionManager.runInTransaction(() => this.#runBatch());
  }

  async #runBatch(): Promise<PublishIdentityEventsResult> {
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

  async #deliverAll(records: readonly IdentityOutboxRecord[], now: Date): Promise<BatchOutcome> {
    const outcome: BatchOutcome = {
      publishedIds: [],
      deliveryFailures: [],
      failures: [],
      unhandledEventTypes: [],
      delivered: 0,
    };

    for (const record of records) {
      try {
        // Sirayla islenir, paralel DEGIL: ayni saglayiciya es zamanli istek
        // yagdirmak oran sinirlarini tetikler.
        const result = await this.#deliver(record);

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
        // Bir kaydin hatasi turun tamamini goturmez; digerleri teslim edilir.
        this.#registerFailure({ outcome, record, error, now });
      }
    }

    return outcome;
  }

  /** Basarisizligi politikaya danisarak backoff'a veya olu mektuba cevirir. */
  #registerFailure(input: {
    readonly outcome: BatchOutcome;
    readonly record: IdentityOutboxRecord;
    readonly error: unknown;
    readonly now: Date;
  }): void {
    const { outcome, record, error, now } = input;
    const decision = decideDeliveryRetry({
      previousAttemptCount: record.attemptCount,
      permanent: isPermanent(error),
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

  /** Tek kaydin yan etkisini uygular. */
  async #deliver(record: IdentityOutboxRecord): Promise<'delivered' | 'no-op' | 'unhandled'> {
    if (record.eventType === UserRegistered.TYPE) {
      await this.deps.emailPort.send(buildVerificationEmail(record.payload));
      return 'delivered';
    }

    if (record.eventType === PasswordResetRequested.TYPE) {
      await this.deps.emailPort.send(buildPasswordResetEmail(record.payload));
      return 'delivered';
    }

    if (record.eventType === UserPasswordChanged.TYPE) {
      // Bilgilendirme e-postasi ("parolan degistirildi").
      await this.deps.emailPort.send(buildPasswordChangedNotification(record.payload));
      return 'delivered';
    }

    if (NO_DELIVERY_EVENT_TYPES.includes(record.eventType)) {
      return 'no-op';
    }

    return 'unhandled';
  }
}
