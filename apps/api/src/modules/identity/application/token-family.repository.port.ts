import type { TokenFamily } from '../domain/token-family.entity';
import type { TokenFamilyId } from '../domain/token-family-id.value-object';
import type { TokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import type { UserId } from '../../../shared/user-id.value-object';

/** DI token'i. */
export const TOKEN_FAMILY_REPOSITORY = Symbol('TOKEN_FAMILY_REPOSITORY');

/**
 * `platform.token_families` kaliciligi icin application port'u (ADR-0021).
 *
 * Yeniden kullanim tespitinde use case aileyi `findById` ile yukler,
 * `revoke(...)` uygular ve `save` ile kalici hale getirir. Toplu iptal
 * (logout-all / parola degisimi) ayri bir slice'tir.
 */
export interface TokenFamilyRepository {
  findById(id: TokenFamilyId): Promise<TokenFamily | null>;

  save(family: TokenFamily): Promise<void>;

  /**
   * Kullanicinin TUM aktif ailelerini tek komutta iptal eder; iptal edilen
   * aile sayisini dondurur (ADR-0023 `logout-all`).
   *
   * ============================================================================
   * NEDEN ENTITY UZERINDEN DEGIL
   * ============================================================================
   * Tek tek iptal (yukle -> `revoke()` -> `save()`) cok oturumlu bir kullanicida
   * N okuma + N yazma uretir ve okuma ile yazma arasinda yeni bir ailenin
   * dogmasina acik bir pencere birakir. Cikis, en cok "hesabim ele gecirilmis
   * olabilir" supkesiyle yapilir; o an aciklikta bir pencere birakmak, ozelligin
   * amacini zayiflatir.
   *
   * Tek tek iptal yolu (`findById` + `revoke` + `save`) KORUNUR ve logout ile
   * yeniden kullanim tespitinde kullanilir; domain kurallari orada yasar.
   * ============================================================================
   */
  revokeAllActiveByUserId(
    userId: UserId,
    reason: TokenFamilyRevocationReason,
    revokedAt: Date,
  ): Promise<number>;
}
