import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { Email } from '../domain/email.value-object';
import {
  MAX_VERIFICATION_ATTEMPTS,
  type EmailVerificationCode,
} from '../domain/email-verification-code.entity';
import { type User } from '../domain/user.entity';
import { UserEmailVerified } from '../domain/user-email-verified.event';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';

export interface VerifyEmailCommand {
  readonly email: string;
  readonly code: string;
  /** HTTP sinirindan gelir; event ve loglar uzerinden uctan uca izleme saglar. */
  readonly correlationId: string;
}

/**
 * Dogrulamanin sonucu. `invalid` TEK bir sonuctur: kullanici yok, kod yok,
 * suresi dolmus, hakki tukenmis, kod yanlis ve "zaten dogrulanmis" — hepsi
 * ayni degere duser (bkz. sinif yorumu).
 */
export type VerifyEmailOutcome = 'verified' | 'invalid';

export interface VerifyEmailResult {
  readonly outcome: VerifyEmailOutcome;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface VerifyEmailDependencies {
  readonly userRepository: UserRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

const INVALID: VerifyEmailResult = Object.freeze({ outcome: 'invalid' });
const VERIFIED: VerifyEmailResult = Object.freeze({ outcome: 'verified' });

/** Dogrulanacak hedef: kullanici ve onun aktif kodu. */
interface VerificationTarget {
  readonly user: User;
  readonly code: EmailVerificationCode;
}

/**
 * E-posta dogrulama kodunu kullanir (AUTH_ARCHITECTURE 7.5, ADR-0019).
 *
 * ============================================================================
 * NEDEN SONUC DONDURUR, NEDEN HATA FIRLATMAZ — en kritik tasarim karari
 * ============================================================================
 * Deneme sayaci, dogrulama ile AYNI TRANSACTION'da atomik olarak artirilir
 * (§7.3). Red bir exception ile bildirilseydi transaction GERI ALINIR ve
 * sayacin artisi da SILINIRDI: 5 denemelik sinir (ADR-0019) hicbir zaman
 * dolmaz, kod 10^6'lik arama uzayinda sinirsiz denenebilirdi.
 *
 * Bu yuzden beklenen redler `throw` DEGIL, `outcome: 'invalid'` olarak doner —
 * transaction commit olur, sayac artisi kalicidir. `LoginUseCase` ayni sorunu
 * ters yonden cozer (basarisiz denemeyi KENDI transaction'inda commit edip
 * sonra firlatir); orada sayac ayri bir tabloda, burada dogrulanan kaydin
 * kendi ustundedir, bu yuzden tek transaction korunur.
 *
 * Firlatilan tek hata sinifi GIRDI BICIMIDIR (`Email.create`) — 422 uretir ve
 * hesabin varligiyla ilgisizdir, sizinti yaratmaz.
 * ============================================================================
 *
 * ============================================================================
 * TUM REDLER AYNI SONUCU DONER (P2)
 * ============================================================================
 * "Kod yanlis" ile "kod suresi dolmus" ayirt edilebilirse saldirgan hangi
 * kodun HALA gecerli oldugunu ogrenir ve denemelerini ona gore yoneltir.
 * "Zaten dogrulanmis" da ayni sepettedir: idempotent bir basari donsaydi,
 * RASTGELE bir kodla 200 almak mumkun olur ve uc nokta "bu e-posta kayitli ve
 * dogrulanmis mi" sorusunu yanitlayan bir oracle'a donerdi.
 * ============================================================================
 */
export class VerifyEmailUseCase {
  constructor(private readonly deps: VerifyEmailDependencies) {}

  async execute(command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    // Bicim, veritabanina dokunmadan once dogrulanir; ihlali 422'dir.
    const email = Email.create(command.email);

    // Identity akislari tenant context'siz calisir (12.4.3). Tek transaction:
    // sayac artisi, kodun tuketilmesi ve kullanici degisikligi birlikte commit olur.
    return this.deps.transactionManager.runInTransaction(() => this.#verify(email, command));
  }

  async #verify(email: Email, command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const now = this.deps.clock.now();

    const target = await this.#findTarget(email, now);
    if (target === null) {
      return INVALID;
    }

    // Sayac HMAC KIYASINDAN ONCE artar: kiyas once yapilsaydi, dogru kodu
    // bulan saldirgan hicbir deneme harcamamis olurdu.
    if (!(await this.#registerAttempt(target.code))) {
      return INVALID;
    }

    if (!this.deps.verificationCodeHasher.verify(command.code, target.code.codeHash)) {
      return INVALID;
    }

    await this.#complete(target, now, command.correlationId);
    return VERIFIED;
  }

  /**
   * Dogrulanabilir kullanici + kod ciftini bulur; yoksa `null`.
   *
   * DURUM KAPISI (`status === 'pending'`) atlanamaz: durum grafigi `locked ->
   * active` gecisine IZIN VERIR (user-status.value-object.ts), yani kilitli bir
   * hesaba dogru kod gonderilirse `verifyEmail()` onu SESSIZCE KILITTEN
   * CIKARIRDI. `deactivated` ise gecise hic izin vermez ve eslenmemis bir
   * domain hatasiyla 500 uretirdi. Zaten dogrulanmis (`active`) kullanici da
   * buradan elenir — istenen davranis budur (bkz. sinif yorumu).
   */
  async #findTarget(email: Email, now: Date): Promise<VerificationTarget | null> {
    const user = await this.deps.userRepository.findByEmail(email);
    if (user?.status !== 'pending') {
      return null;
    }

    const code = await this.deps.verificationCodeRepository.findActiveByUserId(user.id);
    if (code?.isVerifiable(now) !== true) {
      return null;
    }

    return { user, code };
  }

  /**
   * Denemeyi ATOMIK olarak isler; kod hala denenebilir durumdaysa `true`.
   *
   * Artis tek bir `UPDATE ... attempt_count + 1 ... RETURNING` ile yapilir
   * (§7.3): entity okunup geri yazilsaydi es zamanli istekler ayni sayaci
   * okuyup denemeleri atlatirdi. OTORITE VERITABANIDIR; entity uzerindeki
   * artis yalnizca bir AYNADIR ve basari yolunda `save()`in bayat bir sayac
   * yazmasini engeller.
   *
   * Sinirin asilmasi ayrica "kodu gecersizlestirme" yazmasi GEREKTIRMEZ:
   * `hasAttemptsRemaining` dogrudan sayactan turer, dolayisiyla kod bir sonraki
   * istekte kendiliginden `isVerifiable = false` olur.
   */
  async #registerAttempt(code: EmailVerificationCode): Promise<boolean> {
    const attemptCount = await this.deps.verificationCodeRepository.incrementAttemptCount(code.id);

    // `null`: satir aradaki surede silinmis. Sinir asildi: bu istek de reddedilir.
    if (attemptCount === null || attemptCount > MAX_VERIFICATION_ATTEMPTS) {
      return false;
    }

    code.registerFailedAttempt();
    return true;
  }

  /** Basari yolu: kullanici, kod ve event birlikte yazilir. */
  async #complete(target: VerificationTarget, now: Date, correlationId: string): Promise<void> {
    const { user, code } = target;

    // pending -> active ve emailVerified = true; ikisi tek gecistedir.
    user.verifyEmail();
    code.consume(now);

    await this.deps.userRepository.save(user);
    await this.deps.verificationCodeRepository.save(code);
    await this.deps.eventPublisher.publish(
      UserEmailVerified.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        occurredAt: now,
        correlationId,
      }),
    );
  }
}
