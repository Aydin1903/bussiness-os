import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ContactDirectory } from '../../crm/crm.public';
import { Appointment, type AppointmentFields } from '../domain/appointment.entity';
import {
  AppointmentContactNotFoundError,
  AppointmentNotFoundError,
} from '../domain/appointments.error';
import { type AppointmentRepository } from './appointment.repository.port';
import { AppointmentUseCases } from './appointment.use-cases';

/**
 * `AppointmentUseCases`.
 *
 * CRUD'un kendisi `CategoryUseCases`/`ProjectUseCases` ile ayni sekildedir ve
 * orada kanitlandi; buradaki testler bu modulun KENDINE OZGU iddialarina
 * odaklanir:
 *
 *   1. "bulunamadi" YAZMA YAPMADAN 404'e duser,
 *   2. `0` silinen satir 404'tur (kayit yok VE baska tenant'in — ayirt edilmez),
 *   3. ⚠️ liste filtreleri porta OLDUGU GIBI gecer — ozellikle `to`nun HARIC
 *      sinir olmasi, cunku bu, onceki uc modulden SAPAN tek davranistir,
 *   4. ⚠️ SLICE 2: cross-modul referansin UC davranisi — goremedigin kisiye
 *      baglayamama, ad cozme, ve izinsiz cagirana ADIN SIZDIRILMAMASI.
 */

const NOW = new Date('2026-08-12T09:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const CONTACT = '018f3a2b-7c4d-7e1f-9c4d-0000000000e1';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function fields(overrides: Partial<AppointmentFields> = {}): AppointmentFields {
  return {
    scheduledAt: new Date('2026-08-20T14:30:00.000Z'),
    durationMinutes: 30,
    status: 'scheduled',
    crmContactId: null,
    ...overrides,
  };
}

function existing(overrides: Partial<AppointmentFields> = {}): Appointment {
  return Appointment.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

function build(
  overrides: {
    found?: Appointment | null;
    deleted?: number;
    /** Dizinin donecegi harita — BOS harita "goremiyorsun" demektir. */
    contactNames?: ReadonlyMap<string, string>;
    listItems?: Appointment[];
  } = {},
) {
  const save = vi.fn<AppointmentRepository['save']>().mockResolvedValue(undefined);
  const findById = vi
    .fn<AppointmentRepository['findById']>()
    .mockResolvedValue(overrides.found === undefined ? existing() : overrides.found);
  const list = vi
    .fn<AppointmentRepository['list']>()
    .mockResolvedValue({ items: overrides.listItems ?? [existing()], total: 1 });
  const deleteById = vi
    .fn<AppointmentRepository['deleteById']>()
    .mockResolvedValue(overrides.deleted ?? 1);

  const findNames = vi
    .fn<ContactDirectory['findNames']>()
    .mockResolvedValue(overrides.contactNames ?? new Map());

  const useCases = new AppointmentUseCases({
    repository: { save, findById, list, deleteById },
    contactDirectory: { findNames },
    transactionManager,
    idGenerator,
    clock,
  });

  return { useCases, save, findById, list, deleteById, findNames };
}

describe('AppointmentUseCases — olusturma', () => {
  it('randevuyu kaydeder ve durumunu doner', async () => {
    const { useCases, save } = build();

    const state = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      fields: fields(),
    });

    expect(state).toMatchObject({ id: ID, durationMinutes: 30, status: 'scheduled' });
    // ⚠️ Kaydi KIM girdi bilgisi yaziliyor — ama bu bir DENETIM IZI DEGILDIR
    // (ADR-0035 §5): saati kimin DEGISTIRDIGI sorulamaz.
    expect(state.createdByUserId).toBe(USER);
    expect(save).toHaveBeenCalledOnce();
  });

  it('GECERSIZ alan veritabanina HIC gitmez', async () => {
    // Entity ONCE kuruluyor: dogrulama bir veritabani sorgusu ACMADAN patlar.
    const { useCases, save } = build();

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        fields: fields({ durationMinutes: 0 }),
      }),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('kisisiz randevuda dizin HIC CAGRILMAZ', async () => {
    // `null` mesrudur (ic toplanti, ilk kez gelen musteri) ve bos yere bir
    // cross-modul cagrisi acmak gereksiz bir gidis-donus olurdu.
    const { useCases, findNames } = build();

    await useCases.create({ tenantId: TENANT, userId: USER, role: 'owner', fields: fields() });

    expect(findNames).not.toHaveBeenCalled();
  });
});

describe('AppointmentUseCases — cross-modul referans (ADR-0035 §4)', () => {
  it('⚠️ GOREMEDIGI kisiye randevu BAGLAYAMAZ — ve yazma YAPILMAZ', async () => {
    // Dizin bos harita donduruyor. UC SEBEP AYIRT EDILMEZ: kisi yok, baska
    // tenant'in, ya da cagiran `contact:read` tasimiyor. Ucu de ayni hatayi
    // verir — ayirmak, reddin sebebinden o kisinin VAR OLDUGUNU cikarilabilmesi
    // demekti.
    const { useCases, save } = build({ contactNames: new Map() });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'viewer',
        fields: fields({ crmContactId: CONTACT }),
      }),
    ).rejects.toThrow(AppointmentContactNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });

  it('GORDUGU kisiye baglayabilir', async () => {
    const { useCases, save, findNames } = build({
      contactNames: new Map([[CONTACT, 'Ahmet Yilmaz']]),
    });

    const state = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      fields: fields({ crmContactId: CONTACT }),
    });

    expect(state.crmContactId).toBe(CONTACT);
    // ⚠️ ROL dizine ACIKCA gecirilir: izin kapisi dizinin ICINDE calisir.
    expect(findNames).toHaveBeenCalledWith({ ids: [CONTACT], role: 'owner' });
    expect(save).toHaveBeenCalledOnce();
  });

  it('listede kisi adi COZULUR', async () => {
    const { useCases } = build({
      listItems: [existing({ crmContactId: CONTACT })],
      contactNames: new Map([[CONTACT, 'Ahmet Yilmaz']]),
    });

    const page = await useCases.list({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
      role: 'owner',
    });

    expect(page.items[0]?.contactName).toBe('Ahmet Yilmaz');
  });

  it('⚠️ IZINSIZ cagirana AD SIZDIRILMAZ ama RANDEVU GORUNUR', async () => {
    // Dizin bos harita donuyor (`contact:read` yok). Randevunun KENDISI yine
    // listelenir — `appointment:read` dort rolde de var. Gizlenen sey yalnizca
    // CRM'e ait AD'dir.
    const { useCases } = build({
      listItems: [existing({ crmContactId: CONTACT })],
      contactNames: new Map(),
    });

    const page = await useCases.list({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
      role: 'viewer',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.contactName).toBeNull();
    // ⚠️ Ham isaretci YINE DONER: silinmis/izinsiz ayrimi yapilamaz ve arayuz
    // `contactName: null` gorunce hicbir sey yazmaz.
    expect(page.items[0]?.crmContactId).toBe(CONTACT);
  });

  it('SARKAN isaretci listeyi BOZMAZ — satir dusmez, ad null olur', async () => {
    // Silinmis kisi: id satirda kalir, dizin onu bulamaz. ADR-0035 §4 —
    // veri bozulmasi degildir, her okumada tespit edilir.
    const { useCases } = build({
      listItems: [existing({ crmContactId: CONTACT })],
      contactNames: new Map(),
    });

    const page = await useCases.list({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
      role: 'owner',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.contactName).toBeNull();
  });

  it('kisisiz satirlar icin dizine BOS dizi gider — N+1 yok, tek cagri', async () => {
    const { useCases, findNames } = build({ listItems: [existing(), existing()] });

    await useCases.list({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
      role: 'owner',
    });

    expect(findNames).toHaveBeenCalledOnce();
    expect(findNames).toHaveBeenCalledWith({ ids: [], role: 'owner' });
  });

  it('guncellemede kisi GONDERILMEDIYSE dizin CAGRILMAZ', async () => {
    // ⚠️ Mevcut (belki SARKAN) bir isaretciyi her guncellemede yeniden
    // dogrulamak, silinmis bir kisiye bagli randevunun SAATINI degistirmeyi
    // imkansiz kilardi.
    const { useCases, findNames, save } = build({ found: existing({ crmContactId: CONTACT }) });

    await useCases.update({ id: ID, role: 'owner', changes: { status: 'completed' } });

    expect(findNames).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it('guncellemede `null` BAGLANTIYI KALDIRIR ve dogrulama ISTEMEZ', async () => {
    const { useCases, findNames, save } = build({ found: existing({ crmContactId: CONTACT }) });

    const state = await useCases.update({ id: ID, role: 'owner', changes: { crmContactId: null } });

    expect(state.crmContactId).toBeNull();
    expect(findNames).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it('guncellemede GOREMEDIGI kisiye baglamak REDDEDILIR ve yazma YAPILMAZ', async () => {
    const { useCases, save } = build({ contactNames: new Map() });

    await expect(
      useCases.update({ id: ID, role: 'viewer', changes: { crmContactId: CONTACT } }),
    ).rejects.toThrow(AppointmentContactNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('AppointmentUseCases — listeleme', () => {
  it('⚠️ FILTRELERI PORTA OLDUGU GIBI gecer — `to` HARIC bir sinirdir', async () => {
    // Bu iddia dar gorunur ama bu modulun onceki uc modulden SAPAN tek okuma
    // davranisini kilitler: sinirlar `date` degil AN, ve `to` DAHIL DEGIL.
    // `lte`ye donulseydi haftalik gridde sinirdaki bir randevu IKI HAFTADA DA
    // gorunurdu ve cift sayim SESSIZ olurdu.
    const { useCases, list } = build();
    const from = new Date('2026-08-17T00:00:00.000Z');
    const to = new Date('2026-08-24T00:00:00.000Z');

    const page = await useCases.list({
      limit: 50,
      offset: 0,
      from,
      to,
      status: 'scheduled',
      role: 'owner',
    });

    // ⚠️ `role` PORTA GECMEZ: repository yetki bilmez, yalnizca veri dondurur.
    // Bu iddia dar ama degerli — nesneyi oldugu gibi gecirmek DERLENIRDI.
    expect(list).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      from,
      to,
      status: 'scheduled',
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(ID);
  });

  it('filtresiz cagri `null` gecirir — `undefined` DEGIL', async () => {
    const { useCases, list } = build();

    await useCases.list({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
      role: 'owner',
    });

    expect(list).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      from: null,
      to: null,
      status: null,
    });
  });
});

describe('AppointmentUseCases — guncelleme', () => {
  it('durum gecisini kaydeder', async () => {
    const { useCases, save } = build();

    const state = await useCases.update({
      id: ID,
      role: 'owner',
      changes: { status: 'completed' },
    });

    expect(state.status).toBe('completed');
    expect(state.updatedAt).toEqual(NOW);
    expect(save).toHaveBeenCalledOnce();
  });

  it('kayit YOKSA 404 hatasi verir ve YAZMA YAPMAZ', async () => {
    const { useCases, save } = build({ found: null });

    await expect(
      useCases.update({ id: ID, role: 'owner', changes: { status: 'completed' } }),
    ).rejects.toThrow(AppointmentNotFoundError);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('AppointmentUseCases — silme', () => {
  it('silinen satir YOKSA 404 hatasi verir', async () => {
    // `0` iki anlama gelir ve AYIRT EDILMEZ: kayit yok, ya da baska tenant'in
    // (RLS silmeyi sessizce kapsam disi birakti). Ikisi de 404 — ayirmak bir
    // id'nin baska bir tenant'ta VAR OLDUGUNU sizdirirdi.
    const { useCases } = build({ deleted: 0 });

    await expect(useCases.delete(ID)).rejects.toThrow(AppointmentNotFoundError);
  });

  it('silinen satir VARSA hata vermez', async () => {
    const { useCases, deleteById } = build({ deleted: 1 });

    await expect(useCases.delete(ID)).resolves.toBeUndefined();
    expect(deleteById).toHaveBeenCalledWith(ID);
  });
});
