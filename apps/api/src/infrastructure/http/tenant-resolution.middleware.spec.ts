import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import {
  extractTenantHint,
  getTenantHint,
  tenantResolutionMiddleware,
} from './tenant-resolution.middleware';

describe('extractTenantHint', () => {
  it('alt alan adindan tenant slug unu cikarir', () => {
    expect(extractTenantHint('acme.businessos.app')).toBe('acme');
  });

  it('port tasiyan host u cozer', () => {
    // Host basligi "acme.businessos.app:3001" bicimini alabilir.
    expect(extractTenantHint('acme.businessos.app:3001')).toBe('acme');
  });

  it('buyuk harfli host u normalize eder', () => {
    expect(extractTenantHint('ACME.BusinessOS.app')).toBe('acme');
  });

  it('bosluklari temizler', () => {
    expect(extractTenantHint('  acme.businessos.app  ')).toBe('acme');
  });

  it('apex alan adindan ipucu cikarmaz', () => {
    // Mobil ve sunucu-sunucu istemcileri buradan gelir; ipucu YOKLUGU
    // gecerli bir durumdur (8.2 adim 3).
    expect(extractTenantHint('businessos.app')).toBeUndefined();
  });

  it('yabanci alan adindan ipucu cikarmaz', () => {
    expect(extractTenantHint('acme.baska-site.com')).toBeUndefined();
  });

  it('kok alan adini son ek olarak taklit eden host u reddeder', () => {
    // "kotu-businessos.app" kok alan adiyla BITIYOR gibi gorunur ama
    // ".businessos.app" ile bitmez. Nokta kontrolu olmadan bu host
    // "kotu" tenant'ina cozulurdu.
    expect(extractTenantHint('kotu-businessos.app')).toBeUndefined();
  });

  it('cok seviyeli alt alan adini reddeder', () => {
    // "a.b.businessos.app" sessizce "a.b" olarak yorumlanmamali.
    expect(extractTenantHint('a.b.businessos.app')).toBeUndefined();
  });

  it.each(['www', 'api', 'app', 'admin', 'auth'])(
    'tenant a ait olmayan "%s" alt alan adindan ipucu cikarmaz',
    (label) => {
      expect(extractTenantHint(`${label}.businessos.app`)).toBeUndefined();
    },
  );

  it('bos veya tanimsiz host u reddeder', () => {
    expect(extractTenantHint(undefined)).toBeUndefined();
    expect(extractTenantHint('')).toBeUndefined();
  });
});

describe('tenantResolutionMiddleware', () => {
  function requestWith(host: string | undefined): Request {
    return { headers: { host } } as unknown as Request;
  }

  const response = {} as Response;

  it('bilinen host icin ipucunu istege ekler', () => {
    const request = requestWith('acme.businessos.app');
    let calledNext = false;

    tenantResolutionMiddleware(request, response, () => {
      calledNext = true;
    });

    expect(getTenantHint(request)).toBe('acme');
    expect(calledNext).toBe(true);
  });

  it('bilinmeyen host icin ipucu eklemez ama istegi durdurmaz', () => {
    const request = requestWith('businessos.app');
    let calledNext = false;

    tenantResolutionMiddleware(request, response, () => {
      calledNext = true;
    });

    expect(getTenantHint(request)).toBeUndefined();
    // Middleware HICBIR istegi reddetmez; reddetme yetkisi kimlik
    // dogrulamaya aittir.
    expect(calledNext).toBe(true);
  });

  it('istek nesnesine hicbir alan YAZMAZ', () => {
    // Ipucu WeakMap'te durur. Istek uzerinde "tenant" gorunumlu bir alan
    // olsaydi, birinin ona guvenip yetki kaynagi sanmasi kolaylasirdi.
    const request = requestWith('acme.businessos.app');

    tenantResolutionMiddleware(request, response, () => undefined);

    expect(Object.keys(request)).toEqual(['headers']);
  });

  it('ipucu bir tenant kimligi DEGILDIR — yalnizca slug metnidir', () => {
    // Bu test bir davranisi degil bir SOZLESMEYI sabitler: middleware
    // cozumleme yapmaz, veritabanina gitmez, tenant context kurmaz.
    // Donen sey Host'tan okunan ham etiketten ibarettir.
    const request = requestWith('acme.businessos.app');

    tenantResolutionMiddleware(request, response, () => undefined);

    expect(getTenantHint(request)).toBe('acme');
    expect(typeof getTenantHint(request)).toBe('string');
  });
});
