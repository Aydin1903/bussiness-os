import {
  RESEND_MAX_PER_ACCOUNT_HOURLY,
  RESEND_MAX_PER_IP_HOURLY,
  type ResendCounts,
  type ResendDecision,
} from './verification-resend-policy';

/**
 * Parola sifirlama kodu ISTEGI sinirlari — SAF karar (AUTH §7.6, ADR-0024).
 *
 * ============================================================================
 * DOGRULAMA RESEND'IYLE AYNI DESEN, DAHA UZUN BEKLEME
 * ============================================================================
 * Sayim kaynagi AYNI defterdir (`verification_code_requests`): "bu adrese ne
 * siklikta kod e-postasi" sorusu her iki akis icin ortaktir ve paylasmak, bir
 * saldirganin dogrulama/sifirlama arasinda gecis yapip hizi ikiye katlamasini
 * ONLER. Yalnizca bekleme suresi farklidir: sifirlama 120 sn (dogrulama 60 sn),
 * cunku sifirlama e-postasi daha yuksek degerli bir hedeftir (ADR-0024).
 *
 * Saatlik hesap/IP sinirlari resend ile AYNI sabitleri kullanir; defter ortak
 * oldugu icin IP siniri zaten paylasilir.
 *
 * Karar tipleri de resend ile AYNIDIR: hesap bazli sinirlar SESSIZ (P2), yalnizca
 * IP siniri 429. Var olmayan bir e-posta hesap sinirina takilmaz; 429 donmek
 * hesabin varligini dogrulardi.
 * ============================================================================
 */

/** Ardisik iki sifirlama istegi arasindaki en az sure (§7.6) — resend'in iki kati. */
export const PASSWORD_RESET_COOLDOWN_SECONDS = 120;

/**
 * Sifirlama istegini degerlendirir. `evaluateResend` ile ayni oncelik (once IP,
 * sonra bekleme, sonra hesap saatlik) — tek fark bekleme suresidir.
 */
export function evaluatePasswordResetRequest(counts: ResendCounts, now: Date): ResendDecision {
  if (counts.ipRequestsInWindow >= RESEND_MAX_PER_IP_HOURLY) {
    return { action: 'rate-limited' };
  }

  if (isWithinCooldown(counts.lastRequestedAt, now)) {
    return { action: 'skip-silently', reason: 'cooldown' };
  }

  if (counts.accountRequestsInWindow >= RESEND_MAX_PER_ACCOUNT_HOURLY) {
    return { action: 'skip-silently', reason: 'account-hourly-limit' };
  }

  return { action: 'allow' };
}

/** Tam 120 saniye GECERLIDIR: sinir "120 saniyeden az" ise bekleme 120 sn'dir. */
function isWithinCooldown(lastRequestedAt: Date | null, now: Date): boolean {
  if (lastRequestedAt === null) {
    return false;
  }

  return now.getTime() - lastRequestedAt.getTime() < PASSWORD_RESET_COOLDOWN_SECONDS * 1000;
}
