import { describe, expect, it } from 'vitest';

import { InvalidLoginAttemptIdError } from './identity.error';
import { LoginAttemptId } from './login-attempt-id.value-object';

const VALID = '018f3a2b-7c4d-7e1f-8a2b-0000000000d1';
const OTHER = '018f3a2b-7c4d-7e1f-8a2b-0000000000d2';

describe('LoginAttemptId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(LoginAttemptId.create(VALID).value).toBe(VALID);
  });

  it('gecersiz id verildiginde kendi hatasini firlatir', () => {
    expect(() => LoginAttemptId.create('gecersiz')).toThrow(InvalidLoginAttemptIdError);
  });

  it('ayni degeri esit, farkli degeri esit degil sayar', () => {
    expect(LoginAttemptId.create(VALID).equals(LoginAttemptId.create(VALID))).toBe(true);
    expect(LoginAttemptId.create(VALID).equals(LoginAttemptId.create(OTHER))).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = LoginAttemptId.create(VALID);

    expect(() => {
      (id as { value: string }).value = OTHER;
    }).toThrow(TypeError);
  });
});
