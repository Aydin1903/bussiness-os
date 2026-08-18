import { Logger } from '@nestjs/common';

import { type StoragePort } from '../../shared/storage.port';
import { type AppConfig } from '../config/app.config';
import { InMemoryStorageAdapter } from './in-memory-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

/**
 * Nesne deposu saglayici secimini TEK YERDE toplar (ADR-0009, ADR-0037 §5).
 *
 * `createEmbeddingPort` / `createLlmPort` ile birebir ayni desen ve ayni
 * gerekce: saglayici secimi bir ADAPTER kararidir ve is mantigina sizmaz.
 *
 * ============================================================================
 * ⚠️ SAGLAYICI ADI BU FONKSIYONUN DISINA CIKMAZ
 * ============================================================================
 * "R2" ve "MinIO" kelimeleri `documents` modulunun HICBIR dosyasinda gecmez;
 * ikisi de ayni `S3StorageAdapter`i kullanir ve fark yalnizca endpoint +
 * adresleme bicimidir (`STORAGE_FORCE_PATH_STYLE`). ADR-0009'un vaadi tam
 * olarak buydu ve burada ilk kez sinaniyor.
 */
export function createStoragePort(config: AppConfig): StoragePort {
  if (config.storage.provider === 's3') {
    return new S3StorageAdapter({
      endpoint: config.storage.endpoint,
      region: config.storage.region,
      bucket: config.storage.bucket,
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
      forcePathStyle: config.storage.forcePathStyle,
    });
  }

  // Uretimde bu dala HIC girilmez: env semasi `memory`yi orada reddeder ve
  // surec baslamaz. Uyari dev/CI icindir — bellek ici depoyla calistigini
  // unutan gelistirici, "yeniden baslattim, belgelerim indirilmiyor"
  // sorusunun cevabini burada bulur.
  new Logger('StorageFactory').warn(
    'STORAGE_PROVIDER=memory — dosyalar BELLEKTE tutuluyor ve yeniden baslatmada KAYBOLUR. ' +
      'Lokal gelistirmenin dogru yolu: pnpm docker:up (MinIO).',
  );
  return new InMemoryStorageAdapter();
}
