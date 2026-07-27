/**
 * Oturum durumunun tek kaynağı — MEMORY'de bir modül singleton'ı.
 *
 * ============================================================================
 * NEDEN MODÜL STORE, NEDEN localStorage DEĞİL
 * ============================================================================
 * FRONTEND_ARCHITECTURE §2: identity/access token'lar YALNIZCA memory'de tutulur;
 * refresh token ise JS'in erişemediği `HttpOnly` cookie'dedir. Diske (localStorage/
 * sessionStorage) yazılan bir token, herhangi bir script tarafından okunabilir —
 * bu modelin bütün savunması buna izin vermemektir.
 *
 * Store React DIŞINDADIR (düz modül): fetch katmanı (`api/refresh.ts`) token'ları
 * bir React render'ı beklemeden okuyup yazabilmelidir. React tarafı bu store'u
 * `useSyncExternalStore` ile gözlemler (`session-provider.tsx`).
 *
 * Sayfa yenilenince store sıfırlanır (memory) — bu KASITLIDIR. Oturum, refresh
 * cookie'sinden sessizce yeniden türetilir (§5.2).
 * ============================================================================
 */

/** Tenant kimliği — backend'de UUIDv7; istemcide opak bir string olarak taşınır. */
export type TenantId = string;

export interface SessionState {
  /** Tenant seçimi için kısa ömürlü kimlik token'ı (ADR-0020, 5 dk). */
  readonly identityToken: string | undefined;
  /** Tenant-scoped erişim token'ı (ADR-0020, 15 dk). `switch-tenant`'tan gelir. */
  readonly accessToken: string | undefined;
  /**
   * Seçili tenant. 401 sonrası iki adımlı yenilemede (§5.2) access token'ı
   * yeniden türetmek için hatırlanması ZORUNLUDUR.
   */
  readonly currentTenantId: TenantId | undefined;
}

const EMPTY: SessionState = {
  identityToken: undefined,
  accessToken: undefined,
  currentTenantId: undefined,
};

let state: SessionState = EMPTY;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** `useSyncExternalStore` aboneliği. Değişimde React yeniden render eder. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Anlık durum. `useSyncExternalStore` bunu REFERANS eşitliğiyle karşılaştırır;
 * bu yüzden her `set` YENİ bir nesne üretir ve mutasyon yapılmaz.
 */
export function getSnapshot(): SessionState {
  return state;
}

/** Sunucu render'ında token yoktur (memory istemciye özgü). */
export function getServerSnapshot(): SessionState {
  return EMPTY;
}

/** Alanları kısmen günceller; verilmeyenler korunur. */
export function setSession(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  emit();
}

/** Tüm oturumu temizler (logout / kurtarılamaz 401). */
export function clearSession(): void {
  state = EMPTY;
  emit();
}

/** Fetch katmanının senkron okuması için kısa yollar. */
export function getAccessToken(): string | undefined {
  return state.accessToken;
}

export function getIdentityToken(): string | undefined {
  return state.identityToken;
}

export function getCurrentTenantId(): TenantId | undefined {
  return state.currentTenantId;
}
