import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { Appointment } from '../domain/appointment.entity';
import { AppointmentNotFoundError } from '../domain/appointments.error';
import { type AppointmentRepository } from './appointment.repository.port';
import { AppointmentUseCases } from './appointment.use-cases';

/**
 * `AppointmentUseCases`.
 *
 * CRUD'un kendisi `CategoryUseCases`/`ProjectUseCases` ile ayni sekildedir ve
 * orada kanitlandi; buradaki testler bu slice'in KENDINE OZGU iddialarina
 * odaklanir:
 *
 *   1. "bulunamadi" YAZMA YAPMADAN 404'e duser,
 *   2. `0` silinen satir 404'tur (kayit yok VE baska tenant'in — ayirt edilmez),
 *   3. ⚠️ liste filtreleri porta OLDUGU GIBI gecer — ozellikle `to`nun HARIC
 *      sinir olmasi, cunku bu, onceki uc modulden SAPAN tek davranistir.
 */

const NOW = new Date('2026-08-12T09:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function existing(): Appointment {
  return Appointment.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: {
      scheduledAt: new Date('2026-08-20T14:30:00.000Z'),
      durationMinutes: 30,
      status: 'scheduled',
    },
    now: NOW,
  });
}

function build(overrides: { found?: Appointment | null; deleted?: number } = {}) {
  const save = vi.fn<AppointmentRepository['save']>().mockResolvedValue(undefined);
  const findById = vi
    .fn<AppointmentRepository['findById']>()
    .mockResolvedValue(overrides.found === undefined ? existing() : overrides.found);
  const list = vi
    .fn<AppointmentRepository['list']>()
    .mockResolvedValue({ items: [existing()], total: 1 });
  const deleteById = vi
    .fn<AppointmentRepository['deleteById']>()
    .mockResolvedValue(overrides.deleted ?? 1);

  const useCases = new AppointmentUseCases({
    repository: { save, findById, list, deleteById },
    transactionManager,
    idGenerator,
    clock,
  });

  return { useCases, save, findById, list, deleteById };
}

describe('AppointmentUseCases — olusturma', () => {
  it('randevuyu kaydeder ve durumunu doner', async () => {
    const { useCases, save } = build();

    const state = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      fields: {
        scheduledAt: new Date('2026-08-20T14:30:00.000Z'),
        durationMinutes: 30,
        status: 'scheduled',
      },
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
        fields: {
          scheduledAt: new Date('2026-08-20T14:30:00.000Z'),
          durationMinutes: 0,
          status: 'scheduled',
        },
      }),
    ).rejects.toThrow();
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

    const page = await useCases.list({ limit: 50, offset: 0, from, to, status: 'scheduled' });

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

    await useCases.list({ limit: 50, offset: 0, from: null, to: null, status: null });

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

    const state = await useCases.update({ id: ID, changes: { status: 'completed' } });

    expect(state.status).toBe('completed');
    expect(state.updatedAt).toEqual(NOW);
    expect(save).toHaveBeenCalledOnce();
  });

  it('kayit YOKSA 404 hatasi verir ve YAZMA YAPMAZ', async () => {
    const { useCases, save } = build({ found: null });

    await expect(useCases.update({ id: ID, changes: { status: 'completed' } })).rejects.toThrow(
      AppointmentNotFoundError,
    );
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
