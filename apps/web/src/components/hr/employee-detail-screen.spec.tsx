import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEmployee = vi.fn();
const listEmployees = vi.fn();
const getCompensation = vi.fn();
const addCompensation = vi.fn();
const updateEmployee = vi.fn();
const listAuditEntries = vi.fn();
const useCurrentRole = vi.fn();

vi.mock('@/lib/api/hr', () => ({
  getEmployee,
  listEmployees,
  getCompensation,
  addCompensation,
  updateEmployee,
}));

vi.mock('@/lib/api/audit', () => ({ listAuditEntries }));

vi.mock('@/lib/session/use-current-role', () => ({ useCurrentRole }));

const { EmployeeDetailScreen } = await import('./employee-detail-screen');

const EMPLOYEE_ID = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const ACTOR_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';

const EMPLOYEE = {
  id: EMPLOYEE_ID,
  fullName: 'Ayşe Yılmaz',
  jobTitle: 'Muhasebe Uzmanı',
  workEmail: 'ayse@sirket.com',
  workPhone: '+90 555 000 0000',
  employmentStatus: 'active' as const,
  startedOn: '2026-01-15',
  endedOn: null,
  platformUserId: null,
  createdAt: '2026-01-15T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z',
};

/** ⚠️ Bu tutar sayfada HİÇBİR KOŞULDA aranmadan görünmemeli. */
const SECRET_AMOUNT = '75000.00';

describe('EmployeeDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmployee.mockResolvedValue(EMPLOYEE);
    listEmployees.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    getCompensation.mockResolvedValue({
      items: [
        {
          id: '018f3a2b-7c4d-7e1f-8a2b-000000000009',
          employeeId: EMPLOYEE_ID,
          amount: SECRET_AMOUNT,
          currency: 'TRY',
          period: 'monthly' as const,
          effectiveFrom: '2026-01-01',
          recordedByUserId: ACTOR_ID,
          recordedAt: '2026-01-01T09:00:00.000Z',
        },
      ],
      current: {
        id: '018f3a2b-7c4d-7e1f-8a2b-000000000009',
        employeeId: EMPLOYEE_ID,
        amount: SECRET_AMOUNT,
        currency: 'TRY',
        period: 'monthly' as const,
        effectiveFrom: '2026-01-01',
        recordedByUserId: ACTOR_ID,
        recordedAt: '2026-01-01T09:00:00.000Z',
      },
    });
    listAuditEntries.mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 });
  });

  // ==========================================================================
  // ⚠️ SLICE'IN EN KRİTİK TESTİ — ADR-0043 §4.2 katman 2
  // ==========================================================================
  describe('⚠️ ücret yüzeyi — izinsiz kullanıcı için HİÇ VAR OLMAZ', () => {
    it.each(['member', 'viewer', 'unknown'])(
      '%s rolünde ücret bölümü DOM’da YOKTUR ve ucuna İSTEK ATILMAZ',
      async (role) => {
        // ⚠️ İDDİA "görünmüyor" DEĞİL, "hiç yok"tur. Üç ayrı ölçüm:
        //   1. "Ücret" kelimesi DOM'da geçmiyor,
        //   2. tutar DOM'da geçmiyor,
        //   3. ⚠️ `getCompensation` HİÇ ÇAĞRILMADI — yani ağ sekmesinde de
        //      uç adı görünmez. Bir 403 alıp yutmak bunu SAĞLAMAZDI.
        useCurrentRole.mockReturnValue(role);

        render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();
        });

        expect(screen.queryByText('Ücret')).not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(SECRET_AMOUNT);
        expect(getCompensation).not.toHaveBeenCalled();
      },
    );

    it.each(['member', 'viewer', 'unknown'])(
      '%s rolünde denetim damgası da İSTENMEZ (`audit:read` yok)',
      async (role) => {
        useCurrentRole.mockReturnValue(role);

        render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();
        });

        expect(listAuditEntries).not.toHaveBeenCalled();
      },
    );

    it.each(['owner', 'admin'])('%s rolünde ücret bölümü ÇİZİLİR ve istenir', async (role) => {
      useCurrentRole.mockReturnValue(role);

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(document.body.textContent).toContain(SECRET_AMOUNT);
      });

      expect(screen.getByText('Ücret')).toBeInTheDocument();
      expect(getCompensation).toHaveBeenCalledWith(EMPLOYEE_ID);
    });

    it('⚠️ `unknown` rol FAIL-CLOSED’dır — `isReadOnly`nin fail-open’ından SAPMA', async () => {
      // `use-current-role.ts` fail-open'dır ve orada doğrudur: bedeli
      // "çalışmayan bir düğme". Burada bedel ATILMAMASI GEREKEN BİR İSTEKTİR,
      // yani sapma bilinçlidir (`lib/config/hr.ts`).
      useCurrentRole.mockReturnValue('unknown');

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();
      });

      expect(getCompensation).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ⚠️ DENETİM DAMGASI (§6)
  // ==========================================================================
  describe('⚠️ son değişiklik damgası', () => {
    it('alan ADINI ve tarihi gösterir — DEĞERİ göstermez', async () => {
      useCurrentRole.mockReturnValue('owner');
      listAuditEntries.mockResolvedValue({
        items: [
          {
            id: '018f3a2b-7c4d-7e1f-8a2b-00000000000a',
            occurredAt: '2026-08-20T12:00:00.000Z',
            actorUserId: ACTOR_ID,
            resourceType: 'hr.employee',
            resourceId: EMPLOYEE_ID,
            action: 'updated' as const,
            fieldName: 'job_title',
          },
        ],
        total: 1,
        limit: 1,
        offset: 0,
      });
      listEmployees.mockResolvedValue({
        items: [{ ...EMPLOYEE, id: 'x', fullName: 'Ahmet Demir', platformUserId: ACTOR_ID }],
        total: 1,
        limit: 100,
        offset: 0,
      });

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('Son değişiklik')).toBeInTheDocument();
      });

      // ⚠️ Kolon adı İNSAN DİLİNE çevrilir; ham `job_title` ekrana basılmaz.
      expect(screen.getByText(/unvan değişti/)).toBeInTheDocument();
      expect(screen.getByText(/Ahmet Demir tarafından/)).toBeInTheDocument();
    });

    it('⚠️ aktör bir çalışana BAĞLI DEĞİLSE ad UYDURULMAZ', async () => {
      // Platform hiçbir yerde bir kullanıcının adını vermez (ADR §2.3); adı
      // çözebilen tek yer İK'nın kendi `platformUserId` bağıdır. Çözülemezse
      // ad GÖSTERİLMEZ — "bir yönetici" bile bir İDDİADIR.
      useCurrentRole.mockReturnValue('owner');
      listAuditEntries.mockResolvedValue({
        items: [
          {
            id: '018f3a2b-7c4d-7e1f-8a2b-00000000000a',
            occurredAt: '2026-08-20T12:00:00.000Z',
            actorUserId: ACTOR_ID,
            resourceType: 'hr.employee',
            resourceId: EMPLOYEE_ID,
            action: 'updated' as const,
            fieldName: 'work_phone',
          },
        ],
        total: 1,
        limit: 1,
        offset: 0,
      });

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText(/iş telefonu değişti/)).toBeInTheDocument();
      });

      expect(screen.queryByText(/tarafından/)).not.toBeInTheDocument();
    });
  });
});
