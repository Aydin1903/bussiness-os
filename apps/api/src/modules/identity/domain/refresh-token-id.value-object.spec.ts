import { describe, expect, it } from 'vitest';

import { InvalidRefreshTokenIdError } from './identity.error';
import { RefreshTokenId } from './refresh-token-id.value-object';

const VALID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a2';
const OTHER = '018f3a2b-7c4d-7e1f-8a2b-0000000000a3';

describe('RefreshTokenId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(RefreshTokenId.create(VALID).value).toBe(VALID);
  });

  it('gecersiz id verildiginde kendi hatasini firlatir', () => {
    expect(() => RefreshTokenId.create('gecersiz')).toThrow(InvalidRefreshTokenIdError);
  });

  it('ayni degeri esit, farkli degeri esit degil sayar', () => {
    expect(RefreshTokenId.create(VALID).equals(RefreshTokenId.create(VALID))).toBe(true);
    expect(RefreshTokenId.create(VALID).equals(RefreshTokenId.create(OTHER))).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = RefreshTokenId.create(VALID);

    expect(() => {
      (id as { value: string }).value = OTHER;
    }).toThrow(TypeError);
  });
});
