import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { type Email } from './email.value-object';
import { type FederatedIdentityId } from './federated-identity-id.value-object';
import { InvalidFederatedIdentityTimestampError } from './identity.error';
import { type ProviderSubject } from './provider-subject.value-object';

/**
 * Bir kullanicinin bir saglayicidaki hesabina baglantisi (ADR-0053 §2).
 *
 * ============================================================================
 * ⚠️ BU ENTITY'DE E-POSTA BIR KIMLIK ALANI DEGILDIR
 * ============================================================================
 * `emailAtLink` bir TESHIS alanidir ve adi bunu soyler: baglama ANININ
 * fotografidir. Kimlik `(provider, subject)` ciftidir ve o cift bu nesnenin
 * omru boyunca DEGISMEZ — degistirecek bir metot YOKTUR ve eklenmemelidir.
 *
 * Bir metot eklenirse ADR-0053 §1'in tamami cozulur: `sub`u degistirebilen bir
 * yol, nOAuth'u geri getirir. Veritabani da ayni seyi soyler — `0040`
 * `provider_subject` uzerindeki `UPDATE` yetkisini acikca KALDIRIR.
 *
 * ============================================================================
 * TEK MUTASYON: `recordLogin()`
 * ============================================================================
 * Entity'nin degistirebildigi tek sey `lastLoginAt`tir ve veritabani yetkisi
 * de tam olarak buna izin verir (`GRANT UPDATE (last_login_at)`). Domain ile
 * veritabani AYNI seyi soyler; ikisi ayrisirsa biri sessizce yanlis olurdu.
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR: entity `new Date()` veya id uretmez
 * (DEVELOPMENT_RULES 3.2).
 * ============================================================================
 */

export interface LinkFederatedIdentityInput {
  readonly id: FederatedIdentityId;
  readonly userId: UserId;
  readonly provider: OAuthProviderKey;
  readonly subject: ProviderSubject;
  /** ⚠️ Yalnizca teshis. `null` mesrudur: saglayici e-posta vermemis olabilir. */
  readonly emailAtLink: Email | null;
  readonly linkedAt: Date;
}

export interface FederatedIdentityState extends LinkFederatedIdentityInput {
  readonly lastLoginAt: Date | null;
}

export class FederatedIdentity {
  readonly id: FederatedIdentityId;
  readonly userId: UserId;
  readonly provider: OAuthProviderKey;
  readonly subject: ProviderSubject;

  readonly #emailAtLink: Email | null;
  readonly #linkedAt: Date;
  #lastLoginAt: Date | null;

  /** Constructor PRIVATE: gecersiz nesne yaratmak dilsel olarak imkansizdir. */
  private constructor(state: FederatedIdentityState) {
    this.id = state.id;
    this.userId = state.userId;
    this.provider = state.provider;
    this.subject = state.subject;
    this.#emailAtLink = state.emailAtLink;
    this.#linkedAt = copyDate(state.linkedAt);
    this.#lastLoginAt = state.lastLoginAt === null ? null : copyDate(state.lastLoginAt);
  }

  /**
   * Yeni bir baglanti kurar — baglanti yaratmanin TEK yolu.
   *
   * `lastLoginAt` daima `null` baslar: baglama ile giris AYNI ISTEKTE olsa bile
   * iki AYRI olaydir ve ikincisi `recordLogin()` ile yazilir.
   */
  static link(input: LinkFederatedIdentityInput): FederatedIdentity {
    assertValidTimestamp(input.linkedAt, 'linkedAt');

    return new FederatedIdentity({ ...input, lastLoginAt: null });
  }

  /** Kalici kayittan (veritabani satiri) entity'yi yeniden kurar. */
  static fromPersistence(state: FederatedIdentityState): FederatedIdentity {
    assertValidTimestamp(state.linkedAt, 'linkedAt');
    if (state.lastLoginAt !== null) {
      assertValidTimestamp(state.lastLoginAt, 'lastLoginAt');
    }

    return new FederatedIdentity(state);
  }

  /** ⚠️ Teshis alani. Kimlik kararlarinda KULLANILMAZ (sinif yorumu). */
  get emailAtLink(): Email | null {
    return this.#emailAtLink;
  }

  get linkedAt(): Date {
    return copyDate(this.#linkedAt);
  }

  get lastLoginAt(): Date | null {
    return this.#lastLoginAt === null ? null : copyDate(this.#lastLoginAt);
  }

  /** Bu baglanti ile bir giris yapildi. Entity'nin TEK mutasyonu. */
  recordLogin(at: Date): void {
    assertValidTimestamp(at, 'lastLoginAt');
    this.#lastLoginAt = copyDate(at);
  }
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` doner. Sinirda yakalanmazsa veritabanina
 * `null` olarak dusen bir zaman degeri olusur.
 */
function assertValidTimestamp(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidFederatedIdentityTimestampError(field);
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
