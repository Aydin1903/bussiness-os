import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE (RFC 7636) ve OAuth rastgele deger uretimi — saglayicidan BAGIMSIZ.
 *
 * ⚠️ Bu dosya `infrastructure/oauth/` altindadir, `shared/` altinda DEGIL:
 * PKCE bir protokol ayrintisidir, bir platform yetenegi degil. `shared/`'a
 * konsaydi kernel'e is mantigiyla ilgisi olmayan bir OAuth kavrami girerdi
 * (CLAUDE.md'nin `shared/` ile `infrastructure/` ayrimi).
 *
 * ⚠️ ADAPTER'LAR ARASINDA PAYLASILIR ve bu bilinclidir: dort saglayicinin
 * dordu de ayni RFC'yi uygular. Kopyalanmasi, birinde `S256` yerine `plain`
 * kalmasi gibi SESSIZ bir zayiflama uretirdi.
 */

/**
 * 32 bayt entropi (256 bit).
 *
 * ⚠️ `Math.random()` DEGIL: tahmin edilebilir bir `state` CSRF korumasini,
 * tahmin edilebilir bir `nonce` replay korumasini, tahmin edilebilir bir
 * `code_verifier` ise PKCE'nin TAMAMINI anlamsiz kilar.
 */
const ENTROPY_BYTES = 32;

/** RFC 7636 §4.1: `code_verifier` 43–128 karakter, unreserved alfabe. */
export function generateCodeVerifier(): string {
  return randomBytes(ENTROPY_BYTES).toString('base64url');
}

/**
 * RFC 7636 §4.2: `S256` challenge.
 *
 * ⚠️ `plain` YONTEMI DESTEKLENMEZ ve desteklenmemelidir: `plain`de challenge
 * ile verifier ayni dizedir, yani yetkilendirme istegini gorebilen biri
 * verifier'i da gorur — PKCE hicbir sey korumaz.
 */
export function toCodeChallengeS256(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

/** CSRF baglayicisi (`state`) ve ID token replay korumasi (`nonce`) icin. */
export function generateOpaqueValue(): string {
  return randomBytes(ENTROPY_BYTES).toString('base64url');
}
