import { AsyncLocalStorage } from 'node:async_hooks';

import type { DatabaseClient } from './drizzle.client';

/**
 * Aktif transaction'i cagri agacinin tamamina tasiyan bag.
 *
 * MULTI_TENANT_ARCHITECTURE 11.1: baglanti ve tenant kimligi her metoda
 * parametre olarak tasinsaydi, 40 katman derinlikte bir zincirde BIR YERDE
 * unutulurdu — ve unutuldugu yer sizintidir. `AsyncLocalStorage` bu baglami
 * gorunmez ama guvenilir sekilde tasir.
 *
 * Burada tasinan sey, repository'nin kullanmasi GEREKEN drizzle istemcisidir:
 * havuzdan alinmis, `BEGIN` calistirilmis ve (tenant'li akista) `SET LOCAL`
 * uygulanmis TEK bir baglanti. Repository havuza dogrudan erisemez; erisebilseydi
 * `SET LOCAL`'in kapsami disinda kalan bir sorgu yazmak mumkun olurdu.
 */
export interface TransactionStore {
  /** Aktif transaction'a bagli istemci. Havuz DEGIL. */
  readonly db: DatabaseClient;

  /**
   * Bu transaction'in tenant context'i. Tenant'siz akislarda (resolution,
   * provisioning oncesi) `null`'dir.
   */
  readonly tenantId: string | null;
}

const storage = new AsyncLocalStorage<TransactionStore>();

/** Verilen store altinda isi calistirir. Yalnizca transaction manager cagirir. */
export function runWithTransaction<T>(store: TransactionStore, fn: () => Promise<T>): Promise<T> {
  return storage.run(store, fn);
}

/** Aktif transaction var mi? Ic ice transaction tespiti icin. */
export function hasActiveTransaction(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * Aktif transaction'i dondurur; YOKSA HATA FIRLATIR.
 *
 * Bos sonuc DONMEZ (MULTI_TENANT_ARCHITECTURE 11.4 kural 3): sessiz bos sonuc,
 * hatayi uretimde aylarca gizler. Havuza DUSMEZ (kural 2): `SET LOCAL`'siz bir
 * baglantida calisan sorgu ya RLS'e takilir ya da — politikanin yazimina bagli
 * olarak — filtresiz calisir. Ikincisi tum veritabanini acar.
 */
export function requireTransaction(): TransactionStore {
  const store = storage.getStore();

  if (store === undefined) {
    throw new Error(
      'Aktif transaction yok. Repository cagrilari TransactionManager icinde ' +
        'calismak zorundadir (MULTI_TENANT_ARCHITECTURE 11.4).',
    );
  }

  return store;
}
