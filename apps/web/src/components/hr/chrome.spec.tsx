import { describe, expect, it } from 'vitest';

import {
  EMPLOYMENT_TYPE_LABELS,
  LEAVE_TYPE_LABELS,
  WORK_MODE_LABELS,
  tenureLabel,
  toEmploymentType,
  toLeaveType,
  toWorkMode,
} from './chrome';

describe('İK odasının parçaları', () => {
  // ==========================================================================
  // ⚠️ SAĞLIK VERİSİ SINIRININ ARAYÜZ KATMANI (ADR-0043 §3)
  // ==========================================================================
  describe('⚠️ izin türü listesi', () => {
    it('⚠️ sağlık ima eden HİÇBİR kalem TAŞIMAZ', () => {
      // ⚠️ Bir izin türü olarak "hastalık" seçmek, o satırı SERBEST METİN
      // OLMASA BİLE KVKK m.6 kapsamında bir SAĞLIK VERİSİ yapardı. Bu test
      // listenin sessizce büyümesini yakalar.
      for (const [key, label] of Object.entries(LEAVE_TYPE_LABELS)) {
        expect(key).not.toMatch(/sick|hasta|rapor/i);
        expect(label).not.toMatch(/hasta|rapor|sağlık/i);
      }
    });

    it('dört kalemden oluşur ve büyümez', () => {
      expect(Object.keys(LEAVE_TYPE_LABELS).sort()).toEqual([
        'administrative',
        'annual',
        'excuse',
        'unpaid',
      ]);
    });
  });

  // ==========================================================================
  // ⚠️ `<select>` DİZE DÖNER — DARALTMA GERÇEK BİR KONTROLLE
  // ==========================================================================
  describe('⚠️ daraltma fonksiyonları', () => {
    it('bilinen değerleri OLDUĞU GİBİ geçirir', () => {
      expect(toEmploymentType('intern')).toBe('intern');
      expect(toWorkMode('hybrid')).toBe('hybrid');
      expect(toLeaveType('unpaid')).toBe('unpaid');
    });

    it('⚠️ BİLİNMEYEN değer varsayılana düşer — `as` ile susturulmaz', () => {
      // `as EmploymentType` yazılsaydı tip bir YALAN olurdu ve hata SESSİZ
      // kalırdı: ekranda `undefined` görünürdü.
      expect(toEmploymentType('yok-boyle-bir-sey')).toBe('full_time');
      expect(toWorkMode('')).toBe('office');
      expect(toLeaveType('sick')).toBe('annual');
    });

    it('her daraltma fonksiyonunun varsayılanı etiket tablosunda VARDIR', () => {
      expect(EMPLOYMENT_TYPE_LABELS[toEmploymentType('x')]).toBeTypeOf('string');
      expect(WORK_MODE_LABELS[toWorkMode('x')]).toBeTypeOf('string');
      expect(LEAVE_TYPE_LABELS[toLeaveType('x')]).toBeTypeOf('string');
    });
  });

  // ==========================================================================
  // ⚠️ KIDEM TÜRETİLİR — KOLONDA SAKLANMAZ (ADR-0044 §3)
  // ==========================================================================
  describe('⚠️ kıdem', () => {
    const TODAY = new Date('2026-08-25T00:00:00.000Z');

    it('tarih yoksa null döner — uydurulmaz', () => {
      expect(tenureLabel(null, TODAY)).toBeNull();
    });

    it('bu ay başlayanı ay olarak saymaz', () => {
      expect(tenureLabel('2026-08-10', TODAY)).toBe('bu ay başladı');
    });

    it('bir yıldan azını AY olarak verir', () => {
      expect(tenureLabel('2026-01-15', TODAY)).toBe('7 aydır');
    });

    it('bir yıldan fazlasını YIL olarak verir', () => {
      expect(tenureLabel('2021-03-01', TODAY)).toBe('5 yıldır');
    });

    /**
     * ⚠️ GELECEK TARİHLİ işe başlama MEŞRUDUR (yeni işe alım, henüz
     * başlamadı). "bu ay başladı" demek onu OLMUŞ gibi gösterirdi.
     */
    it('⚠️ gelecek tarihli başlangıcı OLMUŞ gibi göstermez', () => {
      expect(tenureLabel('2026-12-01', TODAY)).toBe('henüz başlamadı');
    });
  });
});
