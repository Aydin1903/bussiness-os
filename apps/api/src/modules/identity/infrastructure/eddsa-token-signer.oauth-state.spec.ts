import { decodeJwt, generateKeyPair, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { InvalidTokenError } from '../domain/identity.error';
import { EddsaTokenSigner, type EddsaTokenSignerConfig } from './eddsa-token-signer.adapter';

const ISSUER = 'https://api.businessos.com';
const AUDIENCE = 'businessos-api';
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const T0 = new Date('2026-09-01T10:00:00.000Z');

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

const STATE_INPUT = {
  provider: 'google',
  state: 'st_abc123',
  nonce: 'no_xyz789',
  codeVerifier: 'cv_verifier_value_that_is_long_enough_for_pkce_s256',
  next: '/app/crm',
};

const PENDING_LINK_INPUT = {
  provider: 'facebook',
  subject: '10223344556677889',
  email: 'kullanici@ornek.com',
};

/**
 * ============================================================================
 * ⚠️ ADR-0053 §4.2'NIN ZORUNLU AYRIM TESTI (PO Kalem B3)
 * ============================================================================
 * `TokenSigner` guvenlik kritik bir port'tur ve bu ADR ona UCUNCU bir token
 * turu ekledi. Onay, ayrimin BIR TESTLE kilitlenmesi kosuluyla verildi.
 *
 * Ayrim IKI YONLUDUR ve tek yonlu bir kontrol YETMEZDI:
 *
 *   - `verify()` bir OAuth token'ini kabul etseydi, saldirgan kendi state
 *     cerezini bir kimlik token'i gibi sunabilirdi.
 *   - `verifyOAuthState()` bir kimlik token'ini kabul etseydi, CALINMIS bir
 *     kimlik token'i state cerezine konup PKCE dogrulayicisinin yerine
 *     gecebilirdi — PKCE'nin tum degeri o dogrulayicinin yalnizca istegi
 *     baslatan tarayicida bulunmasindadir.
 *
 * ⚠️ Bu dosya AYRI TUTULDU (`eddsa-token-signer.adapter.spec.ts`e eklenmedi):
 * ayrimin kendisi bir ADR onay kosuludur ve silinmesi/zayiflatilmasi
 * gozden kacmamalidir. Ayri bir dosya, `git log --stat`te gorunur.
 * ============================================================================
 */
describe('EddsaTokenSigner — OAuth token turu ayrimi (ADR-0053 §4.2)', () => {
  let clock: MutableClock;
  let signer: EddsaTokenSigner;

  beforeAll(async () => {
    const keys = await generateKeyPair('EdDSA', { extractable: true });
    const config = (signingKey: CryptoKey, verify: ReadonlyMap<string, CryptoKey>) =>
      ({
        issuer: ISSUER,
        audience: AUDIENCE,
        signingKid: 'k1',
        signingKey,
        verificationKeys: verify,
      }) satisfies EddsaTokenSignerConfig;

    clock = new MutableClock(T0);
    signer = new EddsaTokenSigner(
      config(keys.privateKey, new Map([['k1', keys.publicKey]])),
      clock,
    );
  });

  describe('state token u gidis-donus', () => {
    it('imzalanan state token u aynen geri okunur', async () => {
      const token = await signer.signOAuthState(STATE_INPUT);

      await expect(signer.verifyOAuthState(token)).resolves.toEqual(STATE_INPUT);
    });

    it('`next` yoksa `null` doner — yoklugu bir hata DEGILDIR', async () => {
      const token = await signer.signOAuthState({ ...STATE_INPUT, next: null });

      await expect(signer.verifyOAuthState(token)).resolves.toMatchObject({ next: null });
    });

    /**
     * ⚠️ Bu token bir KULLANICIYI TEMSIL ETMEZ. `sub` bos dizeyle degil, HIC
     * yazilmamalidir: bos bir `sub` "bir kullanici var ama kimligi bos" gibi
     * okunur ve bir gun birinin ona guvenmesine yol acardi.
     */
    it('state token unda `sub` claim i HIC YOKTUR', async () => {
      const token = await signer.signOAuthState(STATE_INPUT);

      expect(decodeJwt(token)).not.toHaveProperty('sub');
    });

    it('suresi dolan state token u reddedilir', async () => {
      const token = await signer.signOAuthState(STATE_INPUT);
      clock.set(new Date(T0.getTime() + 11 * 60_000));

      await expect(signer.verifyOAuthState(token)).rejects.toBeInstanceOf(InvalidTokenError);
      clock.set(T0);
    });
  });

  // ==========================================================================
  // ⚠️ ASIL AYRIM — ALTI COMBINASYONUN ALTISI DA SINANIR
  // ==========================================================================

  describe('⚠️ oturum token lari OAuth dogrulayicilarina GIREMEZ', () => {
    it('kimlik token u `verifyOAuthState` tarafindan REDDEDILIR', async () => {
      const identityToken = await signer.signIdentityToken({
        userId: USER_ID,
        sessionId: SESSION_ID,
      });

      await expect(signer.verifyOAuthState(identityToken)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });

    it('erisim token u `verifyOAuthState` tarafindan REDDEDILIR', async () => {
      const accessToken = await signer.signAccessToken({
        userId: USER_ID,
        sessionId: SESSION_ID,
        tenantId: TENANT_ID,
      });

      await expect(signer.verifyOAuthState(accessToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('kimlik token u `verifyOAuthPendingLink` tarafindan REDDEDILIR', async () => {
      const identityToken = await signer.signIdentityToken({
        userId: USER_ID,
        sessionId: SESSION_ID,
      });

      await expect(signer.verifyOAuthPendingLink(identityToken)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });
  });

  describe('⚠️ OAuth token lari oturum dogrulayicisina GIREMEZ', () => {
    it('state token u `verify()` tarafindan REDDEDILIR', async () => {
      const stateToken = await signer.signOAuthState(STATE_INPUT);

      await expect(signer.verify(stateToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('bekleyen baglama token u `verify()` tarafindan REDDEDILIR', async () => {
      const pendingToken = await signer.signOAuthPendingLink(PENDING_LINK_INPUT);

      await expect(signer.verify(pendingToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });
  });

  /**
   * ⚠️ IKI OAuth TURU DE BIRBIRINDEN AYRIDIR. Ayni "OAuth ailesinden" olmalari
   * onlari birbirinin yerine gecirilebilir YAPMAZ: state token'i PKCE
   * dogrulayicisi tasir, bekleyen baglama token'i ise DOGRULANMAMIS bir `sub`
   * tasir. Ikincisi birincinin yerine gecebilseydi, bir saldirgan kendi
   * `sub`unu bir state gibi sunabilirdi.
   */
  describe('⚠️ iki OAuth turu BIRBIRININ yerine gecemez', () => {
    it('bekleyen baglama token u `verifyOAuthState` tarafindan REDDEDILIR', async () => {
      const pendingToken = await signer.signOAuthPendingLink(PENDING_LINK_INPUT);

      await expect(signer.verifyOAuthState(pendingToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('state token u `verifyOAuthPendingLink` tarafindan REDDEDILIR', async () => {
      const stateToken = await signer.signOAuthState(STATE_INPUT);

      await expect(signer.verifyOAuthPendingLink(stateToken)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });
  });

  describe('bekleyen baglama token u', () => {
    it('gidis-donus korunur', async () => {
      const token = await signer.signOAuthPendingLink(PENDING_LINK_INPUT);

      await expect(signer.verifyOAuthPendingLink(token)).resolves.toEqual(PENDING_LINK_INPUT);
    });

    it('`sub` claim i HIC YOKTUR — dogrulanmamis bir kimlik oturum acamaz', async () => {
      const token = await signer.signOAuthPendingLink(PENDING_LINK_INPUT);

      expect(decodeJwt(token)).not.toHaveProperty('sub');
    });
  });
});
