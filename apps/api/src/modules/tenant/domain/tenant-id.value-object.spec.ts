import { describe, expect, it } from 'vitest';

import { TenantId } from './tenant-id.value-object';
import { InvalidTenantIdError } from './tenant.error';

/** Gecerli bir UUIDv7: 3. grup 7 ile, 4. grup 8-b araligi ile baslar. */
const VALID_UUID_V7 = '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b';
const OTHER_UUID_V7 = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';

describe('TenantId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    const id = TenantId.create(VALID_UUID_V7);

    expect(id.value).toBe(VALID_UUID_V7);
  });

  it('buyuk harfli yazimi kucuk harfe normalize eder', () => {
    const id = TenantId.create(VALID_UUID_V7.toUpperCase());

    expect(id.value).toBe(VALID_UUID_V7);
  });

  it('bastaki ve sondaki bosluklari temizler', () => {
    const id = TenantId.create(`  ${VALID_UUID_V7}  `);

    expect(id.value).toBe(VALID_UUID_V7);
  });

  it('UUIDv4 verildiginde olusturmayi reddeder', () => {
    // v4 ile v7 ayni uzunluktadir ve gozle ayirt edilemez; surum hanesi
    // kontrol edilmezse v4 sessizce kabul edilir.
    const uuidV4 = '018f3a2b-7c4d-4e1f-8a2b-3c4d5e6f7a8b';

    expect(() => TenantId.create(uuidV4)).toThrow(InvalidTenantIdError);
  });

  it('gecersiz variant hanesi tasiyan degeri reddeder', () => {
    const invalidVariant = '018f3a2b-7c4d-7e1f-ca2b-3c4d5e6f7a8b';

    expect(() => TenantId.create(invalidVariant)).toThrow(InvalidTenantIdError);
  });

  it('bos metni reddeder', () => {
    expect(() => TenantId.create('')).toThrow(InvalidTenantIdError);
  });

  it('tiresiz yazimi reddeder', () => {
    expect(() => TenantId.create(VALID_UUID_V7.replaceAll('-', ''))).toThrow(InvalidTenantIdError);
  });

  it('UUID olmayan metni reddeder', () => {
    expect(() => TenantId.create('acme-tenant')).toThrow(InvalidTenantIdError);
  });

  it('ayni degeri tasiyan iki nesneyi esit sayar', () => {
    const first = TenantId.create(VALID_UUID_V7);
    const second = TenantId.create(VALID_UUID_V7.toUpperCase());

    expect(first.equals(second)).toBe(true);
  });

  it('farkli degerleri tasiyan iki nesneyi esit saymaz', () => {
    const first = TenantId.create(VALID_UUID_V7);
    const second = TenantId.create(OTHER_UUID_V7);

    expect(first.equals(second)).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = TenantId.create(VALID_UUID_V7);

    expect(() => {
      (id as { value: string }).value = OTHER_UUID_V7;
    }).toThrow(TypeError);
  });

  it('metne cevrildiginde ham degeri verir', () => {
    expect(String(TenantId.create(VALID_UUID_V7))).toBe(VALID_UUID_V7);
  });
});
