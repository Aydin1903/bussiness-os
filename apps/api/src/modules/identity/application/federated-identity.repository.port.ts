import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { type FederatedIdentity } from '../domain/federated-identity.entity';
import { type ProviderSubject } from '../domain/provider-subject.value-object';

/** DI token'i. */
export const FEDERATED_IDENTITY_REPOSITORY = Symbol('FEDERATED_IDENTITY_REPOSITORY');

/**
 * `platform.federated_identities` kaliciligi icin application port'u
 * (ADR-0053 §2).
 *
 * ============================================================================
 * ⚠️ E-POSTAYLA ARAMA METODU YOKTUR VE EKLENMEMELIDIR
 * ============================================================================
 * `findByEmail(...)` gibi bir metot, ADR-0053 §1'in tamamini SESSIZCE cozerdi:
 * kimligin capasi `(provider, subject)` ciftidir ve e-posta yalnizca BIR KEZ,
 * `UserRepository.findByEmail` uzerinden ve bir HUKUM altinda (§6) kullanilir.
 * Bu port'a bir e-posta arama yolu eklemek, nOAuth'u geri getirmenin en kolay
 * yoludur.
 *
 * ⚠️ GLOBAL LISTELEME METODU DA YOKTUR — `users` tablosuyla ayni disiplin
 * (MT §12.4.3): listeleme yalnizca `userId` bazlidir. Bu tablo RLS'siz oldugu
 * icin, kapsamsiz bir liste metodu TUM tenant'larin kullanicilarinin sosyal
 * hesaplarini tek sorguda acardi.
 * ============================================================================
 */
export interface FederatedIdentityRepository {
  /**
   * ⚠️ GIRIS KARARININ TEK SORGUSU (D1). Kimlik burada baslar ve biter.
   */
  findByProviderSubject(
    provider: OAuthProviderKey,
    subject: ProviderSubject,
  ): Promise<FederatedIdentity | null>;

  /** `GET /me/identities` icin. Kullanicinin baglantilari, `linkedAt` artan. */
  listByUserId(userId: UserId): Promise<readonly FederatedIdentity[]>;

  /**
   * Baglantiyi yazar.
   *
   * ⚠️ `onConflictDoUpdate` KULLANMAZ ve bu bir karardir: bir catisma
   * ("bu saglayici hesabi zaten bagli") sessizce uzerine yazilacak bir durum
   * DEGIL, bir YARIS DURUMUDUR (§`FederatedIdentityConflictError`). Uzerine
   * yazmak, bir kullanicinin baglantisini digerine devretmek olabilirdi.
   */
  insert(identity: FederatedIdentity): Promise<void>;

  /**
   * Yalnizca `last_login_at` kolonunu gunceller.
   *
   * ⚠️ Metodun adi genel (`save`) DEGIL, DAR olmasi bilinclidir: veritabani da
   * yalnizca bu kolonda `UPDATE` yetkisi verir (`0040`). Genel bir `save`,
   * kodun veritabaninin izin vermedigi bir seyi denemesine ve calisma aninda
   * `permission denied` almasina yol acardi — hata SESSIZ olmazdi ama YANLIS
   * YERDE gorunurdu.
   */
  recordLogin(identity: FederatedIdentity): Promise<void>;

  /** Baglantiyi kaldirir; silinen satir sayisini doner (0 = yoktu). */
  deleteByUserAndProvider(userId: UserId, provider: OAuthProviderKey): Promise<number>;
}
