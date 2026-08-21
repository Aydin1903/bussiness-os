import { describe, expect, it } from 'vitest';

import { NegativeMinQuantityError, StockItemNoteTooLongError } from './inventory.error';
import {
  MAX_ITEM_NOTE_CHARS,
  StockItem,
  withStockItemHeader,
  type StockItemFields,
} from './stock-item.entity';

const NOW = new Date('2026-08-19T10:00:00Z');
const ID = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const TENANT = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';

function fields(overrides: Partial<StockItemFields> = {}): StockItemFields {
  return {
    name: 'Vida M8 galvaniz',
    sku: 'VDA-M8',
    unit: 'adet',
    minQuantity: '20',
    note: null,
    archivedAt: null,
    ...overrides,
  };
}

function build(overrides: Partial<StockItemFields> = {}): StockItem {
  return StockItem.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('StockItem (ADR-0039 §1, §5)', () => {
  describe('⚠️ MIKTAR TASIMAZ — modulun merkezi karari (§2)', () => {
    it('entity durumunda `quantity` diye bir alan YOKTUR', () => {
      // ⚠️ BU TEST BIR SEYIN YOKLUGUNU KORUR. Biri "performans icin" bir miktar
      // alani eklerse ikinci bir dogruluk kaynagi dogar ve onu guncellemeyi
      // unutan her yazma yolu SESSIZ ve MAKUL GORUNEN yanlis bir sayi uretir.
      // Karar ADR-0039 §2.2'de uc argumanla yazilidir.
      expect(build().toState()).not.toHaveProperty('quantity');
      expect(build().toState()).not.toHaveProperty('quantityOnHand');
    });
  });

  describe('normalizasyon', () => {
    it('ad, birim ve SKU kirpilir', () => {
      const state = build({ name: '  Vida  ', unit: ' adet ', sku: ' VDA-1 ' }).toState();

      expect(state.name).toBe('Vida');
      expect(state.unit).toBe('adet');
      expect(state.sku).toBe('VDA-1');
    });

    it('bos SKU / not `null`a cevrilir — "girilmedi" ile "bos girildi" AYNI', () => {
      const state = build({ sku: '   ', note: '' }).toState();

      expect(state.sku).toBeNull();
      // Bos bir not BOS BIR EMBEDDING CAGRISI demek olurdu: para harcayan,
      // hicbir sey aramayan bir vektor.
      expect(state.note).toBeNull();
    });

    it('esik KANONIKLESTIRILIR', () => {
      expect(build({ minQuantity: '20' }).toState().minQuantity).toBe('20.000');
    });

    it('⚠️ esik `null` ile `0` FARKLI SEYLERDIR (§6.1)', () => {
      // `null` = izleme yok, `0` = tukendiginde haber ver. Ikisi de anlamlidir
      // ve biri digerinin yerine gecmez.
      expect(build({ minQuantity: null }).toState().minQuantity).toBeNull();
      expect(build({ minQuantity: '0' }).toState().minQuantity).toBe('0.000');
    });

    it('⚠️ NEGATIF ESIK REDDEDILIR — kapanis denetiminde bulundu (2026-08-19)', () => {
      // Migration `0029`un CHECK'i bunu zaten reddediyordu ama uygulama
      // katmaninda karsiligi YOKTU: kullanici 422 yerine HAM 500 aliyordu.
      // Kisit calisiyordu, MESAJ calismiyordu.
      expect(() => build({ minQuantity: '-1' })).toThrow(NegativeMinQuantityError);
    });

    it('SIFIR esik KABUL EDILIR — "tukendiginde haber ver" (§6.1)', () => {
      // ⚠️ Kural `>= 0`, `> 0` DEGIL. Sifir esik mesrudur; negatif esik hicbir
      // zaman tetiklenmeyen bir alarmdir.
      expect(() => build({ minQuantity: '0' })).not.toThrow();
    });

    it('⚠️ NOT SINIRI ASILIRSA REDDEDILIR — SESSIZ KIRPMA YASAK (§5)', () => {
      // Kirpilsaydi kullanici notunun yarisinin arandigini HIC ogrenemezdi.
      expect(() => build({ note: 'x'.repeat(MAX_ITEM_NOTE_CHARS + 1) })).toThrow(
        StockItemNoteTooLongError,
      );
    });

    it('sinir TAM DEGERINDE kabul edilir', () => {
      expect(() => build({ note: 'x'.repeat(MAX_ITEM_NOTE_CHARS) })).not.toThrow();
    });

    it('not uzunlugu KIRPMADAN SONRA olculur', () => {
      // Bosluklarla sisirilmis bir metin, gercek uzunluguyla olculur.
      const padded = `   ${'x'.repeat(MAX_ITEM_NOTE_CHARS)}   `;
      expect(() => build({ note: padded })).not.toThrow();
    });
  });

  describe('update — kismi guncelleme', () => {
    it('gonderilmeyen alana DOKUNULMAZ', () => {
      const updated = build().update({ name: 'Yeni ad' }, NOW).toState();

      expect(updated.name).toBe('Yeni ad');
      expect(updated.unit).toBe('adet');
      expect(updated.minQuantity).toBe('20.000');
    });

    it.each([
      ['sku', { sku: null }, 'sku'],
      ['minQuantity', { minQuantity: null }, 'minQuantity'],
      ['note', { note: null }, 'note'],
    ] as const)('⚠️ `null` gondermek %s alanini TEMIZLER', (_label, patch, key) => {
      // `??` kullanilsaydi `null` gonderen bir istek SESSIZCE yok sayilirdi —
      // kullanici esigi kaldirdigini sanip kaldirmamis olurdu ve ALARM SUSARDI.
      const updated = build({ note: 'parti no 1' }).update(patch, NOW).toState();
      expect(updated[key]).toBeNull();
    });

    it('arsivleme ve ARSIVDEN CIKARMA — ikisi de mesru', () => {
      const archived = build().update({ archivedAt: NOW }, NOW);
      expect(archived.isArchived()).toBe(true);

      const restored = archived.update({ archivedAt: null }, NOW);
      expect(restored.isArchived()).toBe(false);
    });
  });

  describe('identityDiffers — "bayatlama penceresi yok" iddiasinin tasiyicisi (§6.2)', () => {
    it('AD degisirse true', () => {
      const before = build();
      expect(before.update({ name: 'Baska ad' }, NOW).identityDiffers(before)).toBe(true);
    });

    it('SKU degisirse true', () => {
      const before = build();
      expect(before.update({ sku: 'YENI-1' }, NOW).identityDiffers(before)).toBe(true);
    });

    it('⚠️ BASLIGA GIRMEYEN alanlar degisirse false — bosuna embedding YOK', () => {
      // Birim, esik ve arsiv durumu baslikta GORUNMEZ; degistiklerinde vektoru
      // yeniden uretmek bedava bir OpenAI cagrisi ve bir oran siniri payi
      // harcamak olurdu.
      const before = build();
      const after = before.update({ unit: 'kg', minQuantity: '5', archivedAt: NOW }, NOW);

      expect(after.identityDiffers(before)).toBe(false);
    });
  });

  describe('withStockItemHeader (§6.2)', () => {
    it('SKU varsa basliga girer', () => {
      expect(
        withStockItemHeader({ name: 'Vida M8', sku: 'VDA-M8', note: 'parti no 2026-04' }),
      ).toBe('[Stok · VDA-M8 · Vida M8] parti no 2026-04');
    });

    it('SKU yoksa baslik ONSUZ kurulur', () => {
      expect(withStockItemHeader({ name: 'Vida M8', sku: null, note: 'parti no 2026-04' })).toBe(
        '[Stok · Vida M8] parti no 2026-04',
      );
    });
  });
});
