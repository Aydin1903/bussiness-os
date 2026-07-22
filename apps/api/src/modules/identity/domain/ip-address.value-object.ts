import { isIP } from 'node:net';

import { InvalidIpAddressError } from './identity.error';

/**
 * Bir istemci IP adresi (AUTH_ARCHITECTURE 14, ADR-0022).
 *
 * Kaba kuvvet korumasinda IP, iki katmanin sayac ANAHTARIDIR: katman 1
 * `(e-posta, IP)` ve katman 3 `IP`. Bu yuzden ciplak `string` degil tipli bir
 * deger: yanlislikla baska bir string ile karistirilmasi bir izolasyon/guvenlik
 * hatasi olurdu (DEVELOPMENT_RULES 2.4).
 *
 * `node:net`'in `isIP`'i ile dogrulanir — framework degil, Node standart
 * kutuphanesidir ve `isIP` saf bir string kontroludur (I/O yok, ARCHITECTURE 4
 * ile celismez). El yazimi bir IPv6 regex'inden hem daha dogru hem daha okunur.
 *
 * NORMALIZASYON: trim + lowercase. IPv6 hex'i buyuk/kucuk harfle yazilabilir;
 * kucuk harfe indirmezsek ayni adres iki farkli sayac anahtari uretir ve limit
 * atlatilabilir.
 *
 * NOT: `isIP` /64 gibi prefix'leri veya zone id'yi (`fe80::1%eth0`) kabul etmez.
 * ADR-0022 IPv6'da prefix bazli sayimi ileride degerlendirir; o geldiginde bu
 * VO genisletilir. Bugun tam adres sayilir.
 */
export class IpAddress {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static create(value: string): IpAddress {
    const normalized = value.trim().toLowerCase();
    if (isIP(normalized) === 0) {
      throw new InvalidIpAddressError(value);
    }
    return new IpAddress(normalized);
  }

  equals(other: IpAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
