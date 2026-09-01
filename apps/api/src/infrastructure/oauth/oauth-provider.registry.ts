import {
  isOAuthProviderKey,
  type OAuthProviderKey,
  type OAuthProviderPort,
  type OAuthProviderRegistry,
} from '../../shared/oauth-provider.port';

/**
 * Yapilandirilmis saglayicilarin kaydi (ADR-0053 §3.3).
 *
 * ============================================================================
 * ⚠️ YAPILANDIRILMAMIS SAGLAYICI = OLMAYAN SAGLAYICI
 * ============================================================================
 * Bu sinifin tek isi bir haritayi okumak degil, bir SOZLESMEYI ZORLAMAKTIR:
 * `CLIENT_ID`/`CLIENT_SECRET`i olmayan bir saglayici bu haritaya HIC girmez.
 * Sonucu iki yerde gorulur ve ikisi de bilinclidir:
 *
 *   - Ucu **404** doner (bir "devre disi" bayragi degil — uc gercekten YOK).
 *   - Arayuz `configuredKeys()`i okur ve dugmesini HIC cizmez.
 *
 * ⚠️ Alternatif — dugmeyi cizip tiklaninca hata gostermek — ADR-0052 §6.1'in
 * acikca reddettigi seydir: _"tiklandiginda hicbir sey yapmayan ya da 'yakinda'
 * diyen dugme… giris ekrani, guvenin kuruldugu ekrandir."_
 *
 * ============================================================================
 * ⚠️ SIRA BURADA KORUNUR — `Map` EKLEME SIRASINI TUTAR
 * ============================================================================
 * `configuredKeys()` arayuzun dugme sirasini besler ve ADR-0053 §9.3 o sirayi
 * gerekcelendirir (Google · Microsoft · LinkedIn · Facebook — yaygin kullanim).
 * `Object.keys` ya da bir `Set` de ayni isi gorurdu; `Map` secilmesinin sebebi
 * ekleme sirasinin SPEC TARAFINDAN GARANTILI olmasidir.
 * ============================================================================
 */
export class DefaultOAuthProviderRegistry implements OAuthProviderRegistry {
  readonly #providers: ReadonlyMap<OAuthProviderKey, OAuthProviderPort>;

  /**
   * @param providers ⚠️ ADR-0053 §9.3'un SIRASIYLA verilmelidir. Yalnizca
   *   yapilandirilmis olanlar; eksikler burada HIC bulunmaz.
   */
  constructor(providers: readonly OAuthProviderPort[]) {
    this.#providers = new Map(providers.map((provider) => [provider.key, provider]));
  }

  /**
   * `key` ham bir yol parcasidir (`/auth/oauth/:provider/...`), yani
   * KULLANICI GIRDISIDIR. Once bilinen bir anahtar oldugu dogrulanir, sonra
   * yapilandirilmis oldugu — ikisi de basarisiz olursa `null`, yani 404.
   */
  find(key: string): OAuthProviderPort | null {
    if (!isOAuthProviderKey(key)) {
      return null;
    }
    return this.#providers.get(key) ?? null;
  }

  configuredKeys(): readonly OAuthProviderKey[] {
    return [...this.#providers.keys()];
  }
}
