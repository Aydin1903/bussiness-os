import { type Clock } from '../../../shared/clock.port';
import { type EmailPort } from '../../../shared/email.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserEmailVerified } from '../domain/user-email-verified.event';
import { UserLoggedIn } from '../domain/user-logged-in.event';
import { UserRegistered } from '../domain/user-registered.event';
import {
  type IdentityOutboxRecord,
  type IdentityOutboxRepository,
} from './identity-outbox.repository.port';
import { buildVerificationEmail } from './verification-email.builder';

/**
 * Teslimati BASARISIZ olan kayit. `published_at` yazilmaz — sonraki turda
 * yeniden denenir.
 */
export interface OutboxFailure {
  readonly id: string;
  readonly eventType: string;
  readonly reason: string;
}

export interface PublishIdentityEventsResult {
  /** Bu turda kilitlenen kayit sayisi. */
  readonly claimed: number;
  /** Gercekten e-posta gonderilen kayit sayisi. */
  readonly delivered: number;
  /** `published_at` yazilan kayit sayisi (gonderilenler + is gerektirmeyenler). */
  readonly acknowledged: number;
  readonly failures: readonly OutboxFailure[];
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
  readonly failures: OutboxFailure[];
  readonly unhandledEventTypes: string[];
  readonly delivered: number;
}

/** Hata mesajini guvenle metne cevirir; `Error` disi firlatilan degerler de olur. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY_RESULT: PublishIdentityEventsResult = Object.freeze({
  claimed: 0,
  delivered: 0,
  acknowledged: 0,
  failures: Object.freeze([]),
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
 * ⚠️ TEKNIK BORC — RESEND'E GECMEDEN ONCE KAPATILMALI
 * ============================================================================
 * Bugun kalici bir teslimat hatasi SONSUZA KADAR yeniden denenir: kayit
 * yayinlanmamis kalir ve her tur tekrar alinir. Konsol adapter'i asla hata
 * vermedigi icin bu bugun teorik bir risktir.
 *
 * GERCEK saglayici (Resend) baglanmadan ONCE sunlar gerekir:
 *   1. `attempt_count` + `last_error` kolonlari (migration)
 *   2. Ustel geri cekilme (backoff) — her turda yeniden denemek degil
 *   3. Dead-letter: N denemeden sonra kayit kuyruktan cikarilir ve ALARM uretir
 *
 * Bunlar olmadan gecersiz bir adres kuyrugu sonsuza kadar mesgul eder ve
 * arkasindaki gecerli e-postalar gecikir. AUTH_ARCHITECTURE §16'da da borc
 * olarak kayitlidir.
 * ============================================================================
 */
export class PublishIdentityEventsUseCase {
  constructor(private readonly deps: PublishIdentityEventsDependencies) {}

  /** Tek tur calistirir. Zamanlama cagiranin isidir (relay). */
  async execute(): Promise<PublishIdentityEventsResult> {
    return this.deps.transactionManager.runInTransaction(() => this.#runBatch());
  }

  async #runBatch(): Promise<PublishIdentityEventsResult> {
    const records = await this.deps.outboxRepository.claimPending(this.deps.batchSize);
    if (records.length === 0) {
      return EMPTY_RESULT;
    }

    const outcome = await this.#deliverAll(records);

    await this.deps.outboxRepository.markPublished(outcome.publishedIds, this.deps.clock.now());

    return {
      claimed: records.length,
      delivered: outcome.delivered,
      acknowledged: outcome.publishedIds.length,
      failures: outcome.failures,
      unhandledEventTypes: outcome.unhandledEventTypes,
    };
  }

  async #deliverAll(records: readonly IdentityOutboxRecord[]): Promise<BatchOutcome> {
    const publishedIds: string[] = [];
    const failures: OutboxFailure[] = [];
    const unhandledEventTypes: string[] = [];
    let delivered = 0;

    for (const record of records) {
      try {
        // Sirayla islenir, paralel DEGIL: ayni saglayiciya es zamanli istek
        // yagdirmak oran sinirlarini tetikler.
        const outcome = await this.#deliver(record);

        if (outcome === 'unhandled') {
          // ISARETLENMEZ: eksik bir handler sessizce "islenmis" sayilmamali.
          unhandledEventTypes.push(record.eventType);
          continue;
        }

        delivered += outcome === 'delivered' ? 1 : 0;
        publishedIds.push(record.id);
      } catch (error) {
        // Bir kaydin hatasi turun tamamini goturmez; digerleri teslim edilir.
        failures.push({ id: record.id, eventType: record.eventType, reason: describe(error) });
      }
    }

    return { publishedIds, failures, unhandledEventTypes, delivered };
  }

  /** Tek kaydin yan etkisini uygular. */
  async #deliver(record: IdentityOutboxRecord): Promise<'delivered' | 'no-op' | 'unhandled'> {
    if (record.eventType === UserRegistered.TYPE) {
      await this.deps.emailPort.send(buildVerificationEmail(record.payload));
      return 'delivered';
    }

    if (NO_DELIVERY_EVENT_TYPES.includes(record.eventType)) {
      return 'no-op';
    }

    return 'unhandled';
  }
}
