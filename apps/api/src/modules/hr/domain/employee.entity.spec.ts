import { describe, expect, it } from 'vitest';

import {
  AUDITED_EMPLOYEE_FIELDS,
  Employee,
  MAX_JOB_TITLE_CHARS,
  type EmployeeFields,
} from './employee.entity';
import {
  BlankEmployeeNameError,
  HrFieldTooLongError,
  InconsistentEmploymentStatusError,
  InvalidEmploymentDatesError,
  InvalidHrDateError,
} from './hr.error';

const ID = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const TENANT = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const NOW = new Date('2026-08-24T09:00:00.000Z');
const LATER = new Date('2026-08-25T09:00:00.000Z');

function fields(overrides: Partial<EmployeeFields> = {}): EmployeeFields {
  return {
    fullName: 'Ayse Yilmaz',
    jobTitle: 'Muhasebe Uzmani',
    workEmail: 'ayse@sirket.com',
    workPhone: '+90 555 000 0000',
    employmentStatus: 'active',
    startedOn: '2026-01-15',
    endedOn: null,
    platformUserId: null,
    ...overrides,
  };
}

function make(overrides: Partial<EmployeeFields> = {}): Employee {
  return Employee.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('Employee', () => {
  // ==========================================================================
  // ⚠️ MAAS IZOLASYONU — KATMAN 1'IN DOMAIN KARSILIGI (ADR-0043 §4.2)
  // ==========================================================================
  describe('⚠️ UCRET BU ENTITY DE YASAMAZ', () => {
    it('durum nesnesinde ucret tasiyabilecek HICBIR alan yoktur', () => {
      // ⚠️ BU TESTIN ISI BIR YOKLUGU KORUMAKTIR. Bir gun birisi "kolaylik
      // olsun" diye `currentSalary` eklerse, §4.2'nin BIRINCI izolasyon
      // katmani (ayri tablo) delinir ve maas `GET /hr/employees` cevabina
      // SESSIZCE girer.
      const state = make().toState();

      expect(Object.keys(state).sort()).toEqual(
        [
          'createdAt',
          'createdByUserId',
          'employmentStatus',
          'endedOn',
          'fullName',
          'id',
          'jobTitle',
          'platformUserId',
          'startedOn',
          'tenantId',
          'updatedAt',
          'workEmail',
          'workPhone',
        ].sort(),
      );

      for (const forbidden of ['amount', 'salary', 'currentSalary', 'compensation', 'wage']) {
        expect(state).not.toHaveProperty(forbidden);
      }
    });
  });

  // ==========================================================================
  // ⚠️ DENETIM IZI — hangi alan adlari yazilacak (§6.3, §6.5)
  // ==========================================================================
  describe('changedFieldsFrom', () => {
    it('⚠️ DENETLENEN ALAN LISTESI, ALAN KUMESIYLE BIREBIR ORTUSUR', () => {
      // ⚠️ Bir alan `AUDITED_EMPLOYEE_FIELDS`e eklenmezse degisikligi SESSIZCE
      // izlenmez. Bu test yeni bir alan eklendiginde KIRMIZI yanar ve ekleyeni
      // "bu alan denetlenmeli mi" sorusunu cevaplamaya zorlar.
      const state = make().toState();
      const auditable = AUDITED_EMPLOYEE_FIELDS.map((field) => field.key).sort();
      const stateFields = Object.keys(state)
        .filter(
          (key) => !['id', 'tenantId', 'createdByUserId', 'createdAt', 'updatedAt'].includes(key),
        )
        .sort();

      expect(auditable).toEqual(stateFields);
    });

    it('degisen alanlarin KOLON ADLARINI doner — DEGERLERINI DEGIL', () => {
      const before = make();
      const after = before.update({ jobTitle: 'Kidemli Muhasebe Uzmani' }, LATER);

      const changed = after.changedFieldsFrom(before);

      expect(changed).toEqual(['job_title']);
      // ⚠️ Donen sey bir ADLAR listesidir. Degerler donseydi
      // `platform.audit_log`ta yazacak bir kolon BULUNAMAZDI (Slice 1'de
      // bilerek yok) — sinir iki yerde birden korunur.
      expect(JSON.stringify(changed)).not.toContain('Kidemli');
    });

    it('birden fazla alan degisirse hepsini doner', () => {
      const before = make();
      const after = before.update({ fullName: 'Ayse Demir', workPhone: '+90 555 111 1111' }, LATER);

      expect(after.changedFieldsFrom(before).sort()).toEqual(['full_name', 'work_phone']);
    });

    it('⚠️ NORMALIZE EDILMIS degerler karsilastirilir — sahte degisiklik uretmez', () => {
      // `"  Ayse Yilmaz "` adi DEGISTIRMEZ ve bir denetim satiri
      // URETMEMELIDIR.
      const before = make();
      const after = before.update({ fullName: '  Ayse Yilmaz  ' }, LATER);

      expect(after.changedFieldsFrom(before)).toEqual([]);
    });

    it('hicbir alan degismediyse BOS dizi doner', () => {
      const before = make();
      const after = before.update({}, LATER);

      expect(after.changedFieldsFrom(before)).toEqual([]);
    });
  });

  // ==========================================================================
  // Alan kurallari
  // ==========================================================================
  describe('dogrulama', () => {
    it('bos ad REDDEDILIR', () => {
      expect(() => make({ fullName: '   ' })).toThrow(BlankEmployeeNameError);
    });

    it('⚠️ cok uzun unvan REDDEDILIR — sinir bir NOT ALANINA donusmesini engeller', () => {
      // Bu modulde serbest not alani BILINCLI OLARAK YOKTUR (§1.1). `jobTitle`
      // sinirsiz birakilsaydi kullanici onu bir not alanina CEVIRIRDI
      // ("Muhasebe / raporlu, eylulde doner") ve §3'un sagik verisi siniri
      // DOLAYLI olarak ihlal edilirdi.
      expect(() => make({ jobTitle: 'x'.repeat(MAX_JOB_TITLE_CHARS + 1) })).toThrow(
        HrFieldTooLongError,
      );
    });

    it('bos dizeler `null`a cevrilir — "girilmedi" ile "bos girildi" ayni sey', () => {
      expect(make({ jobTitle: '  ' }).toState().jobTitle).toBeNull();
    });

    it('takvimde OLMAYAN gun REDDEDILIR', () => {
      // ⚠️ Yalnizca kalip kontrolu yetmez: `2026-02-31` kalibi gecer ama
      // PostgreSQL onu reddeder — kullanici 422 yerine 500 alirdi.
      expect(() => make({ startedOn: '2026-02-31' })).toThrow(InvalidHrDateError);
    });

    it('⚠️ `ended` durumunda ayrilma tarihi ZORUNLU', () => {
      expect(() => make({ employmentStatus: 'ended', endedOn: null })).toThrow(
        InconsistentEmploymentStatusError,
      );
    });

    it('⚠️ `active` durumunda ayrilma tarihi BULUNAMAZ', () => {
      expect(() => make({ employmentStatus: 'active', endedOn: '2026-06-01' })).toThrow(
        InconsistentEmploymentStatusError,
      );
    });

    it('ayrilma tarihi baslangictan once OLAMAZ', () => {
      expect(() =>
        make({ startedOn: '2026-06-01', employmentStatus: 'ended', endedOn: '2026-01-01' }),
      ).toThrow(InvalidEmploymentDatesError);
    });
  });

  describe('update', () => {
    it('`undefined` = DOKUNMA', () => {
      const updated = make().update({}, LATER);

      expect(updated.toState().jobTitle).toBe('Muhasebe Uzmani');
    });

    it('⚠️ `null` = TEMIZLE ve sessizce yok sayilmaz', () => {
      // `changes.x ?? current.x` yazilsaydi `null` gonderen bir istek SESSIZCE
      // yok sayilirdi — kullanici alani temizledigini sanip temizlememis
      // olurdu.
      const updated = make().update({ workPhone: null }, LATER);

      expect(updated.toState().workPhone).toBeNull();
    });

    it('ayrilis kaydi: durum + tarih birlikte gecerlidir', () => {
      const updated = make().update({ employmentStatus: 'ended', endedOn: '2026-09-30' }, LATER);

      expect(updated.toState().employmentStatus).toBe('ended');
      expect(updated.toState().endedOn).toBe('2026-09-30');
    });

    it('`updatedAt` ilerler, `createdAt` DEGISMEZ', () => {
      const updated = make().update({ fullName: 'Ayse Demir' }, LATER);

      expect(updated.toState().updatedAt).toEqual(LATER);
      expect(updated.toState().createdAt).toEqual(NOW);
    });
  });
});
