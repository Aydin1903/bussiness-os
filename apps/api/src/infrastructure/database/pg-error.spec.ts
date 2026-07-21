import { describe, expect, it } from 'vitest';

import { PG_UNIQUE_VIOLATION, isPgError, pgErrorMatches } from './pg-error';

/** Drizzle'in gercek sarmalama bicimini taklit eder. */
function wrapped(inner: unknown): Error {
  return new Error('Failed query: insert into "platform"."tenants" ...', { cause: inner });
}

const uniqueViolation = Object.assign(
  new Error('duplicate key value violates unique constraint "tenants_slug_key"'),
  { code: PG_UNIQUE_VIOLATION, constraint: 'tenants_slug_key' },
);

describe('isPgError', () => {
  it('sarmalanmamis hatayi tanir', () => {
    expect(isPgError(uniqueViolation, PG_UNIQUE_VIOLATION, 'tenants_slug_key')).toBe(true);
  });

  it('Drizzle tarafindan SARMALANMIS hatayi tanir', () => {
    // Bu, yardimcinin var olma sebebi: ust seviyeye bakan bir kontrol
    // kisit ihlalini sessizce kacirirdi.
    expect(isPgError(wrapped(uniqueViolation), PG_UNIQUE_VIOLATION, 'tenants_slug_key')).toBe(true);
  });

  it('cok katmanli sarmalamayi cozer', () => {
    expect(isPgError(wrapped(wrapped(uniqueViolation)), PG_UNIQUE_VIOLATION)).toBe(true);
  });

  it('farkli kisit adini eslestirmez', () => {
    // Yanlis kisiti yakalayan bir ceviri, kullaniciya yanlis mesaj gosterir.
    expect(isPgError(wrapped(uniqueViolation), PG_UNIQUE_VIOLATION, 'memberships_pkey')).toBe(false);
  });

  it('kisit adi verilmezse yalnizca koda bakar', () => {
    expect(isPgError(wrapped(uniqueViolation), PG_UNIQUE_VIOLATION)).toBe(true);
  });

  it('farkli SQLSTATE kodunu eslestirmez', () => {
    expect(isPgError(wrapped(uniqueViolation), '23503')).toBe(false);
  });

  it('kod tasimayan hatayi eslestirmez', () => {
    expect(isPgError(new Error('sadece bir hata'), PG_UNIQUE_VIOLATION)).toBe(false);
  });

  it('null ve undefined ile cokmez', () => {
    expect(isPgError(null, PG_UNIQUE_VIOLATION)).toBe(false);
    expect(isPgError(undefined, PG_UNIQUE_VIOLATION)).toBe(false);
    expect(isPgError('metin', PG_UNIQUE_VIOLATION)).toBe(false);
  });

  it('DONGUSEL cause zincirinde sonsuz donguye girmez', () => {
    // Hata YOLUNDA olusan bir kilitlenme, en kotu anda gerceklesirdi.
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;

    expect(isPgError(cyclic, PG_UNIQUE_VIOLATION)).toBe(false);
  });
});

describe('pgErrorMatches', () => {
  it('sarmalanmis mesajda kalibi bulur', () => {
    const rls = new Error('new row violates row-level security policy for table "memberships"');

    expect(pgErrorMatches(wrapped(rls), /row-level security/i)).toBe(true);
  });

  it('eslesmeyen kalip icin false doner', () => {
    expect(pgErrorMatches(wrapped(new Error('baska bir sey')), /row-level security/i)).toBe(false);
  });

  it('null ile cokmez', () => {
    expect(pgErrorMatches(null, /row-level security/i)).toBe(false);
  });
});
