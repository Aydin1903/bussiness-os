import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type VerificationCodeHasher } from '../application/verification-code-hasher.port';
import { VerificationCodeHash } from '../domain/verification-code-hash.value-object';

/**
 * `VerificationCodeHasher`'in HMAC-SHA256 + pepper implementasyonu (ADR-0019).
 *
 * ============================================================================
 * NEDEN PEPPER
 * ============================================================================
 * Pepper, veritabaninda OLMAYAN bir sunucu sirridir (secret manager/env). Sonuc:
 * sizan bir veritabani tek basina yetmez — saldirganin uygulama sirrina da
 * erismesi gerekir (AUTH_ARCHITECTURE 7.2). Bu yuzden pepper adapter'a DISARIDAN
 * verilir ve guvenli bir varsayilani YOKTUR: bos/zayif bir pepper tum mekanizmayi
 * comer, bu yuzden kurulusta reddedilir (fail fast).
 *
 * `verify` string esitligi KULLANMAZ: `crypto.timingSafeEqual` ile sabit zamanli
 * karsilastirir; aksi halde kisa arama uzayinda (10^6) bir zamanlama yan-kanali
 * deneme sinirini zayiflatirdi.
 * ============================================================================
 */

/** Pepper icin makul alt sinir — zayif bir sir korumayi anlamsizlastirir. */
const MIN_PEPPER_LENGTH = 16;

@Injectable()
export class HmacVerificationCodeHasher implements VerificationCodeHasher {
  readonly #pepper: string;

  constructor(pepper: string) {
    if (pepper.length < MIN_PEPPER_LENGTH) {
      throw new Error(
        `Dogrulama kodu pepper'i en az ${String(MIN_PEPPER_LENGTH)} karakter olmalidir.`,
      );
    }
    this.#pepper = pepper;
  }

  hash(code: string): VerificationCodeHash {
    return VerificationCodeHash.fromDigest(this.#digest(code));
  }

  verify(code: string, hash: VerificationCodeHash): boolean {
    const computed = Buffer.from(this.#digest(code), 'hex');
    const stored = Buffer.from(hash.value, 'hex');

    // timingSafeEqual esit uzunluk ister ve farkli uzunlukta HATA FIRLATIR.
    // Ikisi de SHA-256 (32 bayt) oldugu icin normalde esittir; yine de savunma
    // amacli kontrol ederiz.
    if (computed.length !== stored.length) {
      return false;
    }
    return timingSafeEqual(computed, stored);
  }

  #digest(code: string): string {
    return createHmac('sha256', this.#pepper).update(code, 'utf8').digest('hex');
  }
}
