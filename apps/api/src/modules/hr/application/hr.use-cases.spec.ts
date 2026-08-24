import { describe, expect, it, vi } from 'vitest';

import { type AuditEntry, type AuditRecorder } from '../../../shared/audit.port';
import { type TenantAccessQuery } from '../../tenant/tenant.public';
import { type CompensationRecord } from '../domain/compensation-record.entity';
import { Employee, type EmployeeFields } from '../domain/employee.entity';
import { type LeaveRequest } from '../domain/leave-request.entity';
import {
  EmployeeNotFoundError,
  EmployeeUserAlreadyLinkedError,
  EmployeeUserNotMemberError,
} from '../domain/hr.error';
import { type HrRepository } from './hr.repository.port';
import { HrUseCases } from './hr.use-cases';

const TENANT = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const OTHER_USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000a2';
const EMPLOYEE_ID = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const NOW = new Date('2026-08-24T09:00:00.000Z');

function employeeFields(overrides: Partial<EmployeeFields> = {}): EmployeeFields {
  return {
    fullName: 'Ayse Yilmaz',
    jobTitle: 'Muhasebe Uzmani',
    workEmail: null,
    workPhone: null,
    employmentStatus: 'active',
    startedOn: null,
    endedOn: null,
    platformUserId: null,
    department: 'Muhasebe',
    employmentType: 'full_time',
    workMode: 'office',
    contractEndsOn: null,
    annualLeaveDays: 14,
    managerEmployeeId: null,
    ...overrides,
  };
}

function existingEmployee(overrides: Partial<EmployeeFields> = {}): Employee {
  return Employee.create({
    id: EMPLOYEE_ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: employeeFields(overrides),
    now: NOW,
  });
}

interface Harness {
  readonly useCases: HrUseCases;
  readonly repository: HrRepository;
  readonly audited: AuditEntry[];
  readonly auditCalls: () => number;
}

function makeHarness(
  overrides: {
    repository?: Partial<HrRepository>;
    granted?: boolean;
  } = {},
): Harness {
  const audited: AuditEntry[] = [];

  const repository: HrRepository = {
    saveEmployee: vi.fn(() => Promise.resolve()),
    findEmployeeById: vi.fn(() => Promise.resolve<Employee | null>(null)),
    listEmployees: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    deleteEmployeeById: vi.fn(() => Promise.resolve(1)),
    findEmployeeIdByPlatformUserId: vi.fn(() => Promise.resolve<string | null>(null)),
    appendCompensation: vi.fn(() => Promise.resolve()),
    listCompensation: vi.fn(() => Promise.resolve<CompensationRecord[]>([])),
    findCurrentCompensation: vi.fn(() => Promise.resolve<CompensationRecord | null>(null)),
    // --- IK v2 (ADR-0044) ---
    saveLeaveRequest: vi.fn(() => Promise.resolve()),
    findLeaveRequestById: vi.fn(() => Promise.resolve<LeaveRequest | null>(null)),
    listLeaveRequests: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    listLeaveRequestsForEmployee: vi.fn(() => Promise.resolve<LeaveRequest[]>([])),
    countOnLeave: vi.fn(() => Promise.resolve(0)),
    countContractsEndingBefore: vi.fn(() => Promise.resolve(0)),
    ...overrides.repository,
  };

  const auditRecorder: AuditRecorder = {
    record: (entry) => {
      audited.push(entry);
      return Promise.resolve();
    },
  };

  const tenantAccess = {
    resolveMemberAccess: vi.fn(() =>
      Promise.resolve(
        overrides.granted === false
          ? ({ granted: false, reason: 'no-membership' } as const)
          : ({ granted: true, tenantId: TENANT, role: 'member' } as const),
      ),
    ),
  } as unknown as TenantAccessQuery;

  const useCases = new HrUseCases({
    repository,
    tenantAccess,
    auditRecorder,
    transactionManager: {
      runInTransaction: () => Promise.reject(new Error('kullanilmamali')),
      runInTenantTransaction: () => Promise.reject(new Error('cagirandan tenantId ALINMAMALI')),
      runInCurrentTenantTransaction: (fn) => fn(),
    },
    idGenerator: { nextId: () => EMPLOYEE_ID },
    clock: { now: () => NOW },
  });

  return { useCases, repository, audited, auditCalls: () => audited.length };
}

describe('HrUseCases', () => {
  // ==========================================================================
  // ⚠️ DENETIM IZI — Slice 1'in mekanizmasinin ILK TUKETICISI (ADR-0043 §6)
  // ==========================================================================
  describe('⚠️ denetim izi', () => {
    it('olusturma `created` kaydi yazar ve ALAN ADI TASIMAZ', () => {
      const h = makeHarness();

      return h.useCases
        .createEmployee({ tenantId: TENANT, userId: USER, fields: employeeFields() })
        .then(() => {
          expect(h.audited).toEqual([
            {
              resourceType: 'hr.employee',
              resourceId: EMPLOYEE_ID,
              action: 'created',
              // ⚠️ Bir kaydin olusturulmasi "tek bir alanin" olayi degildir;
              // Slice 1'in veritabani kisiti da bunu zorlar.
              fieldNames: [],
            },
          ]);
        });
    });

    it('⚠️ guncelleme YALNIZCA DEGISEN ALAN ADLARINI yazar — DEGER YAZMAZ', async () => {
      const before = existingEmployee();
      const h = makeHarness({
        repository: { findEmployeeById: vi.fn(() => Promise.resolve(before)) },
      });

      await h.useCases.updateEmployee({
        tenantId: TENANT,
        id: EMPLOYEE_ID,
        changes: { jobTitle: 'Kidemli Muhasebe Uzmani' },
      });

      expect(h.audited).toHaveLength(1);
      expect(h.audited[0]).toMatchObject({ action: 'updated', fieldNames: ['job_title'] });

      // ⚠️ ADR-0043 §6.5'in tek runtime kontrolu bu satirdir: yeni deger
      // denetim kaydina HICBIR SEKILDE girmemeli.
      expect(JSON.stringify(h.audited[0])).not.toContain('Kidemli');
    });

    it('⚠️ HICBIR ALAN DEGISMEDIYSE denetim kaydi da BOS gecer', async () => {
      // ADR-0039'un fiziksel sayim karariyla ayni sekil: fark sifirsa satir
      // yazilmaz. `AuditRecorder` bos `fieldNames` icin SIFIR satir yazar.
      const before = existingEmployee();
      const h = makeHarness({
        repository: { findEmployeeById: vi.fn(() => Promise.resolve(before)) },
      });

      await h.useCases.updateEmployee({ tenantId: TENANT, id: EMPLOYEE_ID, changes: {} });

      expect(h.audited).toHaveLength(1);
      expect(h.audited[0]?.fieldNames).toEqual([]);
    });

    it('silme `deleted` kaydi yazar', async () => {
      const h = makeHarness();

      await h.useCases.deleteEmployee(EMPLOYEE_ID);

      expect(h.audited[0]).toMatchObject({ action: 'deleted', fieldNames: [] });
    });

    it('⚠️ UCRET EKLEME denetim kaydi YAZMAZ — ve bu bir ATLAMA DEGILDIR', async () => {
      // ADR-0043 §6.2: "maasi kim, ne zaman degistirdi" sorusunun cevabi
      // DEFTERIN KENDISIDIR (`recorded_by_user_id` + `recorded_at`). Bir de
      // denetim kaydi yazmak, ayni olguyu IKI YERDE tutmak olurdu — ve ikisi
      // ayrisirsa hangisinin dogru oldugu bilinemezdi.
      const h = makeHarness({
        repository: { findEmployeeById: vi.fn(() => Promise.resolve(existingEmployee())) },
      });

      await h.useCases.addCompensation({
        tenantId: TENANT,
        userId: USER,
        employeeId: EMPLOYEE_ID,
        fields: {
          amount: '75000',
          currency: 'TRY',
          period: 'monthly',
          effectiveFrom: '2026-09-01',
        },
      });

      expect(h.auditCalls()).toBe(0);
    });
  });

  // ==========================================================================
  // ⚠️ PLATFORM KULLANICISI BAGI (§2.5)
  // ==========================================================================
  describe('⚠️ platform kullanicisi bagi', () => {
    it('uye OLMAYAN bir kullaniciya baglanamaz', async () => {
      const h = makeHarness({ granted: false });

      await expect(
        h.useCases.createEmployee({
          tenantId: TENANT,
          userId: USER,
          fields: employeeFields({ platformUserId: OTHER_USER }),
        }),
      ).rejects.toThrow(EmployeeUserNotMemberError);
    });

    it('`null` bag icin uyelik kontrolu HIC yapilmaz', async () => {
      // ⚠️ Hesabi olmayan calisan YAYGINDIR (depo gorevlisi, saha ekibi).
      // Kontrolu kosulsuz yapmak, `null` icin anlamsiz bir sorgu acardi.
      const h = makeHarness({ granted: false });

      await expect(
        h.useCases.createEmployee({
          tenantId: TENANT,
          userId: USER,
          fields: employeeFields({ platformUserId: null }),
        }),
      ).resolves.toBeDefined();
    });

    it('ayni kullanici IKINCI bir calisana baglanamaz', async () => {
      const h = makeHarness({
        repository: {
          findEmployeeIdByPlatformUserId: vi.fn(() => Promise.resolve('baska-calisan-id')),
        },
      });

      await expect(
        h.useCases.createEmployee({
          tenantId: TENANT,
          userId: USER,
          fields: employeeFields({ platformUserId: OTHER_USER }),
        }),
      ).rejects.toThrow(EmployeeUserAlreadyLinkedError);
    });

    it('KENDI bagini korumak catisma SAYILMAZ', async () => {
      const before = existingEmployee({ platformUserId: OTHER_USER });
      const h = makeHarness({
        repository: {
          findEmployeeById: vi.fn(() => Promise.resolve(before)),
          findEmployeeIdByPlatformUserId: vi.fn(() => Promise.resolve(EMPLOYEE_ID)),
        },
      });

      await expect(
        h.useCases.updateEmployee({
          tenantId: TENANT,
          id: EMPLOYEE_ID,
          changes: { platformUserId: OTHER_USER },
        }),
      ).resolves.toBeDefined();
    });
  });

  // ==========================================================================
  // ⚠️ GUNCEL UCRET TURETILIR (§1.5)
  // ==========================================================================
  describe('⚠️ ucret', () => {
    it('guncel ucret sorgusu BUGUNU gecirir — `CURRENT_DATE` degil', async () => {
      // `Clock`tan gelen sabit tarih; sunucu saatine bagli bir sorgu test
      // edilemez olurdu (DEVELOPMENT_RULES 3.2).
      const findCurrent = vi.fn(() => Promise.resolve<CompensationRecord | null>(null));
      const h = makeHarness({
        repository: {
          findEmployeeById: vi.fn(() => Promise.resolve(existingEmployee())),
          findCurrentCompensation: findCurrent,
        },
      });

      await h.useCases.getCompensation(EMPLOYEE_ID);

      expect(findCurrent).toHaveBeenCalledWith({ employeeId: EMPLOYEE_ID, today: '2026-08-24' });
    });

    it('olmayan calisana ucret eklenemez', async () => {
      const h = makeHarness({
        repository: { findEmployeeById: vi.fn(() => Promise.resolve(null)) },
      });

      await expect(
        h.useCases.addCompensation({
          tenantId: TENANT,
          userId: USER,
          employeeId: EMPLOYEE_ID,
          fields: {
            amount: '75000',
            currency: 'TRY',
            period: 'monthly',
            effectiveFrom: '2026-09-01',
          },
        }),
      ).rejects.toThrow(EmployeeNotFoundError);
    });
  });

  it('olmayan calisan 404 uretir', async () => {
    const h = makeHarness();

    await expect(h.useCases.getEmployee(EMPLOYEE_ID)).rejects.toThrow(EmployeeNotFoundError);
  });
});
