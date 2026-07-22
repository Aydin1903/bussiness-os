import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type RefreshTokenGenerator } from '../application/refresh-token-generator.port';

/** 256 bit = 32 bayt (ADR-0021). */
const TOKEN_BYTES = 32;

/**
 * `RefreshTokenGenerator`'in kriptografik implementasyonu (ADR-0021).
 *
 * `crypto.randomBytes` ile 256 bit uretir; `base64url` URL-guvenlidir (cerez/
 * baslik/govde icinde sorunsuz tasinir). `Math.random()` KULLANILMAZ.
 */
@Injectable()
export class CryptoRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
