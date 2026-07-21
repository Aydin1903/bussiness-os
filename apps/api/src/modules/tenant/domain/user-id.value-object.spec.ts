import { describe, expect, it } from 'vitest';

import { InvalidUserIdError } from './tenant.error';
import { UserId } from './user-id.value-object';

const VALID_UUID_V7 = '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b';
const OTHER_UUID_V7 = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';

describe('UserId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(UserId.create(VALID_UUID_V7).value).toBe(VALID_UUID_V7);
  });

  it('buyuk harfli yazimi kucuk harfe normalize eder', () => {
    expect(UserId.create(VALID_UUID_V7.toUpperCase()).value).toBe(VALID_UUID_V7);
  });

  it('gecersiz id verildiginde kendi hatasini firlatir', () => {
    // TenantId ile ayni dogrulamayi paylasir ama AYRI bir hata tipi uretir:
    // hangi kimligin gecersiz oldugu cagiran taraf icin belirgin olmali.
    expect(() => UserId.create('gecersiz')).toThrow(InvalidUserIdError);
  });

  it('UUIDv4 verildiginde olusturmayi reddeder', () => {
    expect(() => UserId.create('018f3a2b-7c4d-4e1f-8a2b-3c4d5e6f7a8b')).toThrow(InvalidUserIdError);
  });

  it('ayni degeri tasiyan iki nesneyi esit sayar', () => {
    expect(UserId.create(VALID_UUID_V7).equals(UserId.create(VALID_UUID_V7))).toBe(true);
  });

  it('farkli degerleri tasiyan iki nesneyi esit saymaz', () => {
    expect(UserId.create(VALID_UUID_V7).equals(UserId.create(OTHER_UUID_V7))).toBe(false);
  });

  it('metne cevrildiginde ham degeri verir', () => {
    expect(String(UserId.create(VALID_UUID_V7))).toBe(VALID_UUID_V7);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = UserId.create(VALID_UUID_V7);

    expect(() => {
      (id as { value: string }).value = OTHER_UUID_V7;
    }).toThrow(TypeError);
  });
});
