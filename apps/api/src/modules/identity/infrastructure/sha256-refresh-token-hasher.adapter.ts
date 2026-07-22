import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type RefreshTokenHasher } from '../application/refresh-token-hasher.port';
import { RefreshTokenHash } from '../domain/refresh-token-hash.value-object';

/**
 * `RefreshTokenHasher`'in SHA-256 implementasyonu (ADR-0021).
 *
 * Deterministik (salt yok): lookup hash uzerinden yapilir, bu yuzden ayni token
 * daima ayni digest'i uretmelidir. 256 bit rastgele bir girdi icin SHA-256'nin
 * tersine cevrilmesi pratikte imkansizdir; Argon2 burada gereksiz maliyet olurdu.
 */
@Injectable()
export class Sha256RefreshTokenHasher implements RefreshTokenHasher {
  hash(token: string): RefreshTokenHash {
    return RefreshTokenHash.fromDigest(createHash('sha256').update(token, 'utf8').digest('hex'));
  }
}
