import { describe, expect, it } from 'vitest';

import { type AppConfig } from '../../infrastructure/config/app.config';
import { type Clock } from '../../shared/clock.port';
import {
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProviderRegistry,
} from '../../shared/oauth-provider.port';
import { identityOAuthProviders } from './identity-oauth.providers';

/**
 * ============================================================================
 * ⚠️ BU DOSYA GERCEK WIRING'I CAGIRIR — TAKLIT BIR REGISTRY KURMAZ
 * ============================================================================
 * `DefaultOAuthProviderRegistry`nin kendi davranisi zaten dogru; ⚠️ kirilgan
 * olan sey ONA NE VERILDIGIDIR. Bu yuzden test, `identity-oauth.providers.ts`
 * icindeki GERCEK `useFactory`yi bulup calistirir.
 *
 * ⚠️ KORUDUGU IKI SEY VE IKISININ DE HATASI SESSIZDIR:
 *
 *   1. **SIRA** (ADR-0053 §9.3: Google · Microsoft · LinkedIn · Facebook).
 *      `configuredKeys()` arayuzun dugme sirasini besler ve arayuz yeniden
 *      SIRALAMAZ. Birisi factory'deki bloklarin yerini degistirirse ekrandaki
 *      sira degisir — ⚠️ ne lint ne tip denetimi bunu yakalar, hicbir test
 *      kirmizi yanmaz ve kimse fark etmez.
 *
 *   2. **YAPILANDIRILMAMIS SAGLAYICI = OLMAYAN SAGLAYICI** (§3.3). Bir
 *      saglayici `null` yapilandirmayla registry'ye SIZARSA dugmesi ekranda
 *      durur ve tiklaninca 404 verir — ADR-0052 §6.1'in acikca reddettigi sey.
 * ============================================================================
 */

const clock: Clock = { now: () => new Date('2026-09-03T12:00:00.000Z') };

/** Factory yalnizca `oauth` dalini okur; gerisi bu test icin ilgisizdir. */
function configWith(oauth: Partial<AppConfig['oauth']>): AppConfig {
  const full = {
    apiPublicUrl: 'https://api.kobiwise.com',
    webPublicUrl: 'https://app.kobiwise.com',
    google: null,
    microsoft: null,
    linkedin: null,
    facebook: null,
    ...oauth,
  };

  // ⚠️ Yalnizca `oauth` dali gercektir; `AppConfig`in kalani bu factory
  // tarafindan HIC okunmaz ve okunmadigi `inject` listesiyle sabittir.
  const partial: { oauth: AppConfig['oauth'] } = { oauth: full };
  return partial as unknown as AppConfig;
}

/** Kompozisyon kokundeki GERCEK factory'yi bulur ve calistirir. */
function buildRegistry(config: AppConfig): OAuthProviderRegistry {
  const entry = identityOAuthProviders.find(
    (provider) => 'provide' in provider && provider.provide === OAUTH_PROVIDER_REGISTRY,
  );

  if (entry === undefined || !('useFactory' in entry)) {
    throw new Error('OAUTH_PROVIDER_REGISTRY factory bulunamadi');
  }

  const registry: unknown = entry.useFactory(config, clock);
  return registry as OAuthProviderRegistry;
}

const google = { clientId: 'g-id', clientSecret: 'g-secret' };
const microsoft = { clientId: 'ms-id', clientSecret: 'ms-secret', tenant: 'common' };
const linkedin = { clientId: 'li-id', clientSecret: 'li-secret' };
const facebook = { clientId: 'fb-id', clientSecret: 'fb-secret' };

describe('identityOAuthProviders — registry wiring (ADR-0053 §3.3, §9.3)', () => {
  it('⚠️ DORDU DE yapilandirildiginda SIRA §9.3`un sirasidir', () => {
    const registry = buildRegistry(configWith({ google, microsoft, linkedin, facebook }));

    expect(registry.configuredKeys()).toEqual(['google', 'microsoft', 'linkedin', 'facebook']);
  });

  it('hicbiri yapilandirilmamissa liste BOSTUR (arayuz hicbir sey cizmez)', () => {
    expect(buildRegistry(configWith({})).configuredKeys()).toEqual([]);
  });

  /**
   * ⚠️ SIRA, EKSIK OLANLAR ATLANARAK KORUNUR: Google ve LinkedIn aciksa
   * LinkedIn yine Google'dan SONRA gelir. Kaydin sirasi kaynak dosyadaki
   * blok sirasindan gelir, alfabetik ya da rastgele degil.
   */
  it('⚠️ araya bosluk girse de goreli SIRA korunur', () => {
    const registry = buildRegistry(configWith({ google, facebook }));

    expect(registry.configuredKeys()).toEqual(['google', 'facebook']);
  });

  it('⚠️ yapilandirilmamis saglayici registry`de HIC YOKTUR (`find` -> null)', () => {
    const registry = buildRegistry(configWith({ google }));

    expect(registry.find('google')).not.toBeNull();
    expect(registry.find('microsoft')).toBeNull();
    expect(registry.find('linkedin')).toBeNull();
    expect(registry.find('facebook')).toBeNull();
  });

  it('bilinmeyen anahtar `null` doner (uc 404 verir)', () => {
    const registry = buildRegistry(configWith({ google, microsoft, linkedin, facebook }));

    expect(registry.find('apple')).toBeNull();
    expect(registry.find('../../etc/passwd')).toBeNull();
  });

  /**
   * ⚠️ ONE TAP YALNIZCA GOOGLE'DADIR ve bu YAPISAL bir kontroldur, bir bayrak
   * degil: registry adapter'in `verifyIdToken` metodunu GERCEKTEN tasiyip
   * tasimadigina bakar. Yeni uc adapter onu tasimaz — dolayisiyla onlar icin
   * One Tap ucu **404**tur, "devre disi" degil.
   *
   * ⚠️ Microsoft ve LinkedIn de ID token dogrulayabilirdi; ⚠️ ETMEMELERI
   * bilinclidir — One Tap kutusunu cizen betik (GIS) Google'a ozgudur ve
   * olmayan bir istemci icin sunucu ucu acmak, kullanilmayan bir kimlik
   * dogrulama girisi birakmak olurdu.
   */
  it('⚠️ ID token dogrulayicisi YALNIZCA Google`dadir (One Tap)', () => {
    const registry = buildRegistry(configWith({ google, microsoft, linkedin, facebook }));

    expect(registry.findIdTokenVerifier('google')).not.toBeNull();
    expect(registry.findIdTokenVerifier('microsoft')).toBeNull();
    expect(registry.findIdTokenVerifier('linkedin')).toBeNull();
    expect(registry.findIdTokenVerifier('facebook')).toBeNull();
  });

  /**
   * ⚠️ ADR-0053 §15'IN SINAVI: yeni bir saglayici eklemek YALNIZCA yeni bir
   * adapter yazmayi gerektirmeli. Bu test onu dolayli ama olculebilir bicimde
   * kanitlar — dort adapter'in dordu de AYNI arayuzden gecer ve registry
   * hicbirini ozel olarak tanimaz.
   */
  it('⚠️ dort adapter da AYNI port sozlesmesini karsilar', () => {
    const registry = buildRegistry(configWith({ google, microsoft, linkedin, facebook }));

    for (const key of registry.configuredKeys()) {
      const provider = registry.find(key);

      expect(provider?.key).toBe(key);
      expect(typeof provider?.buildAuthorization).toBe('function');
      expect(typeof provider?.exchange).toBe('function');
    }
  });
});
