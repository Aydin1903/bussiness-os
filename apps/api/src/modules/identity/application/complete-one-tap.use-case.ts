import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type OAuthProviderRegistry } from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { IpAddress } from '../domain/ip-address.value-object';
import { OAuthProviderNotConfiguredError, OAuthStateInvalidError } from '../domain/identity.error';
import { assertOneTapAllowed, ONE_TAP_WINDOW_MINUTES } from '../domain/one-tap-rate-limit.policy';
import { type OneTapAttemptRepository } from './one-tap-attempt.repository.port';
import {
  type ResolveFederatedIdentity,
  type ResolveFederatedIdentityResult,
} from './resolve-federated-identity';
import { type TokenSigner } from './token-signer.port';

const MINUTE_MS = 60_000;

export interface CompleteOneTapCommand {
  readonly provider: string;
  /** GIS'in urettigi ID token (`credential`). */
  readonly credential: string;
  /** Imzali one-tap cerezinin degeri. Yoksa `null`. */
  readonly stateToken: string | null;
  /** Baglantidan alinir: oran sinirinin TEK anahtari (EK-1.4). */
  readonly ipAddress: string;
  readonly correlationId: string;
}

export type CompleteOneTapResult = ResolveFederatedIdentityResult;

export interface CompleteOneTapDependencies {
  readonly registry: OAuthProviderRegistry;
  /** ⚠️ D1/D2/D3'un TEK sahibi — redirect akisiyla PAYLASILIR (EK-1.3). */
  readonly resolver: ResolveFederatedIdentity;
  readonly oneTapAttemptRepository: OneTapAttemptRepository;
  readonly tokenSigner: TokenSigner;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * One Tap `credential`ini isler (ADR-0053 EK-1).
 *
 * ============================================================================
 * ⚠️ BU, IKINCI BIR KIMLIK DOGRULAMA GIRISIDIR
 * ============================================================================
 * `CompleteOAuthUseCase` bir `code` alir ve client secret ile token degisimi
 * yapar; burada degisim YOKTUR — gelen sey zaten Google imzali bir ID token'dir
 * ve secret HIC KULLANILMAZ.
 *
 * ⚠️ Bu yuzden bariyer DAHA ALCAKTIR: saldirgan bizim `aud`umuzla gecerli bir
 * token'i HERHANGI BIR Google hesabiyla uretebilir. Uc, D2/D3 dallarinda
 * kullanici olusturabildigi icin ORAN SINIRI ZORUNLUDUR (EK-1.4) — `/start`ta
 * gerekmemesinin sebebi tam olarak bu farktir.
 *
 * ============================================================================
 * ⚠️ D1/D2/D3 KOPYALANMAZ (EK-1.3)
 * ============================================================================
 * Karar `ResolveFederatedIdentity`tedir ve redirect akisiyla PAYLASILIR.
 * Kopya cikarilsaydi hata SESSIZ olurdu: nOAuth savunmasi (dogrulanmamis
 * e-postanin D3'e dusmesi) bir yolda degisip digerinde degismezse, kimse fark
 * etmeden BIR GIRIS YOLU KORUMASIZ kalirdi.
 *
 * ⚠️ D3 BURADA DA GECERLIDIR: Google `email_verified: false` donerse akis yine
 * kendi 6 haneli kodumuza duser. Kullanici bir GIS kutusuna tikladi diye hukum
 * GEVSEMEZ — hukum adapter'in, dal resolver'in isidir.
 * ============================================================================
 */
export class CompleteOneTapUseCase {
  constructor(private readonly deps: CompleteOneTapDependencies) {}

  async execute(command: CompleteOneTapCommand): Promise<CompleteOneTapResult> {
    const verifier = this.deps.registry.findIdTokenVerifier(command.provider);
    if (verifier === null) {
      throw new OAuthProviderNotConfiguredError();
    }

    const ipAddress = IpAddress.create(command.ipAddress);
    const nonce = await this.#consumeNonce(command);

    // ⚠️ ORAN SINIRI PAHALI ADIMDAN ONCE: JWKS dogrulamasi ve olasi kullanici
    // olusturma bundan SONRA gelir. Sonra kontrol edilseydi sinir, korumasi
    // gereken maliyeti zaten odedikten sonra devreye girerdi.
    await this.#assertWithinRateLimit(ipAddress);

    // ⚠️ AG CAGRISI TRANSACTION'IN DISINDA (JWKS saniyeler surebilir) —
    // `CompleteOAuthUseCase`in `exchange`i icin verilen ayni karar.
    const identity = await verifier.verifyIdToken({ idToken: command.credential, nonce });

    return this.deps.transactionManager.runInTransaction(() =>
      this.deps.resolver.resolve(identity, command.correlationId, null),
    );
  }

  /**
   * Cerezi dogrular ve `nonce`u cikarir.
   *
   * ⚠️ UC RET SEBEBI DE AYNI HATAYA DUSER (cerez yok / imza gecersiz / suresi
   * dolmus): hangisinin gerceklestigini soylemek, deneyen birine hangi
   * parcasinin tuttugunu ogretirdi — `#verifyState` ile ayni disiplin.
   *
   * ⚠️ CEREZ TEK KULLANIMLIKTIR ve silme isi CAGIRANDADIR (controller), cunku
   * silme bir HTTP yanit islemidir; use case HTTP bilmez. Controller onu
   * SONUCTAN BAGIMSIZ siler — `callback`in `clearOAuthStateCookie`i kosulsuz
   * cagirmasiyla birebir ayni desen.
   */
  async #consumeNonce(command: CompleteOneTapCommand): Promise<string> {
    if (command.stateToken === null) {
      throw new OAuthStateInvalidError();
    }

    let verified;
    try {
      verified = await this.deps.tokenSigner.verifyOAuthOneTap(command.stateToken);
    } catch {
      throw new OAuthStateInvalidError();
    }

    // ⚠️ Bir saglayici icin alinan `nonce`, baskasinin ucunda kullanilamaz.
    if (verified.provider !== command.provider) {
      throw new OAuthStateInvalidError();
    }

    return verified.nonce;
  }

  /**
   * ⚠️ SAYAC ONCE OKUNUR, SONRA DENEME YAZILIR — ve ikisi TEK transaction'da.
   *
   * Ayri transaction'larda olsalardi es zamanli istekler ayni pencereyi okuyup
   * hepsi gecerdi (klasik yaris). Deneme, dogrulama sonucundan BAGIMSIZ olarak
   * yazilir: sinir "basarisiz deneme" degil "deneme" sayar — aksi halde
   * saldirgan gecerli token'larla sinirsiz istek atabilirdi.
   */
  async #assertWithinRateLimit(ipAddress: IpAddress): Promise<void> {
    const now = this.deps.clock.now();
    const since = new Date(now.getTime() - ONE_TAP_WINDOW_MINUTES * MINUTE_MS);

    await this.deps.transactionManager.runInTransaction(async () => {
      const attempts = await this.deps.oneTapAttemptRepository.countByIpSince(ipAddress, since);

      assertOneTapAllowed(attempts);

      await this.deps.oneTapAttemptRepository.record({
        id: this.deps.idGenerator.nextId(),
        ipAddress,
        attemptedAt: now,
      });
    });
  }
}
