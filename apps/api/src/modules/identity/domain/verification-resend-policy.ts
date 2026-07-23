/**
 * Dogrulama kodu yeniden gonderme sinirlari — SAF karar mantigi
 * (AUTH_ARCHITECTURE 7.4, ADR-0019).
 *
 * ============================================================================
 * UC SINIR, IKI FARKLI YANIT — ve bu ayrim GUVENLIK GEREGIDIR
 * ============================================================================
 * | Sinir            | Anahtar   | Esik      | Karar          | Yanit         |
 * |------------------|-----------|-----------|----------------|---------------|
 * | Ardisik gonderim | e-posta   | 60 sn     | `skip-silently`| 202 (sessiz)  |
 * | Saatlik hesap    | e-posta   | 5 / saat  | `skip-silently`| 202 (sessiz)  |
 * | Saatlik kaynak   | IP        | 20 / saat | `rate-limited` | 429           |
 *
 * Hesap bazli iki sinir SESSIZDIR: 429 donmek "bu hesap var" demektir. Var
 * olmayan bir e-posta hicbir zaman hesap sinirina takilmaz — dolayisiyla 429,
 * hesabin VARLIGINI dogrulayan bir oracle olurdu. P2 (§P2) resend yanitinin
 * hesap var olsa da olmasa da AYNI olmasini sart kosar; bu yuzden sinir
 * asildiginda kod URETILMEZ, e-posta GITMEZ, ama yanit degismez.
 *
 * IP siniri hesaptan BAGIMSIZDIR: hangi e-posta yazilirsa yazilsin ayni sonucu
 * verir, dolayisiyla 429 hicbir sey sizdirmaz (§16 ile tutarli).
 * ============================================================================
 *
 * ============================================================================
 * BU DOSYA I/O YAPMAZ
 * ============================================================================
 * Sayimlari ve son gonderim zamanini sorgulamak use case'in isidir; burada
 * yalnizca KARAR verilir. `brute-force-policy.ts` ile ayni desen.
 * ============================================================================
 */

/** Ardisik iki gonderim arasindaki en az sure (§7.4). */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Hesap basina saatlik ust sinir — deneme sinirini "yeni kod al" ile sifirlamayi engeller. */
export const RESEND_MAX_PER_ACCOUNT_HOURLY = 5;

/** IP basina saatlik ust sinir — toplu kayit/e-posta bombardimani. */
export const RESEND_MAX_PER_IP_HOURLY = 20;

/** Saatlik sinirlarin penceresi. Sayac sorgusunu kuran taraf kullanir. */
export const RESEND_WINDOW_MINUTES = 60;

export interface ResendCounts {
  /** Bu e-posta icin en son ne zaman kod istendi; hic istenmediyse `null`. */
  readonly lastRequestedAt: Date | null;
  /** Bu e-posta icin son 60 dakikadaki istek sayisi (BU istek haric). */
  readonly accountRequestsInWindow: number;
  /** Bu IP icin son 60 dakikadaki istek sayisi (BU istek haric). */
  readonly ipRequestsInWindow: number;
}

/**
 * Karar.
 *
 * `skip-silently` bir HATA DEGILDIR: cagiran taraf hicbir sey uretmez ama
 * basarili yaniti dondurur. `reason` yalnizca SUNUCU loglari icindir; istemciye
 * gitmesi P2'yi ihlal ederdi.
 */
export type ResendDecision =
  | { readonly action: 'allow' }
  | { readonly action: 'skip-silently'; readonly reason: 'cooldown' | 'account-hourly-limit' }
  | { readonly action: 'rate-limited' };

/**
 * Sinirlari degerlendirir. Oncelik: once KAYNAK (IP), sonra hesap.
 *
 * IP once bakilir cunku o, hesabin var olup olmamasindan bagimsizdir ve isteme
 * hakkinin kendisini keser; hesap sinirlari ise ancak istek islenmeye
 * baslandiginda anlamlidir.
 */
export function evaluateResend(counts: ResendCounts, now: Date): ResendDecision {
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

/** Tam 60 saniye GECERLIDIR: sinir "60 saniyeden az" ise bekleme suresi 60 sn'dir. */
function isWithinCooldown(lastRequestedAt: Date | null, now: Date): boolean {
  if (lastRequestedAt === null) {
    return false;
  }

  const elapsedMs = now.getTime() - lastRequestedAt.getTime();
  return elapsedMs < RESEND_COOLDOWN_SECONDS * 1000;
}
