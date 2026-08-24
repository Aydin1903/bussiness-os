import { describe, expect, it } from 'vitest';

import { type AuditEntry } from '../../../shared/audit.port';
import { toAuditRows, type AuditRow } from './audit-rows';

const TENANT = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const ACTOR = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const RESOURCE = '018f3a2b-7c4d-7e1f-9b3c-0000000000b7';
const AT = new Date('2026-08-24T09:15:00.000Z');

/** `AuditRow`un IZIN VERILEN anahtar kumesi — tablonun kolonlariyla birebir. */
const ALLOWED_KEYS = [
  'id',
  'tenantId',
  'actorUserId',
  'occurredAt',
  'resourceType',
  'resourceId',
  'action',
  'fieldName',
] as const;

function idSequence(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `018f3a2b-7c4d-7e1f-8a2b-00000000000${String(n)}`;
  };
}

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    resourceType: 'hr.employee',
    resourceId: RESOURCE,
    action: 'updated',
    fieldNames: ['job_title'],
    ...overrides,
  };
}

function rowsFor(input: AuditEntry, actorUserId: string | null = ACTOR): AuditRow[] {
  return toAuditRows({
    tenantId: TENANT,
    actorUserId,
    occurredAt: AT,
    entry: input,
    nextId: idSequence(),
  });
}

describe('toAuditRows', () => {
  // ==========================================================================
  // ⚠️ BU BLOK ADR-0043 §6.5'IN TEK RUNTIME KILIDIDIR
  // ==========================================================================
  // Iddia: "deger saklanmiyor, yalnizca ALAN ADI". TypeScript bu iddiayi
  // KORUYAMAZ — tipler runtime'da yoktur ve fazladan bir alan, bir degisken
  // uzerinden gecen nesnede tip hatasi URETMEZ. Kanit burada olmak zorunda.
  describe('⚠️ DEGER TASIMAZ — yalnizca hangi alanin degistigi', () => {
    it('uretilen satir YALNIZCA izin verilen anahtarlari tasir', () => {
      const [row] = rowsFor(entry());

      expect(row).toBeDefined();
      expect(Object.keys(row!).sort()).toEqual([...ALLOWED_KEYS].sort());
    });

    it('⚠️ KACAK BIR DEGER GECIRILSE BILE satira TASINMAZ', () => {
      // Gercekci senaryo: bir gun birisi "denetim kaydina eski degeri de
      // koyalim" diye entry nesnesine fazladan bir alan ekler. `toAuditRows`
      // nesneyi SPREAD ETMEDIGI icin bu alan satira GECMEZ.
      //
      // ⚠️ Ilk tuketici IK'dir ve o alanlardan biri MAAStir: sizma buradan
      // olsaydi ADR-0043 §4.2'nin uc katmanli izolasyonu tek hamlede delinirdi.
      const smuggled = {
        ...entry({ fieldNames: ['amount'] }),
        newValue: '75000.00',
        oldValue: '61000.00',
        payload: { amount: 75000 },
      } as unknown as AuditEntry;

      const [row] = rowsFor(smuggled);
      const serialized = JSON.stringify(row);

      expect(Object.keys(row!).sort()).toEqual([...ALLOWED_KEYS].sort());
      expect(serialized).not.toContain('75000');
      expect(serialized).not.toContain('61000');
      expect(serialized).not.toContain('newValue');
      expect(serialized).not.toContain('oldValue');
      expect(serialized).not.toContain('payload');

      // Kaydedilen TEK sey alanin ADIDIR.
      expect(row?.fieldName).toBe('amount');
    });

    it('alan ADI kaydedilir, alan DEGERI diye bir kavram yoktur', () => {
      const [row] = rowsFor(entry({ fieldNames: ['work_phone'] }));

      expect(row?.fieldName).toBe('work_phone');
      expect(row).not.toHaveProperty('value');
      expect(row).not.toHaveProperty('before');
      expect(row).not.toHaveProperty('after');
    });
  });

  describe('satir uretimi', () => {
    it('her degisen alan icin AYRI bir satir yazar', () => {
      const rows = rowsFor(entry({ fieldNames: ['job_title', 'work_phone'] }));

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.fieldName)).toEqual(['job_title', 'work_phone']);
      expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    });

    it('⚠️ AYNI ISLEMIN satirlari BIREBIR AYNI damgayi tasir (gruplama anahtari)', () => {
      // Ayri bir `operationId` kolonu YOK (ADR-0043 §6.4): gruplama
      // `(resourceId, occurredAt, actorUserId)` uclusuyle yapilir ve bu ancak
      // damga TEK bir degerden geliyorsa calisir.
      const rows = rowsFor(entry({ fieldNames: ['job_title', 'work_phone'] }));

      expect(rows.every((row) => row.occurredAt === AT)).toBe(true);
      expect(new Set(rows.map((row) => row.actorUserId)).size).toBe(1);
      expect(new Set(rows.map((row) => row.resourceId)).size).toBe(1);
    });

    it('ayni alan iki kez bildirilirse TEK satir yazar', () => {
      const rows = rowsFor(entry({ fieldNames: ['job_title', 'job_title'] }));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.fieldName).toBe('job_title');
    });

    it('`created` TEK satir yazar ve alan adi TASIMAZ', () => {
      const rows = rowsFor(entry({ action: 'created', fieldNames: [] }));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('created');
      expect(rows[0]?.fieldName).toBeNull();
    });

    it('`deleted` TEK satir yazar ve alan adi TASIMAZ', () => {
      const rows = rowsFor(entry({ action: 'deleted', fieldNames: [] }));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.fieldName).toBeNull();
    });

    it('⚠️ `created`/`deleted` icin alan adi verilse bile YOK SAYILIR', () => {
      // Veritabani kisiti (`audit_log_field_name_matches_action`) bunu zaten
      // reddederdi; burada 500 yerine DOGRU satir yaziliyor.
      const rows = rowsFor(entry({ action: 'created', fieldNames: ['job_title'] }));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.fieldName).toBeNull();
    });

    it('⚠️ HICBIR ALAN DEGISMEDIYSE SIFIR satir yazar — hata VERMEZ', () => {
      // ADR-0039'un fiziksel sayim karariyla ayni sekil: fark sifirsa satir
      // yazilmaz. Alternatif, hicbir sey degistirmeyen bir istegin HATA
      // almasiydi.
      expect(rowsFor(entry({ fieldNames: [] }))).toEqual([]);
    });
  });

  describe('aktor', () => {
    it('kimlikli istekte aktoru tasir', () => {
      expect(rowsFor(entry())[0]?.actorUserId).toBe(ACTOR);
    });

    it('⚠️ sistem/worker icin NULL yazar — sahte kullanici UYDURULMAZ', () => {
      // Sahte bir uuid, denetim kaydini OKUYAN kisiyi yanlis yonlendirirdi.
      expect(rowsFor(entry(), null)[0]?.actorUserId).toBeNull();
    });
  });

  it('tenant AKTARILIR — cagiranin nesnesinden DEGIL, baglamdan', () => {
    // `AuditEntry`de `tenantId` YOKTUR (port sozlesmesi): cagiran yanlis bir
    // tenant yazamaz. Deger yalnizca bu girdiden gelir.
    expect(rowsFor(entry())[0]?.tenantId).toBe(TENANT);
  });
});
