import { describe, expect, it } from 'vitest';

import { InvalidLeaveDatesError, LeaveAlreadyDecidedError } from './hr.error';
import { LeaveRequest, type LeaveRequestFields } from './leave-request.entity';

const NOW = new Date('2026-08-24T09:00:00.000Z');
const LATER = new Date('2026-08-25T11:30:00.000Z');

function build(fields: Partial<LeaveRequestFields> = {}): LeaveRequest {
  return LeaveRequest.create({
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    employeeId: '33333333-3333-4333-8333-333333333333',
    requestedByUserId: '44444444-4444-4444-8444-444444444444',
    fields: { type: 'annual', startsOn: '2026-09-01', endsOn: '2026-09-05', ...fields },
    now: NOW,
  });
}

describe('LeaveRequest', () => {
  it('yeni talep her zaman `pending` dogar ve karar alanlari BOSTUR', () => {
    const state = build().toState();

    expect(state.status).toBe('pending');
    expect(state.decidedByUserId).toBeNull();
    expect(state.decidedAt).toBeNull();
  });

  /**
   * ⚠️ SAGLIK VERISI SINIRININ TIP SEVIYESINDEKI KILIDI (ADR-0043 §3).
   *
   * `LeaveType` birlesimi `sick`/`raporlu` ICERMEZ; bu test o listenin
   * genisletildigini fark etmek icindir. Liste bir gun sessizce buyurse bu
   * iddia kirmizi yanar.
   */
  it('izin turleri saglik ima eden bir kalem TASIMAZ', () => {
    const types = ['annual', 'unpaid', 'excuse', 'administrative'];

    for (const type of types) {
      expect(type).not.toMatch(/sick|hasta|rapor/i);
    }

    // Tur listesinin kendisi de buyumemeli: dort kalem.
    expect(types).toHaveLength(4);
  });

  it('sebep alani YOKTUR — durumun anahtar kumesi sabittir', () => {
    // ⚠️ `reason` ya da benzeri serbest metin bir alan eklenirse bu kirmizi
    // yanar. Sinirin ikinci katmani (birincisi Zod `.strict()`).
    expect(Object.keys(build().toState()).sort()).toEqual([
      'decidedAt',
      'decidedByUserId',
      'employeeId',
      'endsOn',
      'id',
      'requestedAt',
      'requestedByUserId',
      'startsOn',
      'status',
      'tenantId',
      'type',
    ]);
  });

  describe('gun sayisi', () => {
    it('TAKVIM GUNU sayar ve iki ucu da dahil eder', () => {
      expect(build({ startsOn: '2026-09-01', endsOn: '2026-09-05' }).days).toBe(5);
    });

    it('tek gunluk izin 1 gundur (0 DEGIL)', () => {
      expect(build({ startsOn: '2026-09-01', endsOn: '2026-09-01' }).days).toBe(1);
    });

    /**
     * ⚠️ HAFTA SONU DUSULMEZ — bu bir eksik degil, YAZILI BIR KARARDIR (§2.5):
     * resmi tatil ve hafta sonu tanimi ulkeye ozeldir.
     */
    it('hafta sonunu DUSMEZ', () => {
      // 2026-09-04 Cuma, 2026-09-07 Pazartesi -> arada bir hafta sonu var.
      expect(build({ startsOn: '2026-09-04', endsOn: '2026-09-07' }).days).toBe(4);
    });

    /** ⚠️ Yaz saati gecisi olan bir araligi UTC ile sayar; yerel saatte 1 gun kayardi. */
    it('yaz saati gecisinde de dogru sayar', () => {
      expect(build({ startsOn: '2026-10-24', endsOn: '2026-10-26' }).days).toBe(3);
    });

    it('ay ve yil sinirini asar', () => {
      expect(build({ startsOn: '2026-12-30', endsOn: '2027-01-02' }).days).toBe(4);
    });
  });

  it('bitis baslangictan onceyse reddedilir', () => {
    expect(() => build({ startsOn: '2026-09-05', endsOn: '2026-09-01' })).toThrow(
      InvalidLeaveDatesError,
    );
  });

  describe('karar', () => {
    it('onay aktoru ve zamani damgalar', () => {
      const decided = build().decide({
        status: 'approved',
        userId: '55555555-5555-4555-8555-555555555555',
        now: LATER,
      });

      expect(decided.toState().status).toBe('approved');
      expect(decided.toState().decidedByUserId).toBe('55555555-5555-4555-8555-555555555555');
      expect(decided.toState().decidedAt).toEqual(LATER);
    });

    /**
     * ⚠️ KARARA BAGLANMIS IZIN YENIDEN KARARA BAGLANAMAZ.
     *
     * Aksi halde bir onay SESSIZCE geri alinabilirdi ve "kim onayladi"
     * sorusunun cevabi degisirdi — satir ici damganin tek isi o soruyu
     * cevaplamak.
     */
    it('ikinci karar REDDEDILIR — onaydan sonra da, reddin ardindan da', () => {
      const approved = build().decide({ status: 'approved', userId: 'u1', now: LATER });
      const rejected = build().decide({ status: 'rejected', userId: 'u1', now: LATER });

      expect(() => approved.decide({ status: 'rejected', userId: 'u2', now: LATER })).toThrow(
        LeaveAlreadyDecidedError,
      );
      expect(() => rejected.decide({ status: 'approved', userId: 'u2', now: LATER })).toThrow(
        LeaveAlreadyDecidedError,
      );
    });

    it('karar YENI bir nesne uretir; oncekini DEGISTIRMEZ', () => {
      const pending = build();
      pending.decide({ status: 'approved', userId: 'u1', now: LATER });

      expect(pending.toState().status).toBe('pending');
    });
  });

  describe('hak edisten dusme', () => {
    /** ⚠️ Yalnizca ONAYLANMIS `annual` duser (§2.3). */
    it('onaylanmis yillik izin duser', () => {
      const approved = build({ type: 'annual' }).decide({
        status: 'approved',
        userId: 'u1',
        now: LATER,
      });

      expect(approved.consumesEntitlement).toBe(true);
    });

    it('BEKLEYEN yillik izin DUSMEZ — talep bir tuketim degildir', () => {
      expect(build({ type: 'annual' }).consumesEntitlement).toBe(false);
    });

    it('reddedilen yillik izin DUSMEZ', () => {
      const rejected = build({ type: 'annual' }).decide({
        status: 'rejected',
        userId: 'u1',
        now: LATER,
      });

      expect(rejected.consumesEntitlement).toBe(false);
    });

    /**
     * ⚠️ UCRETSIZ VE MAZERET IZNI HAK EDISTEN DUSMEZ ve bu, kullanicinin en
     * cok yanlis anlayacagi noktadir: ucretsiz izin yillik izin hakkini
     * TUKETMEZ — ikisi ayri seylerdir.
     */
    it('ucretsiz / mazeret / idari izin onaylansa bile DUSMEZ', () => {
      for (const type of ['unpaid', 'excuse', 'administrative'] as const) {
        const approved = build({ type }).decide({ status: 'approved', userId: 'u1', now: LATER });
        expect(approved.consumesEntitlement).toBe(false);
      }
    });
  });
});
