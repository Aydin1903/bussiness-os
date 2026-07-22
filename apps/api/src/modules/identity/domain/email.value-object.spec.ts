import { describe, expect, it } from 'vitest';

import { Email } from './email.value-object';
import { InvalidEmailError } from './identity.error';

describe('Email — olusturma ve normalizasyon', () => {
  it('gecerli bir adresle olusturulabilir', () => {
    expect(Email.create('user@example.com').value).toBe('user@example.com');
  });

  it('buyuk harfleri kucuk harfe normalize eder', () => {
    expect(Email.create('User@Example.COM').value).toBe('user@example.com');
  });

  it('bastaki ve sondaki bosluklari temizler', () => {
    expect(Email.create('  user@example.com  ').value).toBe('user@example.com');
  });

  it('Unicode uyumluluk bicimini (NFKC) uygular', () => {
    // 'ﬁ' (U+FB01 ligature) NFKC altinda 'fi'ye iner.
    expect(Email.create('ﬁle@example.com').value).toBe('file@example.com');
  });

  it('nokta normalizasyonu YAPMAZ (a.b ile ab ayri adreslerdir)', () => {
    // AUTH_ARCHITECTURE 8.1: Gmail'e ozgu davranis genellestirilmez.
    expect(Email.create('a.b@example.com').value).toBe('a.b@example.com');
  });

  it('arti (+) etiketini KORUR', () => {
    expect(Email.create('user+tag@example.com').value).toBe('user+tag@example.com');
  });
});

describe('Email — reddedilen girdiler', () => {
  it('bos degeri reddeder', () => {
    expect(() => Email.create('')).toThrow(InvalidEmailError);
  });

  it('yalnizca bosluktan olusan degeri reddeder', () => {
    expect(() => Email.create('   ')).toThrow(InvalidEmailError);
  });

  it('@ icermeyen degeri reddeder', () => {
    expect(() => Email.create('userexample.com')).toThrow(InvalidEmailError);
  });

  it('birden fazla @ iceren degeri reddeder', () => {
    expect(() => Email.create('user@@example.com')).toThrow(InvalidEmailError);
  });

  it('alan adinda nokta olmayan degeri reddeder', () => {
    expect(() => Email.create('user@localhost')).toThrow(InvalidEmailError);
  });

  it('bosluk iceren degeri reddeder', () => {
    expect(() => Email.create('us er@example.com')).toThrow(InvalidEmailError);
  });

  it('254 karakteri asan degeri reddeder', () => {
    const local = 'a'.repeat(250);
    expect(() => Email.create(`${local}@example.com`)).toThrow(InvalidEmailError);
  });
});

describe('Email — deger semantigi', () => {
  it('ayni kanonik adresi tasiyan iki nesneyi esit sayar', () => {
    expect(Email.create('User@Example.com').equals(Email.create('user@example.com'))).toBe(true);
  });

  it('farkli adresleri esit saymaz', () => {
    expect(Email.create('a@example.com').equals(Email.create('b@example.com'))).toBe(false);
  });

  it('metne cevrildiginde kanonik degeri verir', () => {
    expect(String(Email.create('User@Example.com'))).toBe('user@example.com');
  });

  it('olusturulduktan sonra degistirilemez', () => {
    const email = Email.create('user@example.com');

    expect(() => {
      (email as { value: string }).value = 'other@example.com';
    }).toThrow(TypeError);
  });
});
