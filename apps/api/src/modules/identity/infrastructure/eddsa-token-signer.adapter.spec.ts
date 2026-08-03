import { generateKeyPair, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { InvalidTokenError } from '../domain/identity.error';
import { EddsaTokenSigner, type EddsaTokenSignerConfig } from './eddsa-token-signer.adapter';

const ISSUER = 'https://api.businessos.com';
const AUDIENCE = 'businessos-api';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const T0 = new Date('2026-07-22T10:00:00.000Z');

/** Ayarlanabilir saat — imza ile dogrulama arasinda zamani ilerletmek icin. */
class MutableClock implements Clock {
  #value: Date;
  constructor(initial: Date) {
    this.#value = initial;
  }
  now(): Date {
    return new Date(this.#value.getTime());
  }
  set(value: Date): void {
    this.#value = value;
  }
}

describe('EddsaTokenSigner', () => {
  let clock: MutableClock;
  let signer: EddsaTokenSigner;
  let foreignSigner: EddsaTokenSigner;

  beforeAll(async () => {
    const main = await generateKeyPair('EdDSA', { extractable: true });
    const foreign = await generateKeyPair('EdDSA', { extractable: true });

    const baseConfig = (
      kid: string,
      signingKey: CryptoKey,
      verify: ReadonlyMap<string, CryptoKey>,
    ): EddsaTokenSignerConfig => ({
      issuer: ISSUER,
      audience: AUDIENCE,
      signingKid: kid,
      signingKey,
      verificationKeys: verify,
    });

    clock = new MutableClock(T0);
    signer = new EddsaTokenSigner(
      baseConfig('k1', main.privateKey, new Map([['k1', main.publicKey]])),
      clock,
    );
    // Farkli kid + anahtar; `signer`'in dogrulama haritasinda YOK.
    foreignSigner = new EddsaTokenSigner(
      baseConfig('k2', foreign.privateKey, new Map([['k2', foreign.publicKey]])),
      new MutableClock(T0),
    );
  });

  it('kimlik token i imzalar ve dogrular (tenant claim i YOK)', async () => {
    const token = await signer.signIdentityToken({ userId: USER_ID, sessionId: SESSION_ID });

    const verified = await signer.verify(token);

    expect(verified.type).toBe('identity');
    expect(verified.userId).toBe(USER_ID);
    expect(verified.sessionId).toBe(SESSION_ID);
    expect(verified.tenantId).toBeNull();
    expect(verified.jti).toMatch(/[0-9a-f-]{36}/);
  });

  it('access token i imzalar ve tenant claim ini tasir', async () => {
    const token = await signer.signAccessToken({
      userId: USER_ID,
      sessionId: SESSION_ID,
      tenantId: TENANT_ID,
    });

    const verified = await signer.verify(token);

    expect(verified.type).toBe('access');
    expect(verified.tenantId).toBe(TENANT_ID);
  });

  it('suresi dolmus token i reddeder', async () => {
    const token = await signer.signIdentityToken({ userId: USER_ID, sessionId: SESSION_ID });

    // Kimlik token i 5 dk; 6 dk sonra dogrula.
    clock.set(new Date(T0.getTime() + 6 * 60 * 1000));
    await expect(signer.verify(token)).rejects.toThrow(InvalidTokenError);
    clock.set(T0);
  });

  it('kurcalanmis token i reddeder', async () => {
    const token = await signer.signIdentityToken({ userId: USER_ID, sessionId: SESSION_ID });
    const tampered = `${token.slice(0, -3)}xyz`;

    await expect(signer.verify(tampered)).rejects.toThrow(InvalidTokenError);
  });

  it('bilinmeyen kid ile imzalanmis token i reddeder', async () => {
    // foreignSigner k2 ile imzalar; `signer` in haritasinda yalnizca k1 var.
    const token = await foreignSigner.signIdentityToken({ userId: USER_ID, sessionId: SESSION_ID });

    await expect(signer.verify(token)).rejects.toThrow(InvalidTokenError);
  });
});
