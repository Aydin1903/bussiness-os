import { type OAuthProviderRegistry } from '../../../shared/oauth-provider.port';
import { OAuthProviderNotConfiguredError } from '../domain/identity.error';
import { type OAuthStateGenerator } from './oauth-state-generator.port';
import { type TokenSigner } from './token-signer.port';

export interface BeginOneTapCommand {
  /** Ham yol parcasi — KULLANICI GIRDISIDIR, registry onu dogrular. */
  readonly provider: string;
}

export interface BeginOneTapResult {
  /** ⚠️ GIS'i yapilandirmak icin istemciye GEREKLIDIR — sir degil, baglayici. */
  readonly nonce: string;
  /** ⚠️ TEK KAYNAK sunucudur; `NEXT_PUBLIC_*` reddedildi (EK-1.1). */
  readonly clientId: string;
  /** ⚠️ IMZALI one-tap token'i — `HttpOnly` cereze yazilir, govdede DONMEZ. */
  readonly stateToken: string;
}

export interface BeginOneTapDependencies {
  readonly registry: OAuthProviderRegistry;
  readonly stateGenerator: OAuthStateGenerator;
  readonly tokenSigner: TokenSigner;
  /** Saglayici anahtari -> istemci kimligi. Yalnizca yapilandirilmis olanlar. */
  readonly clientIds: Readonly<Record<string, string>>;
}

/**
 * One Tap akisini baslatir (ADR-0053 EK-1.1).
 *
 * ============================================================================
 * ⚠️ `nonce` SUNUCUDA URETILIR — ISTEMCI URETSEYDI HICBIR SEY KANITLAMAZDI
 * ============================================================================
 * GIS'e verilen `nonce`, uretilen ID token'in icine bir claim olarak girer ve
 * replay korumasinin TAMAMIDIR. Istemci uretseydi saldirgan kendi urettigi
 * `nonce`la kendi token'ini olusturur ve sunucuya sunardi — dogrulama
 * ⚠️ KENDI KENDINI ONAYLAYAN bir dongu olurdu.
 *
 * Deger IKI YERE birden gider:
 *   1. yanit govdesine — istemci GIS'i onunla yapilandirir;
 *   2. imzali `HttpOnly` cereze — sunucunun "bu `nonce`u BU TARAYICI icin BEN
 *      urettim" diyebilmesinin TEK yolu.
 *
 * ⚠️ Govdede donmesi bir sizinti DEGILDIR: `nonce` bir SIR degil bir
 * BAGLAYICIDIR. Gucu gizli olmasindan degil, sunucunun onu kendisinin
 * urettigini BILMESINDEN gelir.
 *
 * ============================================================================
 * ⚠️ `clientId` DE SUNUCUDAN DONER
 * ============================================================================
 * Alternatif `NEXT_PUBLIC_GOOGLE_CLIENT_ID` idi ve REDDEDILDI: ayni degeri iki
 * yerde tutmak (Railway + Vercel) AYRISABILIR ve ayristigi gun hata SESSIZ
 * olur — GIS yanlis `aud` ile token uretir, sunucu reddeder, kullanici sebebi
 * anlasilmayan bir hata gorur. Ayrica `NEXT_PUBLIC_*` DERLEME ZAMANINDA gomulur.
 *
 * ⚠️ Bu uc ORAN SINIRLI DEGILDIR ve bu bilinclidir: yalnizca 32 bayt uretip
 * bir cerez yazar. Pahali ve durum degistiren adim `POST /one-tap`tir ve sinir
 * ORAYA konur (EK-1.4).
 * ============================================================================
 */
export class BeginOneTapUseCase {
  constructor(private readonly deps: BeginOneTapDependencies) {}

  async execute(command: BeginOneTapCommand): Promise<BeginOneTapResult> {
    // ⚠️ YETENEK kontrolu: One Tap Google'a ozgudur. Yetenegi olmayan bir
    // saglayici icin uc GERCEKTEN yoktur (§3.3'un ikinci sekli).
    const verifier = this.deps.registry.findIdTokenVerifier(command.provider);
    const clientId = this.deps.clientIds[command.provider];

    if (verifier === null || clientId === undefined) {
      throw new OAuthProviderNotConfiguredError();
    }

    const nonce = this.deps.stateGenerator.generate();
    const stateToken = await this.deps.tokenSigner.signOAuthOneTap({
      provider: verifier.key,
      nonce,
    });

    return { nonce, clientId, stateToken };
  }
}
