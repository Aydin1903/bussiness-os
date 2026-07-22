import { InvalidTokenFamilyRevocationReasonError } from './identity.error';

/**
 * Bir token ailesinin neden iptal edildigi (AUTH_ARCHITECTURE 12.2, ADR-0021).
 *
 * Neden bir tur (enum), serbest metin degil: bu deger bir DENETIM kaydidir ve
 * "oturum neden dustu" sorusunu yanitlar. Serbest metin, tutarsiz kayitlar ve
 * analiz edilemez bir denetim izi uretirdi.
 *
 * Kaynaklar:
 * - `logout` / `logout-all`       : kullanici cikisi (§12.1).
 * - `token-reuse-detected`        : yeniden kullanim tespiti — ASIL koruma (§11.3).
 * - `password-changed`            : parola degisince tum aileler (§12.2).
 * - `user-deactivated` / `-locked`: hesap durumu degisince tum aileler.
 * - `member-*` / `tenant-*`       : Tenant modulunun guvenlik event'leri (MT §15.3);
 *   bu nedenler ileride o event'leri tuketen handler ile tetiklenir.
 */
export const TOKEN_FAMILY_REVOCATION_REASONS = [
  'logout',
  'logout-all',
  'token-reuse-detected',
  'password-changed',
  'user-deactivated',
  'user-locked',
  'member-removed',
  'member-suspended',
  'tenant-suspended',
  'tenant-archived',
] as const;

export type TokenFamilyRevocationReason = (typeof TOKEN_FAMILY_REVOCATION_REASONS)[number];

/**
 * Dis dunyadan gelen bir metni (veritabani kolonu) iptal nedenine cevirir.
 * `as TokenFamilyRevocationReason` ile zorlamak beklenmeyen bir kolon degerinde
 * hatayi gizlerdi (ARCHITECTURE 4); bu yuzden ayristirma acikca yapilir.
 */
export function parseTokenFamilyRevocationReason(value: string): TokenFamilyRevocationReason {
  const match = TOKEN_FAMILY_REVOCATION_REASONS.find((reason) => reason === value);
  if (match === undefined) {
    throw new InvalidTokenFamilyRevocationReasonError(value);
  }
  return match;
}
