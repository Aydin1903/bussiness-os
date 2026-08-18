import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { StorageFailedError, type StoragePort } from '../../shared/storage.port';

export interface S3StorageOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /**
   * MinIO `true` ISTER, R2 istemez.
   *
   * Sanal-host adresleme (`<bucket>.<host>`) MinIO'nun varsayilan lokal
   * kurulumunda DNS geregi calismaz; path-style (`<host>/<bucket>`) calisir.
   * R2 ikisini de destekler. Ayrim yapilandirmadan gelir, koddan degil —
   * saglayici adi bu dosyada HIC gecmez.
   */
  readonly forcePathStyle: boolean;
}

/**
 * `StoragePort`'un S3-uyumlu implementasyonu (ADR-0009, ADR-0037 §5).
 *
 * ============================================================================
 * TEK ADAPTER, IKI SAGLAYICI — VE BU TAM OLARAK ADR-0009'UN VAADI
 * ============================================================================
 * Production **Cloudflare R2**, lokal ve CI **MinIO**. Ikisi de S3 API'si
 * konusur; fark yalnizca `endpoint` + `forcePathStyle`tir. Yani bu dosyada
 * "R2" ya da "MinIO" kelimesi bir DAL olarak gecmez — gecseydi, ADR-0009'un
 * onlemek icin var oldugu sey olurdu (saglayici seciminin is koduna sizmasi).
 *
 * ⚠️ Saglayici degisimi bir YAPILANDIRMA degisikligidir, bir kod degisikligi
 * degil. Bu, portun sinandigi yerdir.
 *
 * ============================================================================
 * HER HATA `StorageFailedError`E CEVRILIR
 * ============================================================================
 * SDK'nin kendi hata tipleri (`NoSuchKey`, `NetworkingError`, `AccessDenied`,
 * ...) BU SINIFIN DISINA CIKMAZ. Cikarsalardi, `documents` modulunun exception
 * filtresi onlari tanimazdi ve kullanici 502 yerine ISLENMEMIS 500 alirdi —
 * ADR-0035 §8'in genellenmis kuralinin ("bir modul yeni bir port kullanmaya
 * basladiginda o portun hata tipi filtreye eklenmelidir") ancak TEK bir hata
 * tipi varsa isleyebilecegi anlamina gelir.
 *
 * ⚠️ SAGLAYICININ MESAJI HATANIN ICINE GIRER ama KULLANICIYA GITMEZ: filtre
 * kendi elle yazilmis govdesini uretir (§9). Buradaki metin LOG icindir.
 */
export class S3StorageAdapter implements StoragePort {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: S3StorageOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    } catch (error) {
      throw new StorageFailedError(describe(error));
    }
  }

  async get(key: string): Promise<Readable> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      );

      // ⚠️ `Body` TIP OLARAK opsiyoneldir ve uc farkli akis turu olabilir
      // (Node `Readable`, web `ReadableStream`, `Blob`). Node calisma zamaninda
      // DAIMA `Readable` doner; kontrol yine de yapiliyor cunku bir tip
      // ZORLAMASI (`as`) burada DEVELOPMENT_RULES 2.3'u ihlal ederdi ve
      // gercekten `undefined` gelen bir cevap, akisi tuketen yerde OKUNAMAYAN
      // bir hataya donusurdu.
      if (!(result.Body instanceof Readable)) {
        throw new StorageFailedError(`Beklenmeyen govde turu: ${typeof result.Body}`);
      }

      return result.Body;
    } catch (error) {
      // Kendi hatamizi SARMALAMIYORUZ: mesaji ikinci kez onekleyerek
      // okunaksizlastirirdi.
      if (error instanceof StorageFailedError) {
        throw error;
      }
      throw new StorageFailedError(describe(error));
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // ⚠️ S3 semantiginde olmayan bir anahtari silmek ZATEN basarilidir
      // (`DeleteObject` 204 doner). Port bunu acikca vaat ediyor: silme yolu
      // once DB satirini kaldirir, sonra nesneyi — bir onceki denemede nesne
      // silinmis olabilir ve ikinci cagri hata vermemelidir.
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
    } catch (error) {
      throw new StorageFailedError(describe(error));
    }
  }
}

/** SDK hatasini LOG'a girecek tek satirlik bir metne indirger. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
