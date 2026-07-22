import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { type VerificationCodeGenerator } from '../application/verification-code-generator.port';

/** Kod araligi: `000000`-`999999` (ADR-0019). */
const CODE_UPPER_BOUND_EXCLUSIVE = 1_000_000;
const CODE_LENGTH = 6;

/**
 * `VerificationCodeGenerator`'in kriptografik implementasyonu (ADR-0019, §7.1).
 *
 * `crypto.randomInt` kullanir: reddetme ornekleme ile DUZGUN dagilimlidir ve
 * `Math.random()`'in ongorulebilirligini tasimaz. `Math.random()` KULLANILSAYDI
 * kod tahmin edilebilir olur ve tum mekanizma anlamsizlasirdi.
 *
 * Bastaki sifirlar `padStart` ile korunur: `42` -> `000042`. Kod bir STRING'tir;
 * sayiya cevirmek sifirlari yok ederdi.
 */
@Injectable()
export class CryptoVerificationCodeGenerator implements VerificationCodeGenerator {
  generate(): string {
    return String(randomInt(CODE_UPPER_BOUND_EXCLUSIVE)).padStart(CODE_LENGTH, '0');
  }
}
