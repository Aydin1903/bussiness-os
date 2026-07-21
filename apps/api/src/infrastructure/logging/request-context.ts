import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Istek boyunca tasinan baglamsal bilgi.
 *
 * Faz 2'de TenantContext (tenantId, userId) BU altyapinin uzerine oturacak
 * (ARCHITECTURE 3.2). Faz 1'de yalnizca korelasyon kimligi tasinir; amac,
 * tenant context'i geldiginde tasiyici mekanizmanin hazir ve test edilmis olmasi.
 */
export interface RequestContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Verilen baglam altinda bir fonksiyonu calistirir.
 *
 * Baglam, cagri zincirindeki tum asenkron islere otomatik akar; parametre olarak
 * elden ele tasinmasi gerekmez.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Mevcut istek baglamini dondurur.
 *
 * HTTP disi calisma yollarinda (cron, queue handler) baglam kurulmamis olabilir;
 * bu yuzden `undefined` donebilir ve cagiran taraf bunu ele almak zorundadir.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
