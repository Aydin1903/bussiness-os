import { describe, expect, it } from 'vitest';

import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import {
  MAX_INTERACTION_BODY_CHARS,
  SupplierInteraction,
  assertEmbeddingDimensions,
  withSupplierHeader,
} from './supplier-interaction.entity';
import {
  BlankSupplierInteractionBodyError,
  InvalidSupplierEmbeddingDimensionsError,
  InvalidSupplierOccurredOnError,
  SupplierInteractionBodyTooLongError,
} from './suppliers.error';

const NOW = new Date('2026-08-21T10:00:00.000Z');

function create(overrides: { body?: string; occurredOn?: string; contactId?: string | null } = {}) {
  return SupplierInteraction.create({
    id: 'int-1',
    tenantId: 'tenant-1',
    supplierId: 'sup-1',
    contactId: overrides.contactId ?? null,
    authorUserId: 'user-1',
    occurredOn: overrides.occurredOn ?? '2026-08-21',
    body: overrides.body ?? 'fiyat listesi guncellendi, M8 vidada %6 zam',
    now: NOW,
  });
}

describe('SupplierInteraction (ADR-0040 §1, §2.2)', () => {
  it('⚠️ EKLEME-YALNIZ: `update` METODU YOKTUR', () => {
    // Izin adi bu yuzden `supplier_interaction:create`tir, `write` DEGIL
    // (ADR-0031 §6'nin adlandirmasi): var olmayan bir fiili deklare etmek
    // yanlis olurdu.
    //
    // ⚠️ Bu, ADR-0039'un DEGISTIRILEMEZ DEFTERIYLE karistirilmamali: orada
    // koruma UC KATMANLIYDI cunku BUGUNKU MIKTAR o defterden turetiliyordu.
    // Burada turetilen hicbir sayi yok.
    const interaction = create();

    expect(Object.getPrototypeOf(interaction)).not.toHaveProperty('update');
  });

  it('⚠️ `updatedAt` ALANI YOKTUR — guncellenmeyen satirin guncellenme zamani olmaz', () => {
    expect(create().toState()).not.toHaveProperty('updatedAt');
  });

  it('bos metin REDDEDILIR — metin ZORUNLUDUR (Randevu/Stok tan farkli)', () => {
    // `serviceNote` ve `items.note` OPSIYONELDI ("notsuz randevu cok yaygin",
    // "bir vidanin notu olmaz"). Metinsiz bir GORUSME KAYDI diye bir sey yoktur.
    expect(() => create({ body: '   ' })).toThrow(BlankSupplierInteractionBodyError);
  });

  it('metin KIRPILIR ve bosluklar temizlenir', () => {
    expect(create({ body: '  merhaba  ' }).toState().body).toBe('merhaba');
  });

  describe('⚠️ SERT KARAKTER SINIRI — SESSIZ KIRPMA YASAK (§2.2)', () => {
    it('sinir `TARGET_CHUNK_CHARS`tir — yeni bir sayi ICAT EDILMEDI', () => {
      // ⚠️ BAGIMLILIK KASITLI: chunking hedefi degisirse bu sinir da onunla
      // birlikte degisir. Kopya bir sabit yazilsaydi ikisi SESSIZCE ayrisirdi
      // ve gorusme metni bir chunk'a sigmamaya baslardi — yani §2.2'nin
      // dayandigi varsayim bozulurdu.
      expect(MAX_INTERACTION_BODY_CHARS).toBe(TARGET_CHUNK_CHARS);
    });

    it('sinirin USTU REDDEDILIR — kirpilmaz', () => {
      expect(() => create({ body: 'x'.repeat(MAX_INTERACTION_BODY_CHARS + 1) })).toThrow(
        SupplierInteractionBodyTooLongError,
      );
    });

    it('sinirin TAM USTUNDE kabul edilir', () => {
      const body = 'x'.repeat(MAX_INTERACTION_BODY_CHARS);

      expect(create({ body }).toState().body).toHaveLength(MAX_INTERACTION_BODY_CHARS);
    });

    it('kontrol KIRPMADAN SONRA yapilir', () => {
      const padded = `  ${'x'.repeat(MAX_INTERACTION_BODY_CHARS)}  `;

      expect(() => create({ body: padded })).not.toThrow();
    });
  });

  describe('⚠️ TAKVIM GUNU DOGRULAMASI — Zod yalnizca KALIBI dogrular', () => {
    it('takvimde OLMAYAN gun REDDEDILIR (`2026-02-31`)', () => {
      // `new Date('2026-02-31')` PATLAMAZ, 3 Mart'a TASAR. Kontrol edilmeseydi
      // deger veritabanina kadar gider ve kullanici 422 yerine 500 alirdi.
      expect(() => create({ occurredOn: '2026-02-31' })).toThrow(InvalidSupplierOccurredOnError);
    });

    it('13. ay REDDEDILIR', () => {
      expect(() => create({ occurredOn: '2026-13-01' })).toThrow(InvalidSupplierOccurredOnError);
    });

    it('artik yil gunu KABUL EDILIR (`2028-02-29`)', () => {
      expect(create({ occurredOn: '2028-02-29' }).toState().occurredOn).toBe('2028-02-29');
    });
  });

  it('`contactId` `null` MESRUDUR — santral / genel e-posta / ilk temas', () => {
    expect(create({ contactId: null }).toState().contactId).toBeNull();
  });

  it('⚠️ kisinin AYNI TEDARIKCIYE ait oldugu BURADA dogrulanmaz', () => {
    // Kontrol bir veritabani sorgusu gerektirir ve `domain` katmani
    // framework'suzdur; use case'tedir (`#assertContactBelongsToSupplier`).
    // ⚠️ FK bunu YAKALAMAZ: FK yalnizca "boyle bir kisi var mi" der.
    expect(create({ contactId: 'baska-tedarikcinin-kisisi' }).toState().contactId).toBe(
      'baska-tedarikcinin-kisisi',
    );
  });
});

describe('withSupplierHeader (ADR-0040 §6)', () => {
  it('uc parca: SABIT etiket + TARIH + TEDARIKCI ADI', () => {
    expect(
      withSupplierHeader({
        occurredOn: '2026-08-21',
        supplierName: 'Yildiz Civata',
        body: 'fiyat listesi guncellendi',
      }),
    ).toBe('[Tedarikci · 2026-08-21 · Yildiz Civata] fiyat listesi guncellendi');
  });

  it('ad cozulemezse baslik ONSUZ kurulur', () => {
    expect(withSupplierHeader({ occurredOn: '2026-08-21', supplierName: null, body: 'not' })).toBe(
      '[Tedarikci · 2026-08-21] not',
    );
  });

  it('⚠️ KISININ ADI BASLIGA GIRMEZ — basliga YALNIZCA BIR ad girer', () => {
    // ADR-0033'un kurali. Iki gerekce: (a) ikinci bir bayatlama yuzeyi acardi,
    // (b) `contactId` `ON DELETE SET NULL` tasiyan bir alandir — silinen bir
    // kisinin adi vektorde yasamaya devam ederdi.
    const header = withSupplierHeader({
      occurredOn: '2026-08-21',
      supplierName: 'Yildiz Civata',
      body: 'Ahmet ile konusuldu',
    });

    // Ad yalnizca KULLANICININ YAZDIGI metinde gecer, BASLIKTA degil.
    expect(header.slice(0, header.indexOf(']'))).not.toContain('Ahmet');
  });
});

describe('assertEmbeddingDimensions', () => {
  it('yanlis boyut REDDEDILIR — VERI YAZILMADAN', () => {
    expect(() => {
      assertEmbeddingDimensions([0.1, 0.2]);
    }).toThrow(InvalidSupplierEmbeddingDimensionsError);
  });

  it('dogru boyut gecer', () => {
    expect(() => {
      assertEmbeddingDimensions(Array.from({ length: 1536 }, () => 0));
    }).not.toThrow();
  });
});
