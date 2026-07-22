import { Injectable } from '@nestjs/common';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

import { type PasswordHasher } from '../application/password-hasher.port';
import { PasswordHash } from '../domain/password-hash.value-object';
import { ADR_0017_ARGON2_PARAMETERS, type Argon2Parameters } from './argon2-parameters';

/**
 * `PasswordHasher` port'unun Argon2id implementasyonu (ADR-0017).
 *
 * Kutuphane: `@node-rs/argon2` (Rust NAPI). Windows dev + Linux CI + Node 24
 * icin hazir ikili tasir; node-gyp derlemesi gerektirmez.
 *
 * ============================================================================
 * NEDEN `algorithm` GECILMEZ
 * ============================================================================
 * `Algorithm` bir `declare const enum`'dur; `isolatedModules` altinda import
 * edip kullanmak bir typecheck hatasidir. Neyse ki `@node-rs/argon2`'nin
 * VARSAYILAN algoritmasi zaten Argon2id'dir (RFC 9106 onerisi), bu yuzden secenek
 * hic gecilmez.
 *
 * Sessiz sapmaya karsi guvenlik agi: uretilen string `PasswordHash.fromHash`'ten
 * gecer ve o VO `^$argon2id$` on ekini SART kosar. Kutuphane bir gun varsayilanini
 * degistirse, hash uretimi burada gurultuyle basarisiz olur — yanlis algoritmayla
 * sessizce devam etmez.
 * ============================================================================
 */
@Injectable()
export class Argon2idPasswordHasher implements PasswordHasher {
  readonly #params: Argon2Parameters;

  /**
   * Parametreler enjekte edilebilir: uretim ADR-0017 tabanini kullanir; testler
   * hiz icin daha ucuz parametre verebilir. Varsayilan ADR-0017'dir.
   */
  constructor(params: Argon2Parameters = ADR_0017_ARGON2_PARAMETERS) {
    this.#params = params;
  }

  async hash(plainPassword: string): Promise<PasswordHash> {
    const encoded = await argon2Hash(normalize(plainPassword), {
      memoryCost: this.#params.memoryCost,
      timeCost: this.#params.timeCost,
      parallelism: this.#params.parallelism,
      outputLen: this.#params.hashLength,
    });

    return PasswordHash.fromHash(encoded);
  }

  verify(plainPassword: string, hash: PasswordHash): Promise<boolean> {
    // Ham parola ile hash AYNI normalizasyondan gecer (§6.1) — aksi halde
    // kayittaki parola girise uymaz. Esitlik string ile degil, kutuphanenin
    // sabit zamanli karsilastirmasiyla yapilir.
    return argon2Verify(hash.value, normalize(plainPassword));
  }

  /**
   * Hash'in parametreleri GUNCEL parametrelerle ayni mi? Saf PHC ayrıstirmasi
   * — argon2'yi cagirmaz.
   *
   * PHC bicimi parametreleri kendi icinde tasir: `$argon2id$v=19$m=<M>,t=<T>,p=<P>$...`.
   * Bicim uymuyorsa (farkli algoritma/surum) yenileme GEREKIR: fail closed.
   */
  needsRehash(hash: PasswordHash): boolean {
    const match = PHC_PARAMS.exec(hash.value);
    if (match === null) {
      return true;
    }

    const [, memory, time, parallelism] = match;
    return (
      Number(memory) !== this.#params.memoryCost ||
      Number(time) !== this.#params.timeCost ||
      Number(parallelism) !== this.#params.parallelism
    );
  }
}

/** `$argon2id$v=<n>$m=<M>,t=<T>,p=<P>$...` icinden m/t/p yakalar. */
const PHC_PARAMS = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * NFKC normalizasyonu (AUTH_ARCHITECTURE 6.1): ayni parola farkli Unicode
 * normalizasyonlariyla yazildiginda giris basarisiz olmamali. Hash ve verify'da
 * AYNI fonksiyon cagrilir; idempotenttir (NFKC(NFKC(x)) === NFKC(x)).
 */
function normalize(plainPassword: string): string {
  return plainPassword.normalize('NFKC');
}
