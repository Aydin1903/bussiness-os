import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, type CryptoKey, type JWTPayload } from 'jose';

import { type Clock } from '../../../shared/clock.port';
import {
  type AccessTokenInput,
  type IdentityTokenInput,
  type TokenSigner,
  type TokenType,
  type VerifiedToken,
} from '../application/token-signer.port';
import { InvalidTokenError } from '../domain/identity.error';

/** Token omurleri (ADR-0020, AUTH_ARCHITECTURE 10.4). */
const IDENTITY_TOKEN_TTL_SECONDS = 5 * 60; // 5 dk — tek isi tenant sectirmek
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 dk — calinan token'in kullanim penceresi

/**
 * Imzalama yapilandirmasi. Anahtarlar secret manager'dan gelir ve ASLA repoda
 * bulunmaz (ADR-0020); `kid` rotasyonu icin dogrulayici birden fazla acik
 * anahtari ayni anda kabul eder. Uretim wiring'i bunu env/config'ten kurar.
 */
export interface EddsaTokenSignerConfig {
  readonly issuer: string;
  readonly audience: string;
  /** Aktif imzalama anahtarinin kid'i (JWT basliginda tasinir). */
  readonly signingKid: string;
  /** Ed25519 OZEL anahtari — yalnizca Identity tutar. */
  readonly signingKey: CryptoKey;
  /** kid -> acik anahtar. Rotasyon sirasinda eski + yeni birlikte bulunur. */
  readonly verificationKeys: ReadonlyMap<string, CryptoKey>;
}

/**
 * `TokenSigner`'in EdDSA (Ed25519) implementasyonu (ADR-0020).
 *
 * ASIMETRIK imza: yalnizca Identity ozel anahtari tutar, diger servisler acik
 * anahtarla YALNIZCA dogrular. HS256 secilseydi dogrulayan her servis token
 * URETEBILIRDI; mikroservise gecis (ARCHITECTURE 11) o gun pahali bir migrasyon
 * olurdu. Kutuphane: `jose` (EdDSA + `kid` destekli).
 *
 * ZAMAN DISARIDAN GELIR: `iat`/`exp` ve dogrulamada "simdi" enjekte edilen
 * `Clock`'tan okunur — boylece testler deterministiktir.
 */
@Injectable()
export class EddsaTokenSigner implements TokenSigner {
  readonly #config: EddsaTokenSignerConfig;
  readonly #clock: Clock;

  constructor(config: EddsaTokenSignerConfig, clock: Clock) {
    this.#config = config;
    this.#clock = clock;
  }

  signIdentityToken(input: IdentityTokenInput): Promise<string> {
    return this.#sign(
      { typ: 'identity', sid: input.sessionId },
      input.userId,
      IDENTITY_TOKEN_TTL_SECONDS,
    );
  }

  signAccessToken(input: AccessTokenInput): Promise<string> {
    return this.#sign(
      { typ: 'access', sid: input.sessionId, tenant: input.tenantId },
      input.userId,
      ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  async verify(token: string): Promise<VerifiedToken> {
    const payload = await this.#verifiedPayload(token);

    if (!isTokenType(payload.typ)) {
      throw new InvalidTokenError('bilinmeyen token turu');
    }
    const type = payload.typ;

    return {
      type,
      userId: requireStringClaim(payload.sub, 'sub'),
      sessionId: requireStringClaim(payload.sid, 'sid'),
      tenantId: type === 'access' ? requireStringClaim(payload.tenant, 'tenant') : null,
      jti: requireStringClaim(payload.jti, 'jti'),
    };
  }

  /** Imzayi/sureyi/iss/aud/kid'i dogrular ve payload'i doner; aksi halde firlatir. */
  async #verifiedPayload(token: string): Promise<JWTPayload> {
    try {
      const result = await jwtVerify(
        token,
        (header) => {
          const key =
            header.kid === undefined ? undefined : this.#config.verificationKeys.get(header.kid);
          if (key === undefined) {
            throw new InvalidTokenError('bilinmeyen imza anahtari (kid)');
          }
          return key;
        },
        {
          issuer: this.#config.issuer,
          audience: this.#config.audience,
          algorithms: ['EdDSA'], // alg karistirma saldirisina karsi kisitla
          currentDate: this.#clock.now(),
        },
      );
      return result.payload;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError(error instanceof Error ? error.message : 'dogrulanamadi');
    }
  }

  #sign(claims: Record<string, unknown>, userId: string, ttlSeconds: number): Promise<string> {
    const nowSeconds = Math.floor(this.#clock.now().getTime() / 1000);

    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: this.#config.signingKid })
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds)
      .sign(this.#config.signingKey);
  }
}

function isTokenType(value: unknown): value is TokenType {
  return value === 'identity' || value === 'access';
}

function requireStringClaim(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidTokenError(`${name} claim'i eksik veya gecersiz`);
  }
  return value;
}
