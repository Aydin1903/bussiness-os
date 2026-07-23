import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Istek boyunca tasinan DOGRULANMIS tenant context'i
 * (MULTI_TENANT_ARCHITECTURE 11.2/11.3).
 *
 * ============================================================================
 * NEDEN AYRI BIR ALS, NEDEN `infrastructure/` ALTINDA
 * ============================================================================
 * `auth-context.ts` ile birebir ayni gerekce: context'i KURAN taraf
 * `platform/session` (membership dogrulamasindan gecen tek yer), OKUYAN taraf
 * ise transaction manager ve — ileride — her modulun use case'leri. Tasiyici
 * NOTR bir yerde durur; kimse digerini import etmez.
 *
 * MULTI_TENANT_ARCHITECTURE 11.1: baglanti ve tenant kimligi her metoda
 * parametre olarak tasinsaydi, derin bir zincirde BIR YERDE unutulurdu — ve
 * unutuldugu yer sizintidir.
 * ============================================================================
 *
 * ============================================================================
 * CONTEXT SALT-OKUNURDUR (§11.2)
 * ============================================================================
 * Bir kez kurulur, istek boyunca DEGISMEZ. "Bu use case icin tenant'i degistir"
 * ihtiyaci doguyorsa tasarim yanlistir; o is ayri bir context ile calistirilir.
 * Bu yuzden burada yalnizca `runWithTenantContext` (kurma) ve `getTenantContext`
 * (okuma) vardir — bir `set` fonksiyonu YOKTUR ve eklenmemelidir.
 * ============================================================================
 */
export interface TenantContext {
  /** DOGRULANMIS JWT claim'inden. RLS anahtari. */
  readonly tenantId: string;
  /** Eylemi yapan kullanici. */
  readonly userId: string;
  /**
   * Kullanicinin BU tenant'taki rolu — membership'ten cozulur, TOKEN'DAN DEGIL.
   *
   * Token rol tasimaz (AUTH §10.3, P3): token bir IDDIA tasir, YETKI degil. Rol
   * her istekte kaynaktan dogrulanir; token'a gomulseydi uyelik degistiginde
   * BAYAT kalirdi (§14.1 T4: "bayat izin = guvenlik acigi").
   */
  readonly role: string;
  /** Istek/is izleme kimligi. */
  readonly correlationId: string;
  /** Denetim ve hata ayiklama: context'i hangi giris noktasi kurdu. */
  readonly source: TenantContextSource;
}

export type TenantContextSource = 'http' | 'job' | 'outbox';

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Verilen tenant context'i altinda isi calistirir.
 *
 * Yalnizca context'i KURMAYA yetkili giris noktalari cagirir: HTTP tarafinda
 * `TenantContextMiddleware` (membership + tenant.status dogrulamasindan
 * gecmis olan), ileride arka plan isleri ve outbox tuketicisi.
 */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Aktif tenant context'ini dondurur; yoksa `undefined`.
 *
 * `undefined` donmesi NORMALDIR: kimlik akislari (kayit, giris, switch-tenant)
 * tanimi geregi tenant'siz calisir. "Bu is tenant ister mi" karari cagirana
 * aittir — tenant verisine dokunan yol `runInCurrentTenantTransaction` uzerinden
 * gecer ve orasi FAIL CLOSED davranir.
 */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
