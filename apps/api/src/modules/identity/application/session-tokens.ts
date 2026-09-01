import { type IdGenerator } from '../../../shared/id-generator.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { REFRESH_TOKEN_TTL_DAYS, RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenId } from '../domain/refresh-token-id.value-object';
import { TokenFamily } from '../domain/token-family.entity';
import { TokenFamilyId } from '../domain/token-family-id.value-object';
import { type RefreshTokenGenerator } from './refresh-token-generator.port';
import { type RefreshTokenHasher } from './refresh-token-hasher.port';
import { type RefreshTokenRepository } from './refresh-token.repository.port';
import { type TokenFamilyRepository } from './token-family.repository.port';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bir oturumun token cifti — parola girisinde de sosyal giriste de AYNI.
 *
 * ============================================================================
 * ⚠️ NEDEN AYRI BIR DOSYA — VE NE KADARI PAYLASILIYOR
 * ============================================================================
 * ADR-0053 sosyal girisi eklerken `FederatedSessionIssuer`, `LoginUseCase`in
 * oturum acma adimlarini KOPYALADI ve bu, o iste bilincli bir borc olarak
 * yazildi: birlestirmek `LoginUseCase`e dokunmayi gerektiriyordu (Mutlak
 * Kural 2) ve parola girisi projenin en cok test edilmis yolu.
 *
 * ⚠️ Borcun tehlikesi de yazilmisti ve gecerliydi: iki kopya AYRISIRSA hata
 * SESSIZ olur — ornegin refresh omru birinde degisip digerinde degismezse,
 * kullanicinin oturumu NASIL GIRDIGINE gore farkli surer ve kimse fark etmez.
 * Bu dosya o borcu, Product Owner talimatiyla kapatir.
 *
 * ============================================================================
 * ⚠️ PAYLASILAN SEY DAR TUTULDU — VE BU BIR KARARDIR
 * ============================================================================
 * Burada YALNIZCA iki cagiranin BIREBIR AYNI yaptigi sey yasar:
 *
 *   1. token ciftini KURMAK  (`issueSessionTokens`)
 *   2. token ciftini YAZMAK  (`persistSessionTokens`)
 *
 * ⚠️ Su UCU BILEREK DISARIDA BIRAKILDI, cunku iki akista FARKLIDIR:
 *
 *   - **Transaction sahipligi.** `LoginUseCase` transaction'i KENDI acar
 *     (icine kademeli yeniden hash'leme ve basarili deneme kaydi da girer);
 *     sosyal giriste transaction'i CAGIRAN acar (baglama/kullanici acma
 *     adimlariyla ayni transaction'da olmasi gerekir).
 *   - **`UserLoggedIn` yayini.** Ikisi de yayinlar ama `LoginUseCase` onu
 *     kendi transaction blogunun ICINDE, deneme kaydiyla birlikte yapar.
 *   - ⚠️⚠️ **TOKEN IMZALAMA ANI.** `LoginUseCase` kimlik token'ini transaction
 *     COMMIT OLDUKTAN SONRA imzalar — _"var olmayan bir oturuma isaret eden
 *     token dagitilmaz"_. Bu siralamayi buraya tasimak, `LoginUseCase`in
 *     DAVRANISINI DEGISTIRIRDI ve bu isin acik kosulu tam olarak onu
 *     degistirmemekti.
 *
 * Yani bu dosya bir "oturum acma servisi" DEGILDIR; iki akisin ortak
 * ARITMETIGIDIR. Daha fazlasini icine almak, farkli olan seyleri ayni
 * gostermek olurdu.
 * ============================================================================
 */
export interface SessionTokens {
  readonly family: TokenFamily;
  readonly refreshToken: RefreshToken;
  /**
   * Ham 256-bit refresh token.
   *
   * ⚠️ Veritabaninda yalnizca SHA-256'si durur; bu deger YALNIZCA cereze
   * yazilmak uzere cagirana doner ve hicbir log'a girmez (P1).
   */
  readonly rawRefreshToken: string;
}

export interface SessionTokenFactoryDependencies {
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly refreshTokenHasher: RefreshTokenHasher;
  readonly idGenerator: IdGenerator;
}

export interface SessionTokenRepositories {
  readonly tokenFamilyRepository: TokenFamilyRepository;
  readonly refreshTokenRepository: RefreshTokenRepository;
}

/**
 * Yeni bir token ailesi ve onun ilk refresh token'ini KURAR — I/O YOK.
 *
 * ⚠️ Omur TEK BIR YERDEN okunur (`REFRESH_TOKEN_TTL_DAYS`, ADR-0021). Ayrismasi
 * mumkun olan sey artik mantik degil, yalnizca o sabittir — ve o zaten
 * `refresh-token.entity`nin mulkudur.
 */
export function issueSessionTokens(
  deps: SessionTokenFactoryDependencies,
  input: { readonly userId: UserId; readonly now: Date },
): SessionTokens {
  const family = TokenFamily.start({
    id: TokenFamilyId.create(deps.idGenerator.nextId()),
    userId: input.userId,
    createdAt: input.now,
  });

  const rawRefreshToken = deps.refreshTokenGenerator.generate();

  const refreshToken = RefreshToken.issue({
    id: RefreshTokenId.create(deps.idGenerator.nextId()),
    familyId: family.id,
    tokenHash: deps.refreshTokenHasher.hash(rawRefreshToken),
    expiresAt: new Date(input.now.getTime() + REFRESH_TOKEN_TTL_DAYS * DAY_MS),
  });

  return { family, refreshToken, rawRefreshToken };
}

/**
 * Token ciftini yazar.
 *
 * ⚠️ KENDI TRANSACTION'INI ACMAZ — cagiran zaten bir transaction icindedir ve
 * bu bilinclidir: iki akisin da bu yazmayi BASKA seylerle birlikte atomik
 * yapmasi gerekir (parolada deneme kaydi, sosyal giriste baglama).
 *
 * ⚠️ Sira ONEMLIDIR: aile ONCE yazilir, cunku refresh token ona FK verir.
 */
export async function persistSessionTokens(
  repositories: SessionTokenRepositories,
  tokens: SessionTokens,
): Promise<void> {
  await repositories.tokenFamilyRepository.save(tokens.family);
  await repositories.refreshTokenRepository.save(tokens.refreshToken);
}
