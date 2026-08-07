import { describe, expect, it } from 'vitest';

import {
  BlankOpportunityTitleError,
  CurrencyRequiredError,
  InvalidOpportunityStageError,
} from './crm.error';
import { Opportunity, type OpportunityFields } from './opportunity.entity';

const NOW = new Date('2026-08-07T10:00:00.000Z');
const LATER = new Date('2026-08-09T10:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000a';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const COMPANY = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';

function fields(overrides: Partial<OpportunityFields> = {}): OpportunityFields {
  return {
    title: 'Acme yillik sozlesme',
    stage: 'potential',
    estimatedValue: null,
    currency: null,
    nextFollowUpOn: null,
    contactId: null,
    ...overrides,
  };
}

function create(overrides: Partial<OpportunityFields> = {}) {
  return Opportunity.create({
    id: ID,
    tenantId: TENANT,
    companyId: COMPANY,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('Opportunity — olusturma', () => {
  it('varsayilan asama `potential`', () => {
    expect(create().toState().stage).toBe('potential');
  });

  it('BOS baslik reddedilir', () => {
    expect(() => create({ title: '  ' })).toThrow(BlankOpportunityTitleError);
  });

  it('GECERSIZ asama reddedilir', () => {
    // Tip sistemi derlemede korur; bu kontrol KALICILIKTAN ya da elle atilan
    // bir istekten gelen bozuk degeri yakalar.
    expect(() => create({ stage: 'arsivlendi' as never })).toThrow(InvalidOpportunityStageError);
  });

  it('stageChangedAt olusturmada NOW ile baslar', () => {
    expect(create().toState().stageChangedAt).toEqual(NOW);
  });
});

describe('Opportunity — tutar ve para birimi', () => {
  it('tutar varsa para birimi ZORUNLU', () => {
    // Birimsiz tutar toplamlari sessizce yanlis yapar.
    expect(() => create({ estimatedValue: '250000.00' })).toThrow(CurrencyRequiredError);
  });

  it('tutar + para birimi birlikte KABUL EDILIR', () => {
    const state = create({ estimatedValue: '250000.00', currency: 'TRY' }).toState();
    expect(state.estimatedValue).toBe('250000.00');
    expect(state.currency).toBe('TRY');
  });

  it('tutar YOKSA para birimi de gerekmez', () => {
    expect(create({ currency: null }).toState().currency).toBeNull();
  });

  it('guncellemede tutar eklenip para birimi verilmezse REDDEDILIR', () => {
    expect(() => create().update({ estimatedValue: '1000.00' }, LATER)).toThrow(
      CurrencyRequiredError,
    );
  });
});

describe('Opportunity — asama gecisleri SERBEST (ADR-0031 §2)', () => {
  it('ileri gecis calisir', () => {
    expect(create().update({ stage: 'proposal_sent' }, LATER).toState().stage).toBe(
      'proposal_sent',
    );
  });

  it('KAYBEDILDI -> GORUSULUYOR donusu MESRUDUR', () => {
    // B2B satista en sik eylemlerden biri: butce acilir, rakip teslim edemez,
    // karar verici degisir. Engellemek kullaniciyi asamayi hic guncellememeye
    // iter ve veri bayatlar.
    const lost = create({ stage: 'lost' });
    expect(lost.update({ stage: 'in_discussion' }, LATER).toState().stage).toBe('in_discussion');
  });

  it('KAZANILDI -> geri donus de mumkundur', () => {
    const won = create({ stage: 'won' });
    expect(won.update({ stage: 'proposal_sent' }, LATER).toState().stage).toBe('proposal_sent');
  });
});

describe('Opportunity — stageChangedAt yalnizca GERCEK degisimde ilerler', () => {
  it('asama DEGISINCE ilerler', () => {
    const state = create().update({ stage: 'in_discussion' }, LATER).toState();
    expect(state.stageChangedAt).toEqual(LATER);
  });

  it('AYNI asama tekrar gonderilince DOKUNULMAZ', () => {
    // Aksi halde "bu firsat 40 gundur ayni asamada" sinyali bir no-op
    // guncellemeyle SESSIZCE silinebilirdi — Slice 7'nin yapisal katkicisi
    // tam olarak o sinyali okuyacak.
    const state = create({ stage: 'in_discussion' })
      .update({ stage: 'in_discussion' }, LATER)
      .toState();

    expect(state.stageChangedAt).toEqual(NOW);
    // Ama `updatedAt` yine de ilerler: kayit gercekten guncellendi.
    expect(state.updatedAt).toEqual(LATER);
  });

  it('asamaya HIC dokunmayan guncelleme de sifirlamaz', () => {
    const state = create({ stage: 'proposal_sent' })
      .update({ title: 'Yeni baslik' }, LATER)
      .toState();
    expect(state.stageChangedAt).toEqual(NOW);
  });
});

describe('Opportunity — kismi guncelleme', () => {
  it('VERILMEYEN alana DOKUNMAZ', () => {
    const base = create({ nextFollowUpOn: '2026-08-12' });
    expect(base.update({ title: 'Yeni' }, LATER).toState().nextFollowUpOn).toBe('2026-08-12');
  });

  it('`null` gonderilen takip tarihini TEMIZLER', () => {
    const base = create({ nextFollowUpOn: '2026-08-12' });
    expect(base.update({ nextFollowUpOn: null }, LATER).toState().nextFollowUpOn).toBeNull();
  });
});
