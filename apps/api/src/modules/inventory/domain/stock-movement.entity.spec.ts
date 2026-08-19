import { describe, expect, it } from 'vitest';

import {
  InvalidMovementDirectionError,
  InvalidOccurredAtError,
  InvalidQuantityError,
} from './inventory.error';
import {
  StockMovement,
  directionFromDelta,
  isMovementDirection,
  MOVEMENT_DIRECTIONS,
  type MovementDirection,
  type StockMovementFields,
} from './stock-movement.entity';

const NOW = new Date('2026-08-19T10:00:00Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-000000000002';
const ITEM = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const TENANT = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';

function fields(overrides: Partial<StockMovementFields> = {}): StockMovementFields {
  return {
    itemId: ITEM,
    direction: 'in',
    quantity: '10',
    isCorrection: false,
    occurredAt: NOW,
    note: null,
    ...overrides,
  };
}

function build(overrides: Partial<StockMovementFields> = {}): StockMovement {
  return StockMovement.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('StockMovement — DEGISTIRILEMEZ defter (ADR-0039 §3)', () => {
  describe('⚠️ DEGISTIRILEMEZLIK (§3.3)', () => {
    it('`update` METODU YOKTUR — ve olmayacaktir', () => {
      // ⚠️ BU TEST BIR SEYIN YOKLUGUNU KORUR ve ADR-0034'ten BILINCLI SAPMANIN
      // tasiyicisidir. `FinanceTransaction`in `update`i VARDIR ve o karar orada
      // dogruydu: her islem KENDI BASINA bir olgudur.
      //
      // Stok'ta bugunku miktar GECMISIN TAMAMINDAN turetilir (§2), yani gecmisi
      // degistirmek BUGUNU SESSIZCE YENIDEN YAZAR ve "nasil bu hale geldik"
      // sorusu cevaplanamaz olur.
      expect(build()).not.toHaveProperty('update');
    });

    it('durumda `updatedAt` YOKTUR — guncellenmeyen satirin guncellenme zamani olmaz', () => {
      expect(build().toState()).not.toHaveProperty('updatedAt');
    });
  });

  describe('⚠️ YON iki degerli, MIKTAR her zaman POZITIF (§3.1)', () => {
    it('sozluk yalnizca `in` ve `out` — `adjustment` YOK', () => {
      // ⚠️ Uc degerli bir `kind` REDDEDILDI: `adjustment` miktarin hangi yone
      // gittigini SOYLEMEZ ve ya isaretli miktar (ADR-0034 §5'in acikca
      // reddettigi) ya da satir bazinda anlam degistiren nullable bir
      // `direction` gerektirirdi. Sebep ayri bir kolonda yasar: `isCorrection`.
      expect([...MOVEMENT_DIRECTIONS]).toEqual(['in', 'out']);
      expect(isMovementDirection('adjustment')).toBe(false);
    });

    it('gecersiz yon REDDEDILIR', () => {
      expect(() => build({ direction: 'adjustment' as MovementDirection })).toThrow(
        InvalidMovementDirectionError,
      );
    });

    it.each(['0', '-5'])('miktar %s REDDEDILIR — isaret `direction`dadir', (quantity) => {
      // Negatif bir miktar, yon kolonuyla birlikte CIFT ISARET uretirdi ve
      // toplama SESSIZCE ters calisirdi.
      expect(() => build({ quantity })).toThrow(InvalidQuantityError);
    });

    it('miktar KANONIKLESTIRILIR', () => {
      expect(build({ quantity: '10' }).toState().quantity).toBe('10.000');
    });
  });

  it('`Invalid Date` REDDEDILIR — sessizce veritabanina gitmez', () => {
    expect(() => build({ occurredAt: new Date('gecersiz') })).toThrow(InvalidOccurredAtError);
  });

  it('bos not `null`a cevrilir', () => {
    expect(build({ note: '   ' }).toState().note).toBeNull();
  });

  describe('directionFromDelta — fiziksel sayimin kalbi (§3.2)', () => {
    it('POZITIF delta -> giris', () => {
      expect(directionFromDelta('3.000')).toEqual({ direction: 'in', quantity: '3.000' });
    });

    it('NEGATIF delta -> cikis, miktar POZITIFE cevrilir', () => {
      expect(directionFromDelta('-3.000')).toEqual({ direction: 'out', quantity: '3.000' });
    });

    it('⚠️ SIFIR delta -> `null`: HICBIR HAREKET YAZILMAZ', () => {
      // Sifir miktarli bir hareket hem `movements_quantity_positive` kisitini
      // ihlal ederdi hem de OLMAMIS bir akis hakkinda yalan olurdu.
      //
      // ⚠️ Bedeli ADR-0039 § Bilinen sinirlar'da KAYITLI: "sayim yapildi ve
      // TUTTU" bilgisi hicbir yerde kalmaz. Sayim gunlugu v2'dir.
      expect(directionFromDelta('0.000')).toBeNull();
      expect(directionFromDelta('-0')).toBeNull();
    });
  });
});
