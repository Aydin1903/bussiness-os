import { describe, expect, it } from 'vitest';

import { Project } from './project.entity';
import {
  BlankProjectNameError,
  InvalidProjectStatusError,
  InvalidProjectsTimestampError,
  ProjectDueBeforeStartError,
} from './projects.error';

const NOW = new Date('2026-08-10T10:00:00.000Z');
const LATER = new Date('2026-08-10T11:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';

function create(overrides: Partial<Parameters<typeof Project.create>[0]['fields']> = {}) {
  return Project.create({
    id: ID,
    tenantId: TENANT,
    fields: {
      name: 'Web sitesi yenileme',
      status: 'planning',
      description: 'Kurumsal site',
      startedOn: null,
      dueOn: null,
      companyId: null,
      ...overrides,
    },
    now: NOW,
  });
}

const COMPANY = '018f3a2b-7c4d-7e1f-8a2b-0000000000ff';

describe('Project — olusturma', () => {
  it('adin bosluklarini kirpar', () => {
    expect(create({ name: '  Web sitesi  ' }).toState().name).toBe('Web sitesi');
  });

  it('BOS ad reddedilir', () => {
    expect(() => create({ name: '   ' })).toThrow(BlankProjectNameError);
  });

  it('bos dize opsiyonel alanda `null` olur', () => {
    expect(create({ description: '  ' }).toState().description).toBeNull();
  });

  it('statusChangedAt, createdAt ve updatedAt esit baslar', () => {
    const state = create().toState();
    expect(state.updatedAt).toEqual(state.createdAt);
    expect(state.statusChangedAt).toEqual(state.createdAt);
  });

  it('companyId `null` olabilir — IC PROJE mesrudur', () => {
    // ADR-0033 §2: her proje bir musteriye ait olmak zorunda DEGIL.
    expect(create().toState().companyId).toBeNull();
  });

  it('companyId SLICE 4 TEN ITIBAREN yazilabiliyor', () => {
    // ⚠️ Bu test Slice 1'de TERSINI iddia ediyordu ("her zaman null"), cunku o
    // gun API `companyId` kabul etmiyordu: dogrulamasi icin gereken
    // `crm.public.ts` henuz yoktu. Iddia bilerek DEGISTIRILDI — kilitlenen sey
    // artik ertelemenin kendisi degil, referansin tasindigi.
    //
    // VARLIK kontrolu burada DEGIL: bir veritabani sorgusu ister ve `domain`
    // katmani framework'suzdur. Entity isaretciyi yalnizca TASIR.
    expect(create({ companyId: COMPANY }).toState().companyId).toBe(COMPANY);
  });

  it('bitis baslangictan ONCE olamaz', () => {
    expect(() => create({ startedOn: '2026-09-01', dueOn: '2026-08-01' })).toThrow(
      ProjectDueBeforeStartError,
    );
  });

  it('AYNI GUN baslayip biten proje gecerlidir', () => {
    expect(create({ startedOn: '2026-08-10', dueOn: '2026-08-10' }).toState().dueOn).toBe(
      '2026-08-10',
    );
  });

  it('TEK BASINA bir bitis tarihi gecerlidir', () => {
    // "Cuma'ya kadar, ne zaman basladigi belirsiz" mesru bir durumdur; kisit
    // yalnizca IKISI DE doluyken calisir.
    expect(create({ startedOn: null, dueOn: '2026-08-01' }).toState().dueOn).toBe('2026-08-01');
  });
});

describe('Project — kismi guncelleme (PATCH semantigi)', () => {
  it('VERILMEYEN alana DOKUNMAZ', () => {
    const updated = create().update({ name: 'Yeni ad' }, LATER).toState();

    expect(updated.name).toBe('Yeni ad');
    // `PUT` olsaydi bu alan sessizce null'lanirdi — PATCH secmenin sebebi bu.
    expect(updated.description).toBe('Kurumsal site');
  });

  it('`undefined` ile `null` AYIRT EDILIR', () => {
    const base = create();
    expect(base.update({ description: undefined }, LATER).toState().description).toBe(
      'Kurumsal site',
    );
    expect(base.update({ description: null }, LATER).toState().description).toBeNull();
  });

  it('GECERSIZ durum reddedilir', () => {
    // @ts-expect-error — birlesim tipi disinda bir deger; calisma zamaninda da
    // reddedilmeli, cunku bu yol elle SQL ya da bozuk bir satirla da tetiklenir.
    expect(() => create().update({ status: 'arsivlendi' }, LATER)).toThrow(
      InvalidProjectStatusError,
    );
  });

  it('GERI GIDIS SERBEST — tamamlanan proje yeniden acilabilir', () => {
    // Kisitlayici bir durum makinesi YOK (ADR-0033 §5): engellemek kullaniciyi
    // durumu hic guncellememeye iter ve AI bayat veriyle cevap verir.
    const completed = create({ status: 'completed' });
    expect(completed.update({ status: 'in_progress' }, LATER).toState().status).toBe('in_progress');
  });

  it('statusChangedAt GERCEK degisimde ilerler', () => {
    const state = create({ status: 'planning' }).update({ status: 'in_progress' }, LATER).toState();
    expect(state.statusChangedAt).toEqual(LATER);
  });

  it('AYNI durumu tekrar gonderen PATCH statusChangedAt SIFIRLAMAZ', () => {
    // Bu test bir SESSIZ HATAYI bekliyor: no-op bir guncelleme "bu proje 40
    // gundur ayni durumda" sinyalini silebilseydi, Slice 4un yapisal katkicisi
    // AIa yanlis bir "her sey yolunda" tablosu gosterirdi.
    const state = create({ status: 'in_progress' })
      .update({ status: 'in_progress', name: 'Yeni ad' }, LATER)
      .toState();

    expect(state.statusChangedAt).toEqual(NOW);
    expect(state.updatedAt).toEqual(LATER);
  });

  it('guncellemede de bitis baslangictan once olamaz', () => {
    const started = create({ startedOn: '2026-09-01' });
    expect(() => started.update({ dueOn: '2026-08-01' }, LATER)).toThrow(
      ProjectDueBeforeStartError,
    );
  });

  it('baslangici ILERI tasimak, mevcut bitisi gecersiz kilarsa REDDEDILIR', () => {
    // Kontrol yalnizca DEGISEN alana degil, SONUC durumuna bakar.
    const project = create({ startedOn: '2026-08-01', dueOn: '2026-08-15' });
    expect(() => project.update({ startedOn: '2026-09-01' }, LATER)).toThrow(
      ProjectDueBeforeStartError,
    );
  });

  it('updatedAt ilerler, createdAt SABIT kalir', () => {
    const state = create().update({ name: 'Yeni' }, LATER).toState();
    expect(state.updatedAt).toEqual(LATER);
    expect(state.createdAt).toEqual(NOW);
  });

  it('companyId BAGLANABILIR ve `null` ile KOPARILABILIR', () => {
    // Bir projeyi ic projeye cevirmek mesru bir islemdir; `undefined` ile
    // ayrimi PATCH'in butun sebebi.
    const internal = create();
    expect(internal.update({ companyId: COMPANY }, LATER).toState().companyId).toBe(COMPANY);

    const linked = create({ companyId: COMPANY });
    expect(linked.update({ companyId: null }, LATER).toState().companyId).toBeNull();
    expect(linked.update({ name: 'Yeni' }, LATER).toState().companyId).toBe(COMPANY);
  });
});

describe('Project — kaliciliktan yukleme', () => {
  it('updatedAt < createdAt REDDEDILIR (bozuk satir sessizce gecmez)', () => {
    expect(() =>
      Project.fromPersistence({
        id: ID,
        tenantId: TENANT,
        name: 'Web sitesi',
        status: 'planning',
        description: null,
        companyId: null,
        startedOn: null,
        dueOn: null,
        statusChangedAt: NOW,
        createdAt: LATER,
        updatedAt: NOW,
      }),
    ).toThrow(InvalidProjectsTimestampError);
  });

  it('SARKAN companyId oldugu gibi tasinir — hata DEGILDIR', () => {
    // ADR-0033 §2(d): silinen bir sirketin id'si burada kalir ve bu veri
    // bozulmasi degildir (UUID yeniden kullanilmaz). Okuyan yol dayanikli olmak
    // zorundadir; entity onu reddetmez.
    const state = Project.fromPersistence({
      id: ID,
      tenantId: TENANT,
      name: 'Web sitesi',
      status: 'in_progress',
      description: null,
      companyId: '018f3a2b-7c4d-7e1f-8a2b-0000000000ff',
      startedOn: null,
      dueOn: null,
      statusChangedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }).toState();

    expect(state.companyId).toBe('018f3a2b-7c4d-7e1f-8a2b-0000000000ff');
  });
});
