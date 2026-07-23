import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Istek boyunca tasinan DOGRULANMIS kimlik.
 *
 * `RequestContext` (correlationId) ile ayni mekanizma — o dosyanin yorumu
 * "Faz 2'de TenantContext (tenantId, userId) BU altyapinin uzerine oturacak"
 * diyordu; burasi o devamdir.
 *
 * ============================================================================
 * NEDEN AYRI BIR ALS, NEDEN `infrastructure/` ALTINDA
 * ============================================================================
 * Bu baglami KURAN taraf Identity'dir (token'i yalnizca o dogrulayabilir), ama
 * OKUYAN taraf Tenant'tir (`CurrentUserProvider`). Ikisi arasinda dogrudan bir
 * modul bagimliligi olusmasin diye tasiyici NOTR bir yerde durur: Identity
 * yazar, herkes okur, kimse digerini import etmez.
 *
 * Degerler yalnizca DOGRULANMIS bir token'dan gelir. Istekten (govde, baslik,
 * query) okunan hicbir kimlik buraya YAZILMAZ — DEVELOPMENT_RULES 4.5.
 * ============================================================================
 */
export interface AuthenticatedPrincipal {
  readonly userId: string;
  /** Token ailesi (oturum) kimligi — `sid` claim'i. */
  readonly sessionId: string;
  /** Yalnizca tenant-scoped access token'da dolu; kimlik token'inda `null`. */
  readonly tenantId: string | null;
}

const storage = new AsyncLocalStorage<AuthenticatedPrincipal>();

/** Verilen kimlik altinda isi calistirir. Yalnizca auth middleware cagirir. */
export function runWithPrincipal<T>(principal: AuthenticatedPrincipal, fn: () => T): T {
  return storage.run(principal, fn);
}

/**
 * Dogrulanmis kimligi dondurur; istek kimliksizse `undefined`.
 *
 * `undefined` donmesi NORMALDIR: kayit/giris gibi uc noktalar kimliksizdir.
 * Kimlik ZORUNLU olan yerlerde karari `CurrentUserProvider` verir ve hata firlatir.
 */
export function getPrincipal(): AuthenticatedPrincipal | undefined {
  return storage.getStore();
}
