import { Readable } from 'node:stream';

import { StorageFailedError, type StoragePort } from '../../shared/storage.port';

/**
 * Bellek ici nesne deposu — YALNIZCA dev/CI icin (`STORAGE_PROVIDER=memory`).
 *
 * ============================================================================
 * ⚠️ URETIMDE BU DALA HIC GIRILMEZ
 * ============================================================================
 * `env.schema.ts` `NODE_ENV=production` altinda `memory`yi REDDEDER ve surec
 * BASLAMAZ. Gerekce `EMAIL_PROVIDER=console` yasagiyla ayni sinifta: burada
 * "calisiyor gibi gorunen ama veriyi kaybeden" bir yapilandirmayla uretime
 * cikmak, kullanicinin yukledigi her sozlesmenin ilk yeniden baslatmada YOK
 * OLMASI demektir — ve hata SESSIZDIR: yukleme 201 doner, liste dolu gorunur,
 * yalnizca indirme calismaz.
 *
 * `FakeEmbeddingAdapter` ile ayni desen ve ayni gerekce.
 *
 * ⚠️ Bu adapter'in VAR OLMA SEBEBI, MinIO'nun yerini almak DEGILDIR. Lokal
 * gelistirmenin dogru yolu `docker compose up -d`dir (ADR-0037 §5.5). Bu
 * adapter, Docker'in olmadigi ortamlarda (bazi CI adimlari, hizli bir birim
 * denemesi) portun sozlesmesini AYNEN saglar — ozellikle "olmayan anahtari
 * silmek hata degildir" ve "olmayan anahtari okumak StorageFailedError'dur"
 * kurallarini.
 */
export class InMemoryStorageAdapter implements StoragePort {
  readonly #objects = new Map<string, { body: Buffer; contentType: string }>();

  put(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    // Kopyalanarak saklanir: cagiran buffer'i sonradan degistirirse saklanan
    // nesne DEGISMEMELIDIR (gercek bir depo da byte'lari o an alir).
    this.#objects.set(input.key, {
      body: Buffer.from(input.body),
      contentType: input.contentType,
    });
    return Promise.resolve();
  }

  get(key: string): Promise<Readable> {
    const object = this.#objects.get(key);

    if (object === undefined) {
      // Port `null` DONDURMEZ: bu durum "bulunamadi" degil, iki dogruluk
      // kaynagi arasindaki TUTARSIZLIKTIR (DB satiri var, nesne yok).
      return Promise.reject(new StorageFailedError(`Nesne bulunamadi: ${key}`));
    }

    return Promise.resolve(Readable.from(object.body));
  }

  delete(key: string): Promise<void> {
    // ⚠️ Donus degeri KONTROL EDILMEZ: olmayan bir anahtari silmek BASARILIDIR
    // (port sozlesmesi). Aksi halde yarim kalmis bir temizlik, kendi izinden
    // dolayi surekli hata verirdi.
    this.#objects.delete(key);
    return Promise.resolve();
  }
}
