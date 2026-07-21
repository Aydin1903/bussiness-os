import { InvalidTenantSlugError, ReservedTenantSlugError } from './tenant.error';

/**
 * Tenant'in subdomain etiketi — `acme` -> `acme.businessos.app`
 * (MULTI_TENANT_ARCHITECTURE 6.1).
 *
 * KRITIK: slug bir ROUTING kimligidir, GUVENLIK kimligi DEGILDIR. Veri erisimi
 * daima `TenantId` uzerinden ve daima dogrulanmis JWT claim'inden gelen degerle
 * yapilir (ADR-0015). Slug degistiginde tek bir veri satiri bile etkilenmez —
 * cunku hicbir satir slug'a bagli degildir.
 */

/**
 * Rezerve etiketler (MULTI_TENANT_ARCHITECTURE 6.1).
 *
 * Bu liste kodda sabittir ve GENISLETILEBILIR AMA DARALTILAMAZ: bir etiketi
 * listeden cikarmak, o etiketi almis bir tenant ile platformun kendi alt alan
 * adi arasinda catisma uretir. Ornegin `api` serbest birakilirsa
 * `api.businessos.app` hem bir tenant'i hem de API'yi gostermeye calisir.
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'app',
  'admin',
  'auth',
  'docs',
  'status',
  'mail',
  'static',
  'cdn',
  'assets',
  'support',
  'blog',
]);

/** DNS etiket siniri (RFC 1035). */
const MAX_LENGTH = 63;

/**
 * Tek harfli etiketler yasak oldugu icin alt sinir 2'dir
 * (MULTI_TENANT_ARCHITECTURE 6.1).
 */
const MIN_LENGTH = 2;

/**
 * Kucuk harf, rakam ve tire; bas ve son karakter alfanumerik olmak zorunda.
 * Bu, `-acme` ve `acme-` gibi DNS'in kabul etmedigi etiketleri eler.
 */
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Punycode oneki. IDN homograf saldirilarina kapi actigi icin dogrudan
 * yasaklanir: `xn--` ile baslayan bir etiket, gorsel olarak baska bir markanin
 * alan adina benzeyen bir isme cozulebilir.
 */
const PUNYCODE_PREFIX = 'xn--';

export class TenantSlug {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  /**
   * Tek yaratma yolu. Once normalize eder, sonra dogrular.
   *
   * Normalizasyon (trim + kucuk harf) bilinclidir: `Acme` ile `acme` ayni
   * tenant'i gosterir. Buyuk harfli girdiyi reddetmek yerine normalize etmek,
   * ayni slug'in iki farkli value object uretmesini onler.
   */
  static create(value: string): TenantSlug {
    const normalized = value.trim().toLowerCase();

    if (normalized.length < MIN_LENGTH) {
      throw new InvalidTenantSlugError(
        value,
        `en az ${String(MIN_LENGTH)} karakter olmali (tek harfli etiketler rezervedir)`,
      );
    }

    if (normalized.length > MAX_LENGTH) {
      throw new InvalidTenantSlugError(value, `en fazla ${String(MAX_LENGTH)} karakter olabilir`);
    }

    if (!SLUG_PATTERN.test(normalized)) {
      throw new InvalidTenantSlugError(
        value,
        'yalnizca kucuk harf, rakam ve tire icerebilir; tire ile baslayamaz veya bitemez',
      );
    }

    if (normalized.startsWith(PUNYCODE_PREFIX)) {
      throw new InvalidTenantSlugError(value, `"${PUNYCODE_PREFIX}" oneki kullanilamaz`);
    }

    if (RESERVED_SLUGS.has(normalized)) {
      throw new ReservedTenantSlugError(normalized);
    }

    return new TenantSlug(normalized);
  }

  /** Bir etiketin rezerve olup olmadigini yaratmadan sorgular. */
  static isReserved(value: string): boolean {
    return RESERVED_SLUGS.has(value.trim().toLowerCase());
  }

  equals(other: TenantSlug): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
