import {
  type OAuthIdentity,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { OAuthProviderNotConfiguredError, OAuthStateInvalidError } from '../domain/identity.error';
import {
  type ResolveFederatedIdentity,
  type ResolveFederatedIdentityResult,
} from './resolve-federated-identity';
import { type TokenSigner } from './token-signer.port';

export interface CompleteOAuthCommand {
  readonly provider: string;
  /** Saglayicidan donen yetkilendirme kodu. */
  readonly code: string;
  /** Sorgudaki `state` — cerezdeki ile karsilastirilir (CSRF). */
  readonly state: string;
  /** Imzali state cerezinin degeri. Yoksa `null`. */
  readonly stateToken: string | null;
  readonly redirectUri: string;
  readonly correlationId: string;
}

/**
 * ⚠️ Sonuc tipi artik `ResolveFederatedIdentity`nindir (EK-1.3) ve buradan
 * yalnizca YENIDEN EXPORT edilir — mevcut cagiranlar (controller, testler)
 * degismesin diye. Iki ad ayni tipe isaret eder; ikinci bir tanim YOKTUR.
 */
export type CompleteOAuthResult = ResolveFederatedIdentityResult;

export interface CompleteOAuthDependencies {
  readonly registry: OAuthProviderRegistry;
  /** ⚠️ D1/D2/D3'un TEK sahibi — One Tap yoluyla PAYLASILIR (EK-1.3). */
  readonly resolver: ResolveFederatedIdentity;
  readonly tokenSigner: TokenSigner;
  readonly transactionManager: TransactionManager;
}

/**
 * OAuth callback'ini isler — ⚠️ **ADR-0053'UN KALBI**.
 *
 * ============================================================================
 * ⚠️ UC DAL, TEK KURAL: "AYNI E-POSTA" ASLA KENDI BASINA "AYNI INSAN" DEGILDIR
 * ============================================================================
 *   D1  `(provider, sub)` zaten bagli
 *       -> giris. ⚠️ E-POSTAYA HIC BAKILMAZ, degismis olsa bile. Baglanti bir
 *          kez kurulur; e-posta ondan sonra bir daha ASLA kimlik anahtari olmaz.
 *
 *   D2  bagli degil + adapter hukmu `emailVerified === true`
 *       -> eslesen `User` varsa BAGLANIR, yoksa yeni `User` acilir (`active`).
 *
 *   D3  bagli degil + hukum `false`
 *       -> ⚠️ KENDI 6 haneli kodumuz gonderilir. Kod dogrulanana kadar
 *          HICBIR BAGLAMA VE HICBIR GIRIS OLMAZ.
 *
 * ⚠️ D3 BIR GEVSETME DEGIL BIR GUCLENDIRMEDIR: bu sistemin guvenlik tavani
 * zaten "gelen kutusuna sahip olmak = hesaba sahip olmak"tir (ADR-0024 parola
 * sifirlamayi tam olarak buna dayandirir). D3, ucuncu bir tarafin
 * DOGRULANMAMIS iddiasini alip BIZIM birinci elden dogrulamamiza cevirir —
 * zayif bir kaniti mevcut tavanin TAM OLARAK SEVIYESINE cikarir, ustune degil.
 *
 * ⚠️ D3'te saldirgan KAYBEDER: nOAuth senaryosunda kod KURBANIN gelen
 * kutusuna gider.
 *
 * ============================================================================
 * ⚠️ D3 HESAP VARLIGINI SIZDIRMAZ
 * ============================================================================
 * Hesap var da olsa yok da olsa cagirana donen sonuc AYNIDIR
 * (`verification-required`) ve gonderilen e-posta metni de AYNIDIR. Baglama mi
 * yoksa yeni hesap acma mi oldugu KOD DOGRULANDIKTAN SONRA, sunucuda
 * belirlenir (`VerifyOAuthEmailUseCase`).
 *
 * ⚠️ Bu yuzden bu use case D3'te kullaniciyi ACAR ama BAGLAMAZ: acmak
 * `POST /auth/register`in zaten yaptigi seydir (ayni maruziyet), baglamak ise
 * kanitlanmamis bir iddiaya dayanmak olurdu.
 * ============================================================================
 */
export class CompleteOAuthUseCase {
  constructor(private readonly deps: CompleteOAuthDependencies) {}

  async execute(command: CompleteOAuthCommand): Promise<CompleteOAuthResult> {
    const state = await this.#verifyState(command);
    const provider = this.deps.registry.find(command.provider);

    if (provider === null) {
      throw new OAuthProviderNotConfiguredError();
    }

    // ⚠️ AG CAGRISI TRANSACTION'IN DISINDA: token exchange + JWKS saniyeler
    // surebilir; veritabani baglantisini o sure boyunca tutmak, es zamanli
    // girislerde havuzu dogrudan istek sayisiyla carpardi (`LoginUseCase`in
    // Argon2'yi transaction disinda calistirmasiyla ayni gerekce).
    const identity = await provider.exchange({
      code: command.code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
      redirectUri: command.redirectUri,
    });

    return this.deps.transactionManager.runInTransaction(() =>
      this.#resolve(identity, command.correlationId, state.next),
    );
  }

  /**
   * State cerezini dogrular ve sorgudaki `state` ile karsilastirir.
   *
   * ⚠️ DORT RET SEBEBI DE AYNI HATAYA DUSER (cerez yok / imza gecersiz / suresi
   * dolmus / eslesmiyor): hangisinin gerceklestigini soylemek, CSRF denemesi
   * yapan birine hangi parcasinin tuttugunu ogretirdi.
   *
   * ⚠️ `state.provider` ile YOL PARCASI da karsilastirilir: aksi halde bir
   * saglayici icin alinan state, baskasinin callback'inde kullanilabilirdi.
   */
  async #verifyState(command: CompleteOAuthCommand): Promise<{
    readonly nonce: string;
    readonly codeVerifier: string;
    readonly next: string | null;
  }> {
    if (command.stateToken === null) {
      throw new OAuthStateInvalidError();
    }

    let verified;
    try {
      verified = await this.deps.tokenSigner.verifyOAuthState(command.stateToken);
    } catch {
      throw new OAuthStateInvalidError();
    }

    if (verified.state !== command.state || verified.provider !== command.provider) {
      throw new OAuthStateInvalidError();
    }

    return { nonce: verified.nonce, codeVerifier: verified.codeVerifier, next: verified.next };
  }

  /**
   * ⚠️ D1/D2/D3 KARARI BURADA DEGIL, `ResolveFederatedIdentity`TEDIR
   * (ADR-0053 EK-1.3).
   *
   * Bu use case'in isi girdiyi ELDE ETMEKTIR (state dogrulama + token
   * exchange); karar One Tap yoluyla PAYLASILIR. Kopya cikarilsaydi nOAuth
   * savunmasi iki yolda ayrisabilirdi ve hata sessiz olurdu.
   */
  async #resolve(
    identity: OAuthIdentity,
    correlationId: string,
    next: string | null,
  ): Promise<CompleteOAuthResult> {
    return this.deps.resolver.resolve(identity, correlationId, next);
  }
}
