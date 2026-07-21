import { describe, expect, it } from 'vitest';

import { TenantSlug } from './tenant-slug.value-object';
import { InvalidTenantSlugError, ReservedTenantSlugError } from './tenant.error';

describe('TenantSlug', () => {
  it('kucuk harf ve rakam iceren etiketi kabul eder', () => {
    expect(TenantSlug.create('acme42').value).toBe('acme42');
  });

  it('ortasinda tire bulunan etiketi kabul eder', () => {
    expect(TenantSlug.create('acme-holding').value).toBe('acme-holding');
  });

  it('buyuk harfli girdiyi kucuk harfe normalize eder', () => {
    // Reddetmek yerine normalize etmek bilinclidir: "Acme" ile "acme" ayni
    // tenant'i gosterir, iki farkli value object uretmemeli.
    expect(TenantSlug.create('ACME').value).toBe('acme');
  });

  it('bastaki ve sondaki bosluklari temizler', () => {
    expect(TenantSlug.create('  acme  ').value).toBe('acme');
  });

  it('tek harfli etiketi reddeder', () => {
    expect(() => TenantSlug.create('a')).toThrow(InvalidTenantSlugError);
  });

  it('63 karakterden uzun etiketi reddeder', () => {
    expect(() => TenantSlug.create('a'.repeat(64))).toThrow(InvalidTenantSlugError);
  });

  it('tam 63 karakterlik etiketi kabul eder', () => {
    expect(TenantSlug.create('a'.repeat(63)).value).toHaveLength(63);
  });

  it('tire ile baslayan etiketi reddeder', () => {
    expect(() => TenantSlug.create('-acme')).toThrow(InvalidTenantSlugError);
  });

  it('tire ile biten etiketi reddeder', () => {
    expect(() => TenantSlug.create('acme-')).toThrow(InvalidTenantSlugError);
  });

  it('alt cizgi iceren etiketi reddeder', () => {
    expect(() => TenantSlug.create('acme_corp')).toThrow(InvalidTenantSlugError);
  });

  it('nokta iceren etiketi reddeder', () => {
    expect(() => TenantSlug.create('acme.corp')).toThrow(InvalidTenantSlugError);
  });

  it('bosluk iceren etiketi reddeder', () => {
    expect(() => TenantSlug.create('acme corp')).toThrow(InvalidTenantSlugError);
  });

  it('ASCII disi karakter iceren etiketi reddeder', () => {
    expect(() => TenantSlug.create('sirket')).not.toThrow();
    expect(() => TenantSlug.create('şirket')).toThrow(InvalidTenantSlugError);
  });

  it('punycode oneki ile baslayan etiketi reddeder', () => {
    // IDN homograf riski: xn-- ile baslayan etiket, baska bir markanin alan
    // adina gorsel olarak benzeyen bir isme cozulebilir.
    expect(() => TenantSlug.create('xn--80ak6aa92e')).toThrow(InvalidTenantSlugError);
  });

  it('bos metni reddeder', () => {
    expect(() => TenantSlug.create('')).toThrow(InvalidTenantSlugError);
  });

  it('yalnizca bosluktan olusan metni reddeder', () => {
    expect(() => TenantSlug.create('   ')).toThrow(InvalidTenantSlugError);
  });

  describe('rezerve etiketler', () => {
    const reserved = [
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
    ];

    it.each(reserved)('rezerve etiket "%s" ile olusturmayi reddeder', (value) => {
      expect(() => TenantSlug.create(value)).toThrow(ReservedTenantSlugError);
    });

    it('rezerve etiketi buyuk harfle yazarak atlatmaya izin vermez', () => {
      // Normalizasyon dogrulamadan ONCE yapilmali; sonra yapilirsa "API"
      // rezerve kontrolunden kacar ve api.businessos.app catismasi olusur.
      expect(() => TenantSlug.create('API')).toThrow(ReservedTenantSlugError);
    });

    it('rezerve etiketi bosluk ekleyerek atlatmaya izin vermez', () => {
      expect(() => TenantSlug.create(' admin ')).toThrow(ReservedTenantSlugError);
    });

    it('rezerve etiketi iceren ama esit olmayan etiketi kabul eder', () => {
      expect(TenantSlug.create('admin-panel').value).toBe('admin-panel');
    });

    it('rezerve olup olmadigini nesne yaratmadan bildirir', () => {
      expect(TenantSlug.isReserved('www')).toBe(true);
      expect(TenantSlug.isReserved('acme')).toBe(false);
    });
  });

  it('ayni degeri tasiyan iki nesneyi esit sayar', () => {
    expect(TenantSlug.create('acme').equals(TenantSlug.create('ACME'))).toBe(true);
  });

  it('farkli degerleri tasiyan iki nesneyi esit saymaz', () => {
    expect(TenantSlug.create('acme').equals(TenantSlug.create('globex'))).toBe(false);
  });

  it('metne cevrildiginde ham degeri verir', () => {
    // Subdomain kurarken ve persistence'a yazarken kullanilir.
    expect(String(TenantSlug.create('acme'))).toBe('acme');
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const slug = TenantSlug.create('acme');

    expect(() => {
      (slug as { value: string }).value = 'globex';
    }).toThrow(TypeError);
  });
});
