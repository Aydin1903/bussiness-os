import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { TooManyVerificationRequestsError } from '../domain/identity.error';
import { IpAddress } from '../domain/ip-address.value-object';
import {
  PASSWORD_RESET_CODE_TTL_MINUTES,
  PasswordResetCode,
} from '../domain/password-reset-code.entity';
import { PasswordResetCodeId } from '../domain/password-reset-code-id.value-object';
import { evaluatePasswordResetRequest } from '../domain/password-reset-request-policy';
import { PasswordResetRequested } from '../domain/password-reset-requested.event';
import { type User } from '../domain/user.entity';
import { RESEND_WINDOW_MINUTES } from '../domain/verification-resend-policy';
import { type PasswordResetCodeRepository } from './password-reset-code.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';
import { type VerificationCodeRequestRepository } from './verification-code-request.repository.port';
import { VerificationCodeRequest } from '../domain/verification-code-request.entity';
import { VerificationCodeRequestId } from '../domain/verification-code-request-id.value-object';

const MINUTE_MS = 60_000;

export interface RequestPasswordResetCommand {
  readonly email: string;
  /** Baglantidan alinir, govdeden DEGIL: kaynak sinirinin sayac anahtaridir. */
  readonly ipAddress: string;
  readonly correlationId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface RequestPasswordResetDependencies {
  readonly userRepository: UserRepository;
  readonly passwordResetCodeRepository: PasswordResetCodeRepository;
  readonly requestRepository: VerificationCodeRequestRepository;
  readonly verificationCodeGenerator: VerificationCodeGenerator;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

interface RequestContext {
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly now: Date;
  readonly correlationId: string;
}

/**
 * Parola sifirlama kodu ister (AUTH_ARCHITECTURE 7.6, ADR-0024).
 *
 * ============================================================================
 * YANIT HER ZAMAN AYNIDIR — hesap varlik oracle'i olmamali (P2)
 * ============================================================================
 * Kullanici yoksa, aktif degilse veya hesap siniri asilmissa: hicbir sey
 * uretilmez ama use case AYNI seyi dondurur (`void`) ve hata FIRLATMAZ.
 * Firlatilan tek hata IP sinirina aittir ve hesabin varligindan bagimsizdir.
 * 120 saniyelik bekleme ve saatlik hesap siniri da SESSIZDIR.
 *
 * Oran sinirlari `RegisterUserUseCase`/`ResendVerificationUseCase` ile AYNI
 * defteri (`verification_code_requests`) paylasir; tek fark bekleme suresidir
 * (120 sn). Bkz. `password-reset-request-policy.ts`.
 * ============================================================================
 *
 * Yeni kod uretildiginde onceki reset kodu GECERSIZLESIR (`supersede`): §7.6
 * "ayni anda gecerli kod: bir tane". `RegisterUserUseCase` deseniyle: istek once
 * KENDI transaction'inda deftere yazilir (sinir asan istek de sayilsin).
 */
export class RequestPasswordResetUseCase {
  constructor(private readonly deps: RequestPasswordResetDependencies) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    const context: RequestContext = {
      email: Email.create(command.email),
      ipAddress: IpAddress.create(command.ipAddress),
      now: this.deps.clock.now(),
      correlationId: command.correlationId,
    };

    const decision = await this.#decide(context);

    if (decision === 'rate-limited') {
      throw new TooManyVerificationRequestsError();
    }
    if (decision === 'skip') {
      return;
    }

    const rawCode = this.deps.verificationCodeGenerator.generate();

    await this.deps.transactionManager.runInTransaction(async () => {
      const user = await this.deps.userRepository.findByEmail(context.email);
      // Yalnizca AKTIF kullaniciya sifirlama kodu uretilir: pending (henuz
      // dogrulanmamis) hesabin kurtarma yolu dogrulama akisidir, sifirlama degil;
      // deactivated/locked hesaba sifirlama anlamsizdir. Hicbiri istemciye
      // ayirt ettirilmez (P2).
      if (user?.isActive !== true) {
        return;
      }

      await this.#issueCode(context, user, rawCode);
    });
  }

  /**
   * Sayimlari okur, istegi deftere yazar ve karari uretir.
   *
   * Defter satiri KENDI transaction'indadir: sinir asildiginda hata firlatilir,
   * ayni transaction'da olsaydi o hata satiri geri alir ve sinir asan istekler
   * hic sayilmazdi (`ResendVerificationUseCase` ile ayni ders).
   */
  async #decide(context: RequestContext): Promise<'allow' | 'skip' | 'rate-limited'> {
    const { requestRepository: requests } = this.deps;
    const since = new Date(context.now.getTime() - RESEND_WINDOW_MINUTES * MINUTE_MS);

    const counts = await this.deps.transactionManager.runInTransaction(async () => ({
      lastRequestedAt: await requests.findLastRequestedAt(context.email),
      accountRequestsInWindow: await requests.countByEmail(context.email, since),
      ipRequestsInWindow: await requests.countByIp(context.ipAddress, since),
    }));

    await this.deps.transactionManager.runInTransaction(() =>
      requests.save(
        VerificationCodeRequest.record({
          id: VerificationCodeRequestId.create(this.deps.idGenerator.nextId()),
          email: context.email,
          ipAddress: context.ipAddress,
          requestedAt: context.now,
        }),
      ),
    );

    const decision = evaluatePasswordResetRequest(counts, context.now);

    if (decision.action === 'rate-limited') {
      return 'rate-limited';
    }
    return decision.action === 'allow' ? 'allow' : 'skip';
  }

  /** Onceki reset kodunu gecersizlestirir ve yenisini yayinlar. */
  async #issueCode(context: RequestContext, user: User, rawCode: string): Promise<void> {
    const previous = await this.deps.passwordResetCodeRepository.findActiveByUserId(user.id);
    if (previous !== null) {
      previous.supersede(context.now);
      await this.deps.passwordResetCodeRepository.save(previous);
    }

    await this.deps.passwordResetCodeRepository.save(this.#buildCode(user.id, rawCode, context.now));

    // Teslimat outbox uzerinden; use case EmailPort'u DOGRUDAN cagirmaz (§7.7).
    await this.deps.eventPublisher.publish(
      PasswordResetRequested.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        email: context.email,
        resetCode: rawCode,
        occurredAt: context.now,
        correlationId: context.correlationId,
      }),
    );
  }

  #buildCode(userId: UserId, rawCode: string, now: Date): PasswordResetCode {
    return PasswordResetCode.issue({
      id: PasswordResetCodeId.create(this.deps.idGenerator.nextId()),
      userId,
      codeHash: this.deps.verificationCodeHasher.hash(rawCode),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * MINUTE_MS),
    });
  }
}
