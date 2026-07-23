import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import {
  EmailVerificationCode,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../domain/email-verification-code.entity';
import { EmailVerificationCodeId } from '../domain/email-verification-code-id.value-object';
import { TooManyVerificationRequestsError } from '../domain/identity.error';
import { IpAddress } from '../domain/ip-address.value-object';
import { type User } from '../domain/user.entity';
import { UserRegistered } from '../domain/user-registered.event';
import { VerificationCodeRequest } from '../domain/verification-code-request.entity';
import { VerificationCodeRequestId } from '../domain/verification-code-request-id.value-object';
import { evaluateResend, RESEND_WINDOW_MINUTES } from '../domain/verification-resend-policy';
import { type EmailVerificationCodeRepository } from './email-verification-code.repository.port';
import { type UserRepository } from './user.repository.port';
import { type VerificationCodeGenerator } from './verification-code-generator.port';
import { type VerificationCodeHasher } from './verification-code-hasher.port';
import { type VerificationCodeRequestRepository } from './verification-code-request.repository.port';

const MINUTE_MS = 60_000;

export interface ResendVerificationCommand {
  readonly email: string;
  /** Baglantidan alinir, govdeden DEGIL: kaynak sinirinin sayac anahtaridir. */
  readonly ipAddress: string;
  readonly correlationId: string;
}

/** DEVELOPMENT_RULES 2.5: 3'ten fazla bagimlilik obje olarak alinir. */
export interface ResendVerificationDependencies {
  readonly userRepository: UserRepository;
  readonly verificationCodeRepository: EmailVerificationCodeRepository;
  readonly requestRepository: VerificationCodeRequestRepository;
  readonly verificationCodeGenerator: VerificationCodeGenerator;
  readonly verificationCodeHasher: VerificationCodeHasher;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

interface ResendContext {
  readonly email: Email;
  readonly ipAddress: IpAddress;
  readonly now: Date;
  readonly correlationId: string;
}

/**
 * Dogrulama kodunu yeniden gonderir (AUTH_ARCHITECTURE 7.4, ADR-0019).
 *
 * ============================================================================
 * YANIT HER ZAMAN AYNIDIR — hesap varlik oracle'i olmamali
 * ============================================================================
 * Kullanici yoksa, zaten dogrulanmissa, kilitliyse veya hesap siniri asilmissa:
 * hicbir sey uretilmez ama use case AYNI seyi dondurur (`void`) ve hata
 * FIRLATMAZ (P2). Firlatilan tek hata IP sinirina aittir ve o, hesabin
 * varligindan bagimsizdir.
 *
 * Bekleme (60 sn) ve saatlik hesap siniri da SESSIZDIR: 429 donmek "bu hesap
 * var, sadece cok sik istedin" demek olurdu.
 * ============================================================================
 *
 * ============================================================================
 * ISTEK, SONUCUNDAN ONCE KAYDEDILIR
 * ============================================================================
 * Defter satiri, kullanici aranmadan ONCE yazilir. Sonrasinda yazilsaydi,
 * bilinmeyen e-postalarla yapilan istekler hicbir sayaca dusmez ve IP siniri
 * numaralandirmaya karsi ISLEVSIZ kalirdi.
 *
 * Ayni sebeple `RegisterUserUseCase` de bu deftere yazar: 60 saniyelik bekleme,
 * kayittan hemen sonraki ilk resend'i de kapsamak zorundadir.
 * ============================================================================
 *
 * Yeni kod uretildiginde onceki kod GECERSIZLESIR (`supersede`): ADR-0019
 * "ayni anda gecerli kod: bir tane" der.
 */
export class ResendVerificationUseCase {
  constructor(private readonly deps: ResendVerificationDependencies) {}

  async execute(command: ResendVerificationCommand): Promise<void> {
    const context: ResendContext = {
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
      if (user?.status !== 'pending') {
        // Yok, zaten dogrulanmis veya kapatilmis. Sessizce vazgec (P2).
        return;
      }

      await this.#replaceCode(context, user, rawCode);
    });
  }

  /**
   * Sayimlari okur, istegi deftere yazar ve karari uretir.
   *
   * ============================================================================
   * DEFTER SATIRI KENDI TRANSACTION'INDA — ve bu zorunlu
   * ============================================================================
   * Sinir asildiginda hata firlatilir. Defter yazimi ayni transaction'da olsaydi
   * o hata satiri GERI ALIR: sinir asan istekler hic sayilmaz ve sinir kendi
   * kendini gevsetirdi — saldirgan 20'nin uzerine ciktiktan sonra sonsuza kadar
   * "20'de kalmis" gorunurdu. `LoginUseCase` basarisiz denemeyi ayni sebeple
   * kendi transaction'inda commit eder.
   *
   * Sayimlar, BU istegin satiri yazilmadan ONCE okunur: aksi halde her istek
   * kendini de sayar ve esikler bir eksik davranir.
   * ============================================================================
   */
  async #decide(context: ResendContext): Promise<'allow' | 'skip' | 'rate-limited'> {
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

    const decision = evaluateResend(counts, context.now);

    if (decision.action === 'rate-limited') {
      return 'rate-limited';
    }
    return decision.action === 'allow' ? 'allow' : 'skip';
  }

  /** Onceki kodu gecersizlestirir ve yenisini yayinlar. */
  async #replaceCode(context: ResendContext, user: User, rawCode: string): Promise<void> {
    const previous = await this.deps.verificationCodeRepository.findActiveByUserId(user.id);
    if (previous !== null) {
      previous.supersede(context.now);
      await this.deps.verificationCodeRepository.save(previous);
    }

    await this.deps.verificationCodeRepository.save(this.#issueCode(user.id, rawCode, context.now));

    // Teslimat outbox uzerinden; use case EmailPort'u DOGRUDAN cagirmaz (§7.7).
    // Kayitla AYNI event tipi kullanilir: tuketici acisindan ikisi de "bu
    // adrese su kodu gonder" demektir.
    await this.deps.eventPublisher.publish(
      UserRegistered.create({
        eventId: this.deps.idGenerator.nextId(),
        userId: user.id,
        email: context.email,
        verificationCode: rawCode,
        occurredAt: context.now,
        correlationId: context.correlationId,
      }),
    );
  }

  #issueCode(userId: UserId, rawCode: string, now: Date): EmailVerificationCode {
    return EmailVerificationCode.issue({
      id: EmailVerificationCodeId.create(this.deps.idGenerator.nextId()),
      userId,
      codeHash: this.deps.verificationCodeHasher.hash(rawCode),
      expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MINUTES * MINUTE_MS),
    });
  }
}
