import { describe, expect, it } from 'vitest';

import { MembershipId } from './membership-id.value-object';
import { InvalidMembershipIdError } from './membership.error';

const VALID_UUID_V7 = '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b';
const OTHER_UUID_V7 = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';

describe('MembershipId', () => {
  it('gecerli bir UUIDv7 ile olusturulabilir', () => {
    expect(MembershipId.create(VALID_UUID_V7).value).toBe(VALID_UUID_V7);
  });

  it('buyuk harfli yazimi kucuk harfe normalize eder', () => {
    expect(MembershipId.create(VALID_UUID_V7.toUpperCase()).value).toBe(VALID_UUID_V7);
  });

  it('UUIDv4 verildiginde olusturmayi reddeder', () => {
    expect(() => MembershipId.create('018f3a2b-7c4d-4e1f-8a2b-3c4d5e6f7a8b')).toThrow(
      InvalidMembershipIdError,
    );
  });

  it('UUID olmayan metni reddeder', () => {
    expect(() => MembershipId.create('uyelik-1')).toThrow(InvalidMembershipIdError);
  });

  it('ayni degeri tasiyan iki nesneyi esit sayar', () => {
    expect(MembershipId.create(VALID_UUID_V7).equals(MembershipId.create(VALID_UUID_V7))).toBe(
      true,
    );
  });

  it('farkli degerleri tasiyan iki nesneyi esit saymaz', () => {
    expect(MembershipId.create(VALID_UUID_V7).equals(MembershipId.create(OTHER_UUID_V7))).toBe(
      false,
    );
  });

  it('metne cevrildiginde ham degeri verir', () => {
    expect(String(MembershipId.create(VALID_UUID_V7))).toBe(VALID_UUID_V7);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const id = MembershipId.create(VALID_UUID_V7);

    expect(() => {
      (id as { value: string }).value = OTHER_UUID_V7;
    }).toThrow(TypeError);
  });
});
