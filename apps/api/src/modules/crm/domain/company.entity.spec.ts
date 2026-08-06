import { describe, expect, it } from 'vitest';

import { Company } from './company.entity';
import { BlankCompanyNameError, InvalidCrmTimestampError } from './crm.error';

const NOW = new Date('2026-08-07T10:00:00.000Z');
const LATER = new Date('2026-08-07T11:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';

function create(name = 'Acme Tekstil') {
  return Company.create({
    id: ID,
    tenantId: TENANT,
    fields: { name, industry: 'Tekstil', email: null, phone: null, website: null },
    now: NOW,
  });
}

describe('Company — olusturma', () => {
  it('adin bosluklarini kirpar', () => {
    expect(create('  Acme  ').toState().name).toBe('Acme');
  });

  it('BOS ad reddedilir', () => {
    expect(() => create('   ')).toThrow(BlankCompanyNameError);
  });

  it('bos dize opsiyonel alanlarda `null` olur', () => {
    // "Girilmedi" ile "bos girildi" ayni seydir; ikisini ayirmak sorgulari
    // gereksizce zorlastirir.
    const company = Company.create({
      id: ID,
      tenantId: TENANT,
      fields: { name: 'Acme', industry: '  ', email: '', phone: null, website: null },
      now: NOW,
    });

    expect(company.toState().industry).toBeNull();
    expect(company.toState().email).toBeNull();
  });

  it('createdAt ve updatedAt esit baslar', () => {
    const state = create().toState();
    expect(state.updatedAt).toEqual(state.createdAt);
  });
});

describe('Company — kismi guncelleme (PATCH semantigi)', () => {
  it('VERILMEYEN alana DOKUNMAZ', () => {
    const updated = create().update({ name: 'Acme A.S.' }, LATER).toState();

    expect(updated.name).toBe('Acme A.S.');
    // `PUT` olsaydi bu alan sessizce null'lanirdi — PATCH secmenin sebebi bu.
    expect(updated.industry).toBe('Tekstil');
  });

  it('`null` gonderilen alani TEMIZLER', () => {
    expect(create().update({ industry: null }, LATER).toState().industry).toBeNull();
  });

  it('`undefined` ile `null` AYIRT EDILIR', () => {
    const base = create();
    expect(base.update({ industry: undefined }, LATER).toState().industry).toBe('Tekstil');
    expect(base.update({ industry: null }, LATER).toState().industry).toBeNull();
  });

  it('BOS ada guncelleme reddedilir', () => {
    expect(() => create().update({ name: '  ' }, LATER)).toThrow(BlankCompanyNameError);
  });

  it('updatedAt ilerler, createdAt SABIT kalir', () => {
    const state = create().update({ name: 'Yeni' }, LATER).toState();
    expect(state.updatedAt).toEqual(LATER);
    expect(state.createdAt).toEqual(NOW);
  });
});

describe('Company — kaliciliktan yukleme', () => {
  it('updatedAt < createdAt REDDEDILIR (bozuk satir sessizce gecmez)', () => {
    expect(() =>
      Company.fromPersistence({
        id: ID,
        tenantId: TENANT,
        name: 'Acme',
        industry: null,
        email: null,
        phone: null,
        website: null,
        createdAt: LATER,
        updatedAt: NOW,
      }),
    ).toThrow(InvalidCrmTimestampError);
  });
});
