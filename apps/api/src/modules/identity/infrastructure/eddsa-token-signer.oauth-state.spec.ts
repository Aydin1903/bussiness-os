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

const ONE_TAP_INPUT = {
  provider: 'google',
  nonce: 'ot_nonce_value_32_bytes_base64url',
};

/**
 * ============================================================================
 * ⚠️ ADR-0053 §4.2 (PO Kalem B3) + EK-1.5 (PO Kalem J) — ZORUNLU AYRIM TESTI
 * ============================================================================
 * `TokenSigner` guvenlik kritik bir port'tur ve ADR-0053 ona ucuncu bir token
 * turu ekledi (B3), EK-1 ise BESINCIYI (J). Onay her iki kez de ayrimin BIR
 * TESTLE kilitlenmesi kosuluyla verildi.
 *
 * ⚠️ TEST BIR MATRISE DONUSTU — VE SEBEBI ARITMETIKTIR (EK-1.5):
 * uc turde alti kombinasyon vardi ve tek tek yazilabiliyordu; BES turde bu
 * **yirmi** kombinasyondur (5 dogrulayici × kendi turu disindaki 4 tur).
 * Elle yazmak hem okunmaz olurdu hem de ⚠️ EKSIK KALIRDI.
 *
 * ⚠️ Bu yuzden ciftler TABLODAN URETILIR: altinci bir tur eklendigi gun
 * `TOKEN_KINDS`e tek satir yazmak yeter ve test KENDILIGINDEN buyur. Elle
 * yazilan bicimde ise yeni turun kombinasyonlari, biri onlari yazmadigi
 * surece SESSIZCE eksik kalirdi — tam olarak bu ADR'nin surekli isaretledigi
 * hata sinifi.
 * ============================================================================
 */
describe('EddsaTokenSigner — token turu ayrimi (ADR-0053 §4.2 + EK-1.5)', () => {
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

  // ==========================================================================
  // ⚠️ MATRISIN KAYNAGI — bes tur, her biri kendi ureticisi ve dogrulayicisiyla
  // ==========================================================================
  // ⚠️ ALTINCI BIR TUR EKLENIRSE: buraya tek satir eklenir ve yirmi kombinasyon
  // otomatik olarak otuza cikar. Baska hicbir yere dokunulmaz.
  //
  // ⚠️ `identity` ve `access` AYNI dogrulayiciyi paylasir (`verify`) ve bu
  // BILINCLIDIR: ikisi de OTURUM token'idir, `verify` ikisini de kabul eder ve
  // `type` alaninda ayirir. Bu yuzden matriste "kendi dogrulayicisi" kavrami
  // tur bazinda degil DOGRULAYICI bazinda okunur (asagidaki `verifierId`).
  interface TokenKind {
    readonly id: string;
    readonly verifierId: string;
    readonly sign: () => Promise<string>;
    readonly verify: (token: string) => Promise<unknown>;
  }

  function tokenKinds(): readonly TokenKind[] {
    return [
      {
        id: 'identity',
        verifierId: 'verify',
        sign: () => signer.signIdentityToken({ userId: USER_ID, sessionId: SESSION_ID }),
        verify: (t) => signer.verify(t),
      },
      {
        id: 'access',
        verifierId: 'verify',
        sign: () =>
          signer.signAccessToken({ userId: USER_ID, sessionId: SESSION_ID, tenantId: TENANT_ID }),
        verify: (t) => signer.verify(t),
      },
      {
        id: 'oauth-state',
        verifierId: 'verifyOAuthState',
        sign: () => signer.signOAuthState(STATE_INPUT),
        verify: (t) => signer.verifyOAuthState(t),
      },
      {
        id: 'oauth-pending-link',
        verifierId: 'verifyOAuthPendingLink',
        sign: () => signer.signOAuthPendingLink(PENDING_LINK_INPUT),
        verify: (t) => signer.verifyOAuthPendingLink(t),
      },
      {
        id: 'oauth-one-tap',
        verifierId: 'verifyOAuthOneTap',
        sign: () => signer.signOAuthOneTap(ONE_TAP_INPUT),
        verify: (t) => signer.verifyOAuthOneTap(t),
      },
    ];
  }

  /** Her tur KENDI dogrulayicisindan gecer — matrisin kosegeni. */
  describe('kosegen: her tur kendi dogrulayicisindan GECER', () => {
    it('bes turun besi de kendi dogrulayicisi tarafindan kabul edilir', async () => {
      for (const kind of tokenKinds()) {
        const token = await kind.sign();
        await expect(
          kind.verify(token),
          `${kind.id} kendi dogrulayicisindan gecmeli`,
        ).resolves.toBeDefined();
      }
    });
  });

  /**
   * ⚠️ MATRISIN ASIL ISI: kosegen DISINDAKI her hucre REDDEDILMELI.
   *
   * Tek yonlu bir kontrol yetmezdi:
   *   - `verify()` bir OAuth token'ini kabul etseydi, saldirgan kendi state
   *     cerezini bir kimlik token'i gibi sunabilirdi.
   *   - `verifyOAuthState()` bir kimlik token'ini kabul etseydi, CALINMIS bir
   *     kimlik token'i PKCE dogrulayicisinin yerine gecebilirdi.
   *   - Iki OAuth turu birbirinin yerine gecebilseydi, DOGRULANMAMIS bir `sub`
   *     tasiyan bekleyen-baglama token'i bir state gibi sunulabilirdi.
   */
  describe('⚠️ kosegen disi: YIRMI kombinasyonun yirmisi de REDDEDILIR', () => {
    const kinds = tokenKinds();
    const pairs = kinds.flatMap((produced) =>
      kinds
        // ⚠️ `verifierId` ile elenir, `id` ile DEGIL: `identity` ve `access`
        // ayni dogrulayiciyi paylasir ve birbirini reddetmeleri BEKLENMEZ.
        .filter((verifier) => verifier.verifierId !== produced.verifierId)
        .map((verifier) => ({ produced, verifier })),
    );

    it('matris beklenen buyuklukte — yeni tur eklenince BU SAYI degisir', () => {
      // 5 tur × (kendi dogrulayicisi disindaki dogrulayicilar).
      // identity/access ayni dogrulayicidadir, bu yuzden 20 degil 18 cift olur.
      expect(pairs.length).toBe(18);
      expect(kinds).toHaveLength(5);
    });

    it.each(pairs.map((p) => [p.produced.id, p.verifier.verifierId, p] as const))(
      '%s token u -> %s tarafindan REDDEDILIR',
      async (_producedId, _verifierId, pair) => {
        const token = await pair.produced.sign();

        await expect(pair.verifier.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
      },
    );
  });

  /**
   * ⚠️ UC OAuth TURUNUN DE `sub` CLAIM'I HIC YOKTUR.
   *
   * Bos dizeyle degil, HIC yazilmamalidir: bos bir `sub` "bir kullanici var ama
   * kimligi bos" gibi okunur ve bir gun birinin ona guvenmesine yol acardi.
   */
  describe('⚠️ OAuth token lari bir KULLANICIYI TEMSIL ETMEZ', () => {
    it('state / bekleyen baglama / one-tap: ucunde de `sub` YOKTUR', async () => {
      for (const sign of [
        () => signer.signOAuthState(STATE_INPUT),
        () => signer.signOAuthPendingLink(PENDING_LINK_INPUT),
        () => signer.signOAuthOneTap(ONE_TAP_INPUT),
      ]) {
        expect(decodeJwt(await sign())).not.toHaveProperty('sub');
      }
    });
  });

  describe('gidis-donus ve omur', () => {
    it('state token u aynen geri okunur', async () => {
      const token = await signer.signOAuthState(STATE_INPUT);

      await expect(signer.verifyOAuthState(token)).resolves.toEqual(STATE_INPUT);
    });

    it('`next` yoksa `null` doner — yoklugu bir hata DEGILDIR', async () => {
      const token = await signer.signOAuthState({ ...STATE_INPUT, next: null });

      await expect(signer.verifyOAuthState(token)).resolves.toMatchObject({ next: null });
    });

    it('bekleyen baglama token u aynen geri okunur', async () => {
      const token = await signer.signOAuthPendingLink(PENDING_LINK_INPUT);

      await expect(signer.verifyOAuthPendingLink(token)).resolves.toEqual(PENDING_LINK_INPUT);
    });

    it('one-tap token u aynen geri okunur', async () => {
      const token = await signer.signOAuthOneTap(ONE_TAP_INPUT);

      await expect(signer.verifyOAuthOneTap(token)).resolves.toEqual(ONE_TAP_INPUT);
    });

    it('suresi dolan state token u reddedilir', async () => {
      const token = await signer.signOAuthState(STATE_INPUT);
      clock.set(new Date(T0.getTime() + 11 * 60_000));

      await expect(signer.verifyOAuthState(token)).rejects.toBeInstanceOf(InvalidTokenError);
      clock.set(T0);
    });

    it('suresi dolan one-tap token u reddedilir', async () => {
      const token = await signer.signOAuthOneTap(ONE_TAP_INPUT);
      clock.set(new Date(T0.getTime() + 11 * 60_000));

      await expect(signer.verifyOAuthOneTap(token)).rejects.toBeInstanceOf(InvalidTokenError);
      clock.set(T0);
    });
  });
});
