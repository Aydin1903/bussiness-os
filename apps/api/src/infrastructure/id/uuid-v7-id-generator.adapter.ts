import { Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import type { IdGenerator } from '../../shared/id-generator.port';

/**
 * `IdGenerator` port'unun uretim implementasyonu.
 *
 * DEVELOPMENT_RULES 6: birincil anahtar UUIDv7'dir. Zaman-sirali oldugu icin
 * B-tree index'inde ardisik sayfalara duser; UUIDv4 ise rastgeledir ve her
 * ekleme farkli bir sayfayi kirletir. Fark, tablo buyudukce yazma
 * performansinda gorunur hale gelir.
 *
 * Uretim burada, bir ADAPTER'da yapilir — domain yalnizca DOGRULAR
 * (`uuid-v7.ts`). Boylece Math.random()/Date.now() domain'e girmez.
 */
@Injectable()
export class UuidV7IdGenerator implements IdGenerator {
  nextId(): string {
    return uuidv7();
  }
}
