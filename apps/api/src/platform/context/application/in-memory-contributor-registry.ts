import { Injectable } from '@nestjs/common';

import {
  type RetrievalContributor,
  type RetrievalContributorRegistry,
} from './retrieval-contributor.port';

/**
 * Katkici defterinin bellek ici implementasyonu.
 *
 * `InMemoryPermissionRegistry` ile ayni desen: kayit deploy ile gelir, runtime
 * uretilmez. Kalicilik GEREKMEZ — katkicilar koddur, veri degil.
 */
@Injectable()
export class InMemoryContributorRegistry implements RetrievalContributorRegistry {
  readonly #bySource = new Map<string, RetrievalContributor>();

  register(contributor: RetrievalContributor): void {
    const existing = this.#bySource.get(contributor.source);

    if (existing !== undefined) {
      // Sessizce yutulmaz: `source` etiketi hem kaynak atfinin hem
      // `degradedSources`'in anahtaridir. Iki modul ayni etiketi kullanirsa
      // ikisi de yalan soyler ve hangi modulun katkisi oldugu ayirt edilemez.
      throw new Error(
        `Katkici etiketi zaten kayitli: "${contributor.source}". ` +
          'Iki modul ayni kokeni sahiplenemez.',
      );
    }

    this.#bySource.set(contributor.source, contributor);
  }

  all(): readonly RetrievalContributor[] {
    return [...this.#bySource.values()];
  }
}
