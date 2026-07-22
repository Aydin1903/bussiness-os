import { describe, expect, it } from 'vitest';

import { InvalidIpAddressError } from './identity.error';
import { IpAddress } from './ip-address.value-object';

describe('IpAddress — kabul edilen', () => {
  it('IPv4 adresini kabul eder', () => {
    expect(IpAddress.create('203.0.113.7').value).toBe('203.0.113.7');
  });

  it('IPv6 adresini kabul eder', () => {
    expect(IpAddress.create('2001:db8::1').value).toBe('2001:db8::1');
  });

  it('IPv6 buyuk harfini kucuk harfe normalize eder', () => {
    expect(IpAddress.create('2001:DB8::AbCd').value).toBe('2001:db8::abcd');
  });

  it('bastaki/sondaki bosluklari temizler', () => {
    expect(IpAddress.create('  203.0.113.7  ').value).toBe('203.0.113.7');
  });
});

describe('IpAddress — reddedilen', () => {
  it('IP olmayan metni reddeder', () => {
    expect(() => IpAddress.create('not-an-ip')).toThrow(InvalidIpAddressError);
  });

  it('aralik disi IPv4 oktetini reddeder', () => {
    expect(() => IpAddress.create('999.999.999.999')).toThrow(InvalidIpAddressError);
  });

  it('bos degeri reddeder', () => {
    expect(() => IpAddress.create('')).toThrow(InvalidIpAddressError);
  });
});

describe('IpAddress — deger semantigi', () => {
  it('ayni adresi esit, farkli adresi esit degil sayar', () => {
    expect(IpAddress.create('203.0.113.7').equals(IpAddress.create('203.0.113.7'))).toBe(true);
    expect(IpAddress.create('203.0.113.7').equals(IpAddress.create('203.0.113.8'))).toBe(false);
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const ip = IpAddress.create('203.0.113.7');

    expect(() => {
      (ip as { value: string }).value = '0.0.0.0';
    }).toThrow(TypeError);
  });
});
