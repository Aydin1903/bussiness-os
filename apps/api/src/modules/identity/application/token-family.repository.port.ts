import type { TokenFamily } from '../domain/token-family.entity';
import type { TokenFamilyId } from '../domain/token-family-id.value-object';

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
}
