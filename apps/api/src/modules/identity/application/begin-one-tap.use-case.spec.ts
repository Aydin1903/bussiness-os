import { describe, expect, it } from 'vitest';

import {
  type OAuthIdTokenVerifier,
  type OAuthIdentity,
  type OAuthProviderKey,
  type OAuthProviderPort,
  type OAuthProviderRegistry,
} from '../../../shared/oauth-provider.port';
import { OAuthProviderNotConfiguredError } from '../domain/identity.error';
import { BeginOneTapUseCase } from './begin-one-tap.use-case';
import { type OAuthStateGenerator } from './oauth-state-generator.port';
import { type OAuthOneTapTokenInput, type TokenSigner } from './token-signer.port';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const CLIENT_ID = '1032506452474-ornek.apps.googleusercontent.com';
const NONCE = 'uretilmis-nonce-32-bayt';

class FakeStateGenerator implements OAuthStateGenerator {
  generate(): string {
    return NONCE;
  }
}

class FakeVerifier implements OAuthIdTokenVerifier {
  readonly key: OAuthProviderKey = 'google';

  verifyIdToken(_input: { idToken: string; nonce: string }): Promise<OAuthIdentity> {
    return Promise.reject(new Error('bu testte cagrilmaz'));
  }
}

class FakeRegistry implements OAuthProviderRegistry {
  constructor(private readonly verifier: OAuthIdTokenVerifier | null) {}

  find(_key: string): OAuthProviderPort | null {
    return null;
  }

  findIdTokenVerifier(key: string): OAuthIdTokenVerifier | null {
    return key === 'google' ? this.verifier : null;
  }

  configuredKeys(): readonly OAuthProviderKey[] {
    return ['google'];
  }
}

class FakeTokenSigner {
  signed: OAuthOneTapTokenInput | null = null;

  signOAuthOneTap(input: OAuthOneTapTokenInput): Promise<string> {
    this.signed = input;
    return Promise.resolve('imzali-one-tap-token');
  }
}

function build(options?: {
  readonly verifierMissing?: boolean;
  readonly clientIds?: Readonly<Record<string, string>>;
}) {
  const signer = new FakeTokenSigner();
  const useCase = new BeginOneTapUseCase({
    registry: new FakeRegistry(options?.verifierMissing === true ? null : new FakeVerifier()),
    stateGenerator: new FakeStateGenerator(),
    tokenSigner: signer as unknown as TokenSigner,
    clientIds: options?.clientIds ?? { google: CLIENT_ID },
  });

  return { useCase, signer };
}

describe('BeginOneTapUseCase — nonce SUNUCUDA uretilir (EK-1.1)', () => {
  it('nonce IKI YERE birden gider: govdeye ve imzali token`a', async () => {
    /*
     * Bu ikilik replay korumasinin TAMAMIDIR: govdedeki kopya GIS'i
     * yapilandirir, imzali kopya ise sunucunun "bu nonce'u BU TARAYICI icin BEN
     * urettim" diyebilmesinin tek yoludur. Ikisi ayrisirsa koruma SESSIZCE
     * anlamsizlasir.
     */
    const { useCase, signer } = build();

    const result = await useCase.execute({ provider: 'google' });

    expect(result.nonce).toBe(NONCE);
    expect(signer.signed?.nonce).toBe(NONCE);
  });

  it('imzali token saglayiciyi da baglar', async () => {
    const { useCase, signer } = build();

    await useCase.execute({ provider: 'google' });

    expect(signer.signed?.provider).toBe('google');
  });

  it('clientId SUNUCUDAN doner — NEXT_PUBLIC_* reddedildi', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ provider: 'google' });

    expect(result.clientId).toBe(CLIENT_ID);
  });

  it('stateToken govdede DONER ama cereze yazilmasi cagiranin isidir', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ provider: 'google' });

    expect(result.stateToken).toBe('imzali-one-tap-token');
  });
});

describe('BeginOneTapUseCase — yapilandirilmamis saglayici', () => {
  it('bilinmeyen saglayici icin uc yoktur', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ provider: 'facebook' })).rejects.toBeInstanceOf(
      OAuthProviderNotConfiguredError,
    );
  });

  it('id token yetenegi olmayan saglayici icin uc yoktur', async () => {
    const { useCase } = build({ verifierMissing: true });

    await expect(useCase.execute({ provider: 'google' })).rejects.toBeInstanceOf(
      OAuthProviderNotConfiguredError,
    );
  });

  it('YETENEK VAR ama clientId YOKSA yine reddeder — YARIM YAPILANDIRMA GECMEZ', async () => {
    /*
     * Bu dal ayri yazildi cunku yarim yapilandirma bu projede tanidik bir
     * sessiz hata kaynagidir: yetenek varmis gibi gorunur, GIS bos bir clientId
     * ile yapilandirilir ve kullanici sebebi anlasilmayan bir hata gorur.
     */
    const { useCase } = build({ clientIds: {} });

    await expect(useCase.execute({ provider: 'google' })).rejects.toBeInstanceOf(
      OAuthProviderNotConfiguredError,
    );
  });
});
