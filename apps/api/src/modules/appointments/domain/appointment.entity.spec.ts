import { describe, expect, it } from 'vitest';

import {
  Appointment,
  CLOSED_APPOINTMENT_STATUSES,
  isAppointmentStatus,
  type AppointmentFields,
} from './appointment.entity';
import {
  InvalidAppointmentDurationError,
  InvalidAppointmentStatusError,
  InvalidAppointmentsTimestampError,
  InvalidScheduledAtError,
} from './appointments.error';

/**
 * `Appointment`.
 *
 * CRUD entity'sinin kendisi `Project`/`Category` ile ayni sekildedir ve orada
 * kanitlandi; buradaki testler bu modulun GERCEKTEN KENDINE OZGU seylerine
 * odaklanir (ADR-0035 §2):
 *
 *   1. `Invalid Date`in REDDEDILMESI — tipi `Date` oldugu icin sessizce
 *      veritabanina kadar gidebilecek TEK alan,
 *   2. surenin TAM SAYI ve POZITIF olmasi (`1.5` dakika diye bir sey yok),
 *   3. bitisin TURETILMESI (`ends_at` kolonu YOK),
 *   4. durum gecislerinin SERBEST olmasi — `no_show` -> `completed` dahil.
 */

const NOW = new Date('2026-08-12T09:00:00.000Z');
const LATER = new Date('2026-08-12T11:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';

const SCHEDULED_AT = new Date('2026-08-20T14:30:00.000Z');

function fields(overrides: Partial<AppointmentFields> = {}): AppointmentFields {
  return {
    scheduledAt: SCHEDULED_AT,
    durationMinutes: 30,
    status: 'scheduled',
    ...overrides,
  };
}

function create(overrides: Partial<AppointmentFields> = {}): Appointment {
  return Appointment.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('Appointment — olusturma', () => {
  it('alanlari ve zaman damgalarini kaydeder', () => {
    const state = create().toState();

    expect(state).toMatchObject({
      id: ID,
      tenantId: TENANT,
      createdByUserId: USER,
      scheduledAt: SCHEDULED_AT,
      durationMinutes: 30,
      status: 'scheduled',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('⚠️ INVALID DATE reddedilir — tipi `Date` oldugu icin sessizce gecerdi', () => {
    // `new Date('2026-02-31T99:00:00Z')` PATLAMAZ, `Invalid Date` doner ve tipi
    // hala `Date`tir. Kontrol edilmeseydi PostgreSQL onu reddeder ve kullanici
    // 422 yerine 500 alirdi.
    expect(() => create({ scheduledAt: new Date('gecersiz') })).toThrow(InvalidScheduledAtError);
  });

  it.each([0, -30, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'sure %s reddedilir — TAM SAYI ve POZITIF olmali',
    (durationMinutes) => {
      // ⚠️ `Number.isInteger` tek basina `0`i gecirirdi, `> 0` tek basina
      // `1.5`i gecirirdi; ucu birden (`NaN` dahil) tek bir yuklem kapatiyor.
      expect(() => create({ durationMinutes })).toThrow(InvalidAppointmentDurationError);
    },
  );

  it('taninmayan durum reddedilir', () => {
    expect(() => create({ status: 'postponed' as never })).toThrow(InvalidAppointmentStatusError);
  });
});

describe('Appointment — bitis TURETILIR (ADR-0035 §2d)', () => {
  it('bitis = baslangic + sure', () => {
    // `ends_at` KOLONU YOK: iki kolon tutulsaydi biri guncellenip digeri
    // unutuldugunda hata SESSIZ olurdu ve haftalik gridde UST USTE BINEN bir
    // blok cizilirdi.
    expect(create({ durationMinutes: 45 }).endsAt()).toEqual(new Date('2026-08-20T15:15:00.000Z'));
  });

  it('sure guncellenince bitis KENDILIGINDEN kayar', () => {
    const updated = create({ durationMinutes: 30 }).update({ durationMinutes: 90 }, LATER);

    expect(updated.endsAt()).toEqual(new Date('2026-08-20T16:00:00.000Z'));
  });
});

describe('Appointment — guncelleme', () => {
  it('gonderilmeyen alana DOKUNMAZ (PATCH, PUT degil)', () => {
    const state = create().update({ durationMinutes: 60 }, LATER).toState();

    expect(state).toMatchObject({
      scheduledAt: SCHEDULED_AT,
      durationMinutes: 60,
      status: 'scheduled',
      createdAt: NOW,
      updatedAt: LATER,
    });
  });

  it('⚠️ DURUM GECISLERI SERBEST — `no_show` -> `completed` MESRUDUR', () => {
    // Kisi bir saat gec geldi. Engellemek kullaniciyi yazilima YALAN SOYLEMEYE
    // iterdi: durumu hic guncellemez, veri bayatlar ve Slice 4'te AI "gelmedi
    // orani yuksek" der.
    const state = create({ status: 'no_show' }).update({ status: 'completed' }, LATER).toState();

    expect(state.status).toBe('completed');
  });

  it('guncellemede de alan kurallari calisir', () => {
    expect(() => create().update({ durationMinutes: 0 }, LATER)).toThrow(
      InvalidAppointmentDurationError,
    );
  });
});

describe('Appointment — kaliciliktan yukleme', () => {
  it('bozuk zaman damgasi sirasini reddeder', () => {
    expect(() =>
      Appointment.fromPersistence({
        id: ID,
        tenantId: TENANT,
        createdByUserId: USER,
        scheduledAt: SCHEDULED_AT,
        durationMinutes: 30,
        status: 'scheduled',
        createdAt: LATER,
        updatedAt: NOW,
      }),
    ).toThrow(InvalidAppointmentsTimestampError);
  });
});

describe('randevu durumu sozlugu', () => {
  it('yalnizca dort degeri tanir', () => {
    expect(isAppointmentStatus('scheduled')).toBe(true);
    expect(isAppointmentStatus('no_show')).toBe(true);
    expect(isAppointmentStatus('postponed')).toBe(false);
  });

  it('⚠️ `no_show` KAPANMIS sayilir — Slice 4 in yapisal katkicisi icin', () => {
    // Iptal bir HABERDIR, gelmemek bir KAYIPTIR; ikisi de "artik yaklasmiyor"
    // demektir. Sozlugu simdi yazmanin sebebi, bu ayrimin tam olarak Slice 4'te
    // unutulacak turden olmasidir.
    expect(CLOSED_APPOINTMENT_STATUSES).toEqual(['completed', 'cancelled', 'no_show']);
    expect(CLOSED_APPOINTMENT_STATUSES).not.toContain('scheduled');
  });
});
