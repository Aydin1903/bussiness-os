import { describe, expect, it } from 'vitest';

import {
  BlankTaskTitleError,
  InvalidProjectsTimestampError,
  InvalidTaskStatusError,
} from './projects.error';
import { Task } from './task.entity';

const NOW = new Date('2026-08-10T10:00:00.000Z');
const LATER = new Date('2026-08-10T11:00:00.000Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const PROJECT = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

function create(
  overrides: Partial<Parameters<typeof Task.create>[0]['fields']> = {},
  projectId: string | null = PROJECT,
) {
  return Task.create({
    id: ID,
    tenantId: TENANT,
    projectId,
    fields: {
      title: 'Ana sayfayi yeniden tasarla',
      status: 'todo',
      dueOn: null,
      assigneeUserId: null,
      ...overrides,
    },
    now: NOW,
  });
}

describe('Task — olusturma', () => {
  it('basligin bosluklarini kirpar', () => {
    expect(create({ title: '  Ana sayfa  ' }).toState().title).toBe('Ana sayfa');
  });

  it('BOS baslik reddedilir', () => {
    expect(() => create({ title: '   ' })).toThrow(BlankTaskTitleError);
  });

  it('PROJESIZ gorev mesrudur — `projectId` null olabilir', () => {
    // ADR-0033 §3'un karakteristik karari: "faturayi gonder" gercek bir istir
    // ve bir proje degildir. Zorunlu kilmak sahte "Genel" projeleri uretirdi.
    expect(create({}, null).toState().projectId).toBeNull();
  });

  it('ATANMAMIS gorev mesrudur — `assigneeUserId` null olabilir', () => {
    expect(create().toState().assigneeUserId).toBeNull();
  });

  it('atanan kisi saklanir', () => {
    expect(create({ assigneeUserId: USER }).toState().assigneeUserId).toBe(USER);
  });

  it('createdAt ve updatedAt esit baslar', () => {
    const state = create().toState();
    expect(state.updatedAt).toEqual(state.createdAt);
  });

  it('GECERSIZ durum reddedilir', () => {
    // @ts-expect-error — birlesim tipi disinda bir deger.
    expect(() => create({ status: 'ertelendi' })).toThrow(InvalidTaskStatusError);
  });
});

describe('Task — kismi guncelleme (PATCH semantigi)', () => {
  it('VERILMEYEN alana DOKUNMAZ', () => {
    const base = create({ dueOn: '2026-09-01', assigneeUserId: USER });
    const updated = base.update({ title: 'Yeni baslik' }, LATER).toState();

    expect(updated.title).toBe('Yeni baslik');
    expect(updated.dueOn).toBe('2026-09-01');
    expect(updated.assigneeUserId).toBe(USER);
  });

  it('`assigneeUserId: null` atamayi KALDIRIR', () => {
    const assigned = create({ assigneeUserId: USER });
    expect(assigned.update({ assigneeUserId: null }, LATER).toState().assigneeUserId).toBeNull();
  });

  it('`undefined` ile `null` AYIRT EDILIR', () => {
    const base = create({ assigneeUserId: USER });
    expect(base.update({ assigneeUserId: undefined }, LATER).toState().assigneeUserId).toBe(USER);
    expect(base.update({ assigneeUserId: null }, LATER).toState().assigneeUserId).toBeNull();
  });

  it('`projectId` guncelleme ile DEGISMEZ', () => {
    // Gorevi baska projeye tasimak bir TASIMA islemidir (bkz. `Task` yorumu).
    // Tip seviyesinde de imkansiz; bu test KALICILIK davranisini kilitler.
    const moved = create().update({ title: 'Yeni' }, LATER).toState();
    expect(moved.projectId).toBe(PROJECT);
  });

  it('durum ilerletilebilir ve GERI ALINABILIR', () => {
    const done = create({ status: 'done' });
    expect(done.update({ status: 'todo' }, LATER).toState().status).toBe('todo');
  });

  it('BOS basliga guncelleme reddedilir', () => {
    expect(() => create().update({ title: '  ' }, LATER)).toThrow(BlankTaskTitleError);
  });

  it('updatedAt ilerler, createdAt SABIT kalir', () => {
    const state = create().update({ status: 'in_progress' }, LATER).toState();
    expect(state.updatedAt).toEqual(LATER);
    expect(state.createdAt).toEqual(NOW);
  });
});

describe('Task — kaliciliktan yukleme', () => {
  it('updatedAt < createdAt REDDEDILIR (bozuk satir sessizce gecmez)', () => {
    expect(() =>
      Task.fromPersistence({
        id: ID,
        tenantId: TENANT,
        projectId: PROJECT,
        title: 'Ana sayfa',
        status: 'todo',
        dueOn: null,
        assigneeUserId: null,
        createdAt: LATER,
        updatedAt: NOW,
      }),
    ).toThrow(InvalidProjectsTimestampError);
  });
});
