import { type Clock } from '../../../shared/clock.port';
import { type DomainEventPublisher } from '../../../shared/domain-event-publisher.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { isOAuthProviderKey, type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { FederatedIdentityUnlinked } from '../domain/federated-identity-unlinked.event';
import {
  FederatedIdentityNotFoundError,
  LastSignInMethodError,
  OAuthProviderNotConfiguredError,
} from '../domain/identity.error';
import { type CredentialRepository } from './credential.repository.port';
import { type FederatedIdentityRepository } from './federated-identity.repository.port';

/**
 * Kullanicinin giris yontemlerinin DAR goruntusu.
 *
 * ============================================================================
 * ⚠️ E-POSTA DONMEZ
 * ============================================================================
 * `email_at_link` bir TESHIS kolonudur (ADR-0053 §2.1) ve API yuzeyine
 * cikarsa er ya da gec bir yerde kimlik anahtari gibi kullanilir. Bu ucun
 * cevaplamasi gereken soru _"hangi yontemlerle girebiliyorum"_dur, _"hangi
 * adreslerle"_ degil.
 * ============================================================================
 */
export interface FederatedIdentityView {
  readonly provider: OAuthProviderKey;
  readonly linkedAt: string;
  readonly lastLoginAt: string | null;
}

export interface SignInMethodsView {
  /**
   * ⚠️ Bu alan `/me/change-password` ekranini besler.
   *
   * ADR-0052 §6.3'un ucuncu kisiti (_"federe kullanicinin parolasi yoktur ve
   * ekranlar bunu bilmiyor"_) tam olarak burada kapanir: ekran artik form
   * yerine bir aciklama gosterebilir.
   *
   * ⚠️ Burada P2 GECERLI DEGILDIR ve bu bilinclidir — cagiranin kimligi
   * KANITLANMISTIR. Kendi giris yontemlerini bilmek bir sizinti degil bir
   * HAKTIR; sizdirilan bir sey yoksa gizlenecek bir sey de yoktur.
   */
  readonly hasPassword: boolean;
  readonly identities: readonly FederatedIdentityView[];
}

export interface ListSignInMethodsDependencies {
  readonly credentialRepository: CredentialRepository;
  readonly federatedIdentityRepository: FederatedIdentityRepository;
  readonly transactionManager: TransactionManager;
}

/** `GET /api/v1/me/identities` (ADR-0053 §7.2). */
export class ListSignInMethodsUseCase {
  constructor(private readonly deps: ListSignInMethodsDependencies) {}

  async execute(command: { readonly userId: string }): Promise<SignInMethodsView> {
    const userId = UserId.create(command.userId);

    return this.deps.transactionManager.runInTransaction(async () => {
      const [credential, identities] = [
        await this.deps.credentialRepository.findByUserId(userId),
        await this.deps.federatedIdentityRepository.listByUserId(userId),
      ];

      return {
        hasPassword: credential !== null,
        identities: identities.map((identity) => ({
          provider: identity.provider,
          linkedAt: identity.linkedAt.toISOString(),
          lastLoginAt: identity.lastLoginAt?.toISOString() ?? null,
        })),
      };
    });
  }
}

export interface UnlinkFederatedIdentityCommand {
  /** DOGRULANMIS token'dan gelir; govdeden ALINMAZ (DEVELOPMENT_RULES 4.5). */
  readonly userId: string;
  readonly provider: string;
  readonly correlationId: string;
}

export interface UnlinkFederatedIdentityDependencies {
  readonly credentialRepository: CredentialRepository;
  readonly federatedIdentityRepository: FederatedIdentityRepository;
  readonly eventPublisher: DomainEventPublisher;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * `DELETE /api/v1/me/identities/:provider` (ADR-0053 §4.4).
 *
 * ============================================================================
 * ⚠️ SON GIRIS YONTEMI KALDIRILAMAZ
 * ============================================================================
 * Yontem sayisi = (parola var mi ? 1 : 0) + bagli saglayici sayisi. Sayi 1 ise
 * kaldirma **409** ile reddedilir — aksi halde kullanici kendi hesabini
 * kilitler ve geri donusu YOKTUR (parolasi olmadigi icin sifirlama da
 * calismaz — `ResetPasswordUseCase` `credential === null`da sessizce
 * `invalid` doner).
 *
 * ⚠️ KALDIRMA OTURUMLARI DUSURMEZ ve bu bir karardir: parola degistirmede
 * oturumlar duser (ADR-0023) cunku orada SIRRIN KENDISI degisir; burada
 * yalnizca bir giris KAPISI kapanir ve acik oturumlar o kapidan gelmemis
 * olabilir.
 * ============================================================================
 */
export class UnlinkFederatedIdentityUseCase {
  constructor(private readonly deps: UnlinkFederatedIdentityDependencies) {}

  async execute(command: UnlinkFederatedIdentityCommand): Promise<void> {
    if (!isOAuthProviderKey(command.provider)) {
      // ⚠️ Bilinmeyen bir saglayici adi 404'tur, 422 DEGIL: yol parcasi bir
      // KAYNAK adresidir ve olmayan bir kaynak bulunamaz.
      throw new OAuthProviderNotConfiguredError();
    }
    const provider = command.provider;
    const userId = UserId.create(command.userId);

    await this.deps.transactionManager.runInTransaction(async () => {
      await this.#assertNotLastMethod(userId);

      const deleted = await this.deps.federatedIdentityRepository.deleteByUserAndProvider(
        userId,
        provider,
      );

      if (deleted === 0) {
        throw new FederatedIdentityNotFoundError();
      }

      await this.deps.eventPublisher.publish(
        FederatedIdentityUnlinked.create({
          eventId: this.deps.idGenerator.nextId(),
          userId,
          provider,
          occurredAt: this.deps.clock.now(),
          correlationId: command.correlationId,
        }),
      );
    });
  }

  /**
   * ⚠️ KONTROL SILMEDEN ONCE ve AYNI TRANSACTION'DA yapilir.
   *
   * Sonra yapilsaydi satir silinmis olurdu ve "geri koy" diye bir yol yoktur;
   * ayri bir transaction'da yapilsaydi iki es zamanli kaldirma istegi ikisi de
   * "digeri kalir" diye gecer ve kullanici KENDI HESABINDAN KILITLENIRDI.
   */
  async #assertNotLastMethod(userId: UserId): Promise<void> {
    const credential = await this.deps.credentialRepository.findByUserId(userId);
    const identities = await this.deps.federatedIdentityRepository.listByUserId(userId);

    const methodCount = (credential === null ? 0 : 1) + identities.length;

    if (methodCount <= 1) {
      throw new LastSignInMethodError();
    }
  }
}
