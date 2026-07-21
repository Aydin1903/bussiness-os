import { describe, expect, it } from 'vitest';

import { provisionTenantSchema } from './provision-tenant.dto';

describe('provisionTenantSchema', () => {
  it('gecerli govdeyi kabul eder', () => {
    const result = provisionTenantSchema.parse({ name: 'Acme Ltd.', slug: 'acme' });

    expect(result).toEqual({ name: 'Acme Ltd.', slug: 'acme' });
  });

  it('slug u kucuk harfe normalize eder', () => {
    expect(provisionTenantSchema.parse({ name: 'Acme', slug: 'ACME' }).slug).toBe('acme');
  });

  it('bosluklari temizler', () => {
    const result = provisionTenantSchema.parse({ name: '  Acme  ', slug: '  acme  ' });

    expect(result).toEqual({ name: 'Acme', slug: 'acme' });
  });

  it('bos adi reddeder', () => {
    expect(() => provisionTenantSchema.parse({ name: '   ', slug: 'acme' })).toThrow();
  });

  it('200 karakterden uzun adi reddeder', () => {
    expect(() => provisionTenantSchema.parse({ name: 'a'.repeat(201), slug: 'acme' })).toThrow();
  });

  it('tek harfli slug u reddeder', () => {
    expect(() => provisionTenantSchema.parse({ name: 'Acme', slug: 'a' })).toThrow();
  });

  it('eksik alanlari reddeder', () => {
    expect(() => provisionTenantSchema.parse({ name: 'Acme' })).toThrow();
    expect(() => provisionTenantSchema.parse({ slug: 'acme' })).toThrow();
  });

  it('ownerUserId gonderilmesini REDDEDER', () => {
    // Sahip, dogrulanmis kullanicidir; govdeden alinmaz. Sema `.strict()`
    // oldugu icin bu alan sessizce yok sayilmaz, ISTEK REDDEDILIR — istemci
    // gonderdiginin islenmedigini ogrenmeli.
    expect(() =>
      provisionTenantSchema.parse({
        name: 'Acme',
        slug: 'acme',
        ownerUserId: '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b',
      }),
    ).toThrow();
  });

  it('tanimsiz alanlari reddeder', () => {
    expect(() =>
      provisionTenantSchema.parse({ name: 'Acme', slug: 'acme', status: 'active' }),
    ).toThrow();
  });

  it('sayi gonderilen alani reddeder', () => {
    expect(() => provisionTenantSchema.parse({ name: 42, slug: 'acme' })).toThrow();
  });
});
