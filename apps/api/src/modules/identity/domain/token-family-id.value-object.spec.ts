import { describe, expect, it } from 'vitest';

import { InvalidTokenFamilyIdError } from './identity.error';
import { TokenFamilyId } from './token-family-id.value-object';

const VALID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const OTHER = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';

describe('TokenFamilyId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(TokenFamilyId.create(VALID).value).toBe(VALID);
  });

  it('gecersiz id verildiginde kendi hatasini firlatir', () => {
    expect(() => TokenFamilyId.create('gecersiz')).toThrow(InvalidTokenFamilyIdError);
  });

  it('ayni degeri esit, farkli degeri esit degil sayar', () => {
    expect(TokenFamilyId.create(VALID).equals(TokenFamilyId.create(VALID))).toBe(true);
    expect(TokenFamilyId.create(VALID).equals(TokenFamilyId.create(OTHER))).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = TokenFamilyId.create(VALID);

    expect(() => {
      (id as { value: string }).value = OTHER;
    }).toThrow(TypeError);
  });
});
