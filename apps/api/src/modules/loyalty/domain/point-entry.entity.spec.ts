import { describe, expect, it } from 'vitest';

import {
  FutureEntryDateError,
  InvalidPointAmountError,
  InvalidPointDirectionError,
  PointEntryNoteTooLongError,
} from './loyalty.error';
import { MAX_POINT_ENTRY_NOTE_CHARS, PointEntry } from './point-entry.entity';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function create(overrides: Partial<Parameters<typeof PointEntry.create>[0]> = {}): PointEntry {
  return PointEntry.create({
    id: 'entry-1',
    tenantId: 'tenant-1',
    accountId: 'account-1',
    createdByUserId: 'user-1',
    direction: 'earn',
    points: 100,
    note: null,
    occurredAt: NOW,
    now: NOW,
    ...overrides,
  });
}

describe('PointEntry', () => {
  describe('⚠️ ARITMETIK EKSEN — isaret `direction`da, miktarda DEGIL (§1.4)', () => {
    it('`earn` POZITIF, `spend` NEGATIF katki verir', () => {
      expect(create({ direction: 'earn', points: 100 }).signedPoints()).toBe(100);
      expect(create({ direction: 'spend', points: 100 }).signedPoints()).toBe(-100);
    });

    it('⚠️ SAKLANAN miktar HER IKI YONDE DE POZITIFTIR', () => {
      // Isaretli bir miktar secilseydi, isaret koymayi unutan TEK bir yazma
      // yolu bir harcamayi kazanc gibi toplardi ve hata SESSIZ ve MAKUL
      // GORUNEN yanlis bir sayi uretirdi (ADR-0034 §5 / ADR-0039 §3).
      expect(create({ direction: 'spend', points: 40 }).toState().points).toBe(40);
    });

    it('⚠️ UCUNCU BIR YON YOKTUR — `adjustment` reddedilir', () => {
      // Duzeltme TERS YONDE BIR SATIRDIR (ADR-0041'in iskonto karari).
      expect(() => create({ direction: 'adjustment' })).toThrow(InvalidPointDirectionError);
    });
  });

  describe('⚠️ PUAN SAYILIR, OLCULMEZ (§1.5)', () => {
    it('kesirli puan reddedilir — 3,5 puan YOKTUR', () => {
      expect(() => create({ points: 2.5 })).toThrow(InvalidPointAmountError);
    });

    it('sifir ve negatif reddedilir', () => {
      expect(() => create({ points: 0 })).toThrow(InvalidPointAmountError);
      expect(() => create({ points: -1 })).toThrow(InvalidPointAmountError);
    });

    it('⚠️ UST SINIR YOKTUR — icat edilmis bir sayi olurdu', () => {
      // Bir tipo bakiyeyi sisirir ama hata GORUNURDUR (bakiye ekranda ziplar)
      // ve telafi bir ters satirdir.
      expect(create({ points: 5_000_000 }).toState().points).toBe(5_000_000);
    });

    it('⚠️ GUVENLI TAMSAYI SINIRI DISI reddedilir', () => {
      expect(() => create({ points: Number.MAX_SAFE_INTEGER + 2 })).toThrow(
        InvalidPointAmountError,
      );
      expect(() => create({ points: Number.NaN })).toThrow(InvalidPointAmountError);
    });
  });

  describe('⚠️ GELECEGE YAZILAMAZ (§1.6)', () => {
    it('gelecege tarihli hareket reddedilir', () => {
      // Bakiye tarihten BAGIMSIZ olarak TUM satirlarin toplamidir; gelecege
      // tarihli bir kazanim BUGUN HENUZ KAZANILMAMIS bir puani bugunun
      // bakiyesinde gosterirdi ve "hangi bakiye dogru" sorusu IKI cevaba sahip
      // olurdu.
      const later = new Date(NOW.getTime() + 1000);
      expect(() => create({ occurredAt: later })).toThrow(FutureEntryDateError);
    });

    it('⚠️ TAM `now` KABUL EDILIR — sinir degeri', () => {
      expect(create({ occurredAt: NOW }).toState().occurredAt).toEqual(NOW);
    });

    it('GECMISE tarihli hareket KABUL EDILIR — gercek bir ihtiyac', () => {
      const yesterday = new Date(NOW.getTime() - 86_400_000);
      expect(create({ occurredAt: yesterday }).toState().occurredAt).toEqual(yesterday);
    });
  });

  describe('⚠️ `note` BIR ETIKETTIR (§3.1)', () => {
    it('bos ve yalnizca bosluk iceren aciklama `null` olur', () => {
      // "girilmedi" ile "bos girildi" AYNI SEYDIR — veritabanindaki
      // `point_entries_note_not_blank` kisitiyla ayni karar.
      expect(create({ note: '   ' }).toState().note).toBeNull();
      expect(create({ note: '' }).toState().note).toBeNull();
    });

    it('bosluklar kirpilir', () => {
      expect(create({ note: '  kasa fisi 441  ' }).toState().note).toBe('kasa fisi 441');
    });

    it('⚠️ SINIR ASILIRSA 422 — SESSIZ KIRPMA YOK', () => {
      expect(() => create({ note: 'x'.repeat(MAX_POINT_ENTRY_NOTE_CHARS + 1) })).toThrow(
        PointEntryNoteTooLongError,
      );
    });

    it('tam sinir kabul edilir', () => {
      const note = 'x'.repeat(MAX_POINT_ENTRY_NOTE_CHARS);
      expect(create({ note }).toState().note).toBe(note);
    });
  });

  describe('⚠️ DEGISTIRILEMEZLIK — KATMAN 1 (§2.3)', () => {
    it('`update` metodu YOKTUR', () => {
      // ⚠️ Bir satiri degistirmek BUGUNKU BAKIYEYI SESSIZCE YENIDEN YAZAR.
      // Bu testin isi bir YOKLUGU kilitlemektir: birisi entity'ye `update`
      // eklerse once bunu kirmasi ve ADR-0051 §2.1'i okumasi gerekir.
      expect((create() as unknown as Record<string, unknown>).update).toBeUndefined();
    });

    it('`isCorrection` diye bir alan YOKTUR — ADR-0039 dan bilincli sapma', () => {
      expect(Object.keys(create().toState())).not.toContain('isCorrection');
    });
  });
});
