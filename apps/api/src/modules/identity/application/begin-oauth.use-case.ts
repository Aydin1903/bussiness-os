import { type OAuthProviderRegistry } from '../../../shared/oauth-provider.port';
import { OAuthProviderNotConfiguredError } from '../domain/identity.error';
import { type OAuthStateGenerator } from './oauth-state-generator.port';
import { type TokenSigner } from './token-signer.port';

export interface BeginOAuthCommand {
  /** Ham yol parcasi — KULLANICI GIRDISIDIR, registry onu dogrular. */
  readonly provider: string;
  /** Saglayiciya kayitli callback adresi. Config'ten gelir, istekten DEGIL. */
  readonly redirectUri: string;
  /** Girisin ardindan gidilecek SITE ICI yol; dogrulamasi cagiranindir. */
  readonly next: string | null;
}

export interface BeginOAuthResult {
  /** Kullanicinin yonlendirilecegi saglayici URL'i. */
  readonly authorizationUrl: string;
  /** ⚠️ IMZALI state token'i — `HttpOnly` cereze yazilir, govdede DONMEZ. */
  readonly stateToken: string;
}

export interface BeginOAuthDependencies {
  readonly registry: OAuthProviderRegistry;
  readonly stateGenerator: OAuthStateGenerator;
  readonly tokenSigner: TokenSigner;
}

/**
 * OAuth akisini baslatir (ADR-0053 §4.1, §4.2).
 *
 * ============================================================================
 * ⚠️ UC PARCA DA BURADA URETILIR VE UCU DE CEREZE GIDER
 * ============================================================================
 *   `state`         -> CSRF baglayicisi; callback'te sorgu ile karsilastirilir
 *   `nonce`         -> ID token replay korumasi; adapter onu ID token'da dogrular
 *   `code_verifier` -> PKCE (adapter uretir, biz tasiriz)
 *
 * ⚠️ Ucu de `Math.random()` ILE DEGIL kriptografik rastgelelikle uretilir:
 * tahmin edilebilir bir `state` CSRF korumasini, tahmin edilebilir bir `nonce`
 * replay korumasini, tahmin edilebilir bir `code_verifier` ise PKCE'nin
 * TAMAMINI anlamsiz kilar.
 *
 * ⚠️ IKISI AYRI YERDEN GELIR ve bu bilinclidir: `state`/`nonce` bir PORT'tan
 * (`OAuthStateGenerator`), `code_verifier` ise SAGLAYICI ADAPTER'INDAN. Sebep
 * `code_challenge`in dogrulayiciyla AYNI yerde hesaplanmasi gerekmesidir;
 * ayri yerlerde uretilselerdi bir gun ayrisabilir ve PKCE SESSIZCE bozulurdu.
 *
 * ⚠️ `code_verifier` GOVDEDE DONMEZ. PKCE'nin tum degeri, dogrulayicinin
 * yalnizca istegi baslatan tarayicida bulunmasidir; istemci JS'ine verilseydi
 * bir XSS onu okuyabilirdi ve PKCE hicbir sey korumazdi.
 *
 * ============================================================================
 * ⚠️ BU UC ORAN SINIRLI DEGILDIR — bilinen sinir (ADR-0053)
 * ============================================================================
 * Uc yalnizca bir cerez yazip yonlendirir; pahali adim (token exchange)
 * saglayicidan GECERLI bir `code` gerektirir. Kotuye kullanim gorulurse
 * `platform.rate_limits` hazir bir tirmanistir.
 * ============================================================================
 */
export class BeginOAuthUseCase {
  constructor(private readonly deps: BeginOAuthDependencies) {}

  async execute(command: BeginOAuthCommand): Promise<BeginOAuthResult> {
    const provider = this.deps.registry.find(command.provider);
    if (provider === null) {
      // ⚠️ "Bilinmeyen saglayici" ile "yapilandirilmamis saglayici" AYNI
      // sonuca duser: yapilandirmanin durumu bir dis gozlemciye sizmaz.
      throw new OAuthProviderNotConfiguredError();
    }

    const state = this.deps.stateGenerator.generate();
    const nonce = this.deps.stateGenerator.generate();

    const authorization = provider.buildAuthorization({
      state,
      nonce,
      redirectUri: command.redirectUri,
    });

    const stateToken = await this.deps.tokenSigner.signOAuthState({
      provider: provider.key,
      state,
      nonce,
      codeVerifier: authorization.codeVerifier,
      next: command.next,
    });

    return { authorizationUrl: authorization.authorizationUrl, stateToken };
  }
}
