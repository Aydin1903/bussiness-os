import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type OAuthStateGenerator } from '../application/oauth-state-generator.port';

/**
 * 32 bayt (256 bit) entropi — `CryptoRefreshTokenGenerator` ile ayni buyukluk.
 *
 * base64url'e cevrilince 43 karakterlik, URL'de guvenle tasinabilen bir dize
 * verir; `state` bir sorgu parametresi olarak saglayiciya gider ve geri doner.
 */
const ENTROPY_BYTES = 32;

/**
 * `OAuthStateGenerator`'in `node:crypto` implementasyonu.
 *
 * ⚠️ `randomBytes` (CSPRNG), `Math.random()` DEGIL — port'un sozlesmesi bunu
 * zorunlu kilar. Ayni ayrim `CryptoRefreshTokenGenerator` ve
 * `CryptoVerificationCodeGenerator` icin de gecerlidir.
 */
@Injectable()
export class CryptoOAuthStateGenerator implements OAuthStateGenerator {
  generate(): string {
    return randomBytes(ENTROPY_BYTES).toString('base64url');
  }
}
