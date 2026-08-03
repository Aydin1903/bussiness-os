import { describe, expect, it } from 'vitest';

import { EmailVerificationCodeId } from './email-verification-code-id.value-object';
import { InvalidEmailVerificationCodeIdError } from './identity.error';

const VALID = '018f3a2b-7c4d-7e1f-8a2b-0000000000e1';
const OTHER = '018f3a2b-7c4d-7e1f-8a2b-0000000000e2';

describe('EmailVerificationCodeId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(EmailVerificationCodeId.create(VALID).value).toBe(VALID);
  });

  it('gecersiz id verildiginde kendi hatasini firlatir', () => {
    expect(() => EmailVerificationCodeId.create('gecersiz')).toThrow(
      InvalidEmailVerificationCodeIdError,
    );
  });

  it('UUIDv4 verildiginde reddeder', () => {
    expect(() => EmailVerificationCodeId.create('018f3a2b-7c4d-4e1f-8a2b-3c4d5e6f7a8b')).toThrow(
      InvalidEmailVerificationCodeIdError,
    );
  });

  it('ayni degeri esit, farkli degeri esit degil sayar', () => {
    expect(
      EmailVerificationCodeId.create(VALID).equals(EmailVerificationCodeId.create(VALID)),
    ).toBe(true);
    expect(
      EmailVerificationCodeId.create(VALID).equals(EmailVerificationCodeId.create(OTHER)),
    ).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = EmailVerificationCodeId.create(VALID);

    expect(() => {
      (id as { value: string }).value = OTHER;
    }).toThrow(TypeError);
  });
});
