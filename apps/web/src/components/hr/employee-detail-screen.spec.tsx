import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEmployee = vi.fn();
const listEmployees = vi.fn();
const getCompensation = vi.fn();
const addCompensation = vi.fn();
const updateEmployee = vi.fn();
const deleteEmployee = vi.fn();
const listAuditEntries = vi.fn();
const useCurrentRole = vi.fn();
// --- IK v2 (ADR-0044) ---
const getEmployeeLeave = vi.fn();
const createLeave = vi.fn();
const decideLeave = vi.fn();

vi.mock('@/lib/api/hr', () => ({
  getEmployee,
  listEmployees,
  getCompensation,
  addCompensation,
  updateEmployee,
  deleteEmployee,
  getEmployeeLeave,
  createLeave,
  decideLeave,
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
  department: 'Muhasebe',
  employmentType: 'full_time' as const,
  workMode: 'office' as const,
  contractEndsOn: null,
  annualLeaveDays: 14,
  managerEmployeeId: null,
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
          supersededAt: null,
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
    getEmployeeLeave.mockResolvedValue({
      items: [],
      entitlementDays: 14,
      usedDays: 0,
      remainingDays: 14,
    });
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

  // ==========================================================================
  // ⚠️ IK v2 — IZIN BOLUMU (ADR-0044 §2)
  // ==========================================================================
  describe('⚠️ izin bölümü', () => {
    /**
     * ⚠️ ÜCRETTEN FARK: izin bölümü DÖRT ROLE de çizilir.
     *
     * `leave:read` geniştir çünkü kendi izin bakiyesini görmek herkesin
     * işidir. Ücretin koşullu mount'u burada UYGULANMAZ — gizlenecek bir şey
     * yok. İkisini aynı kefeye koymak, izin sistemini var olma sebebinden
     * ederdi.
     */
    it.each(['owner', 'admin', 'member', 'viewer'])(
      '%s rolünde izin bölümü ÇİZİLİR ve bakiye istenir',
      async (role) => {
        useCurrentRole.mockReturnValue(role);

        render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

        await waitFor(() => {
          expect(screen.getByText('İzinler')).toBeInTheDocument();
        });

        // ⚠️ `waitFor` icinde: istek bir EFEKTTIR, DOM'a bakan ilk eslesmeyle
        // ayni ana bagli degildir.
        await waitFor(() => {
          expect(getEmployeeLeave).toHaveBeenCalledWith(EMPLOYEE_ID);
        });
      },
    );

    // ========================================================================
    // ⚠️ SAĞLIK VERİSİ SINIRI — ARAYÜZ KATMANI (ADR-0043 §3)
    // ========================================================================

    it('⚠️ izin formunda SEBEP alanı YOKTUR ve tür listesinde raporlu GEÇMEZ', async () => {
      // ⚠️ Bir "sebep" alanı sınırın ARKA KAPISIDIR: oraya ilk yazılacak şey
      // "raporlu"dur. Sınır ekranda da YAZILI olmalı ki kullanıcı cevabı
      // arayarak bulmasın.
      useCurrentRole.mockReturnValue('owner');

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('İzinler')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'İzin talebi' }));

      expect(screen.queryByLabelText(/sebep/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText('İzin türü').textContent).not.toMatch(/rapor|hasta/i);
      expect(document.body.textContent).toContain('Raporlu/hastalık izni bu modülde tutulmaz');
    });

    it('viewer izinleri GÖRÜR ama TALEP düğmesi ÇİZİLMEZ', async () => {
      useCurrentRole.mockReturnValue('viewer');

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('İzinler')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'İzin talebi' })).not.toBeInTheDocument();
    });

    it('member TALEP EDEBİLİR ama KARAR düğmeleri ÇİZİLMEZ', async () => {
      useCurrentRole.mockReturnValue('member');
      getEmployeeLeave.mockResolvedValue({
        items: [
          {
            id: '018f3a2b-7c4d-7e1f-8a2b-00000000001a',
            employeeId: EMPLOYEE_ID,
            type: 'annual' as const,
            startsOn: '2026-09-01',
            endsOn: '2026-09-05',
            days: 5,
            status: 'pending' as const,
            requestedByUserId: ACTOR_ID,
            requestedAt: '2026-08-20T09:00:00.000Z',
            decidedByUserId: null,
            decidedAt: null,
          },
        ],
        entitlementDays: 14,
        usedDays: 0,
        remainingDays: 14,
      });

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'İzin talebi' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
    });

    /**
     * ⚠️ NEGATİF BAKİYE GİZLENMEZ (§2.3): hak edişinden fazla izin kullanmış
     * bir çalışan GERÇEK bir durumdur ve İK'nın görmesi gereken şeydir.
     */
    it('⚠️ negatif kalan bakiye GÖSTERİLİR — sıfırda kırpılmaz', async () => {
      useCurrentRole.mockReturnValue('owner');
      getEmployeeLeave.mockResolvedValue({
        items: [],
        entitlementDays: 0,
        usedDays: 5,
        remainingDays: -5,
      });

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('-5 gün')).toBeInTheDocument();
      });
    });

    it('karara bağlanmış izinde KARAR düğmeleri ÇİZİLMEZ (409 alacak bir düğme sunulmaz)', async () => {
      useCurrentRole.mockReturnValue('owner');
      getEmployeeLeave.mockResolvedValue({
        items: [
          {
            id: '018f3a2b-7c4d-7e1f-8a2b-00000000001b',
            employeeId: EMPLOYEE_ID,
            type: 'annual' as const,
            startsOn: '2026-09-01',
            endsOn: '2026-09-05',
            days: 5,
            status: 'approved' as const,
            requestedByUserId: ACTOR_ID,
            requestedAt: '2026-08-20T09:00:00.000Z',
            decidedByUserId: ACTOR_ID,
            decidedAt: '2026-08-21T09:00:00.000Z',
          },
        ],
        entitlementDays: 14,
        usedDays: 5,
        remainingDays: 9,
      });

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('Onaylandı')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reddet' })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // ⚠️ IK v2 — TURETILEN ALANLAR
  // ==========================================================================
  describe('⚠️ türetilen alanlar', () => {
    it('⚠️ KIDEM türetilir — kolonda saklanmaz', async () => {
      useCurrentRole.mockReturnValue('owner');

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('Kıdem')).toBeInTheDocument();
      });

      // 2026-01-15 -> bugün (2026 ortası/sonu) arası bir yıldan az olabilir;
      // ⚠️ iddia RAKAM DEĞİL, alanın TÜRETİLMİŞ bir metin üretmesidir.
      expect(screen.getByText(/aydır|yıldır|bu ay başladı/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // ⚠️ SİLME — İKİ ADIMLI, VE "AYRILDI" İLE AYNI ŞEY DEĞİL
  // ==========================================================================
  describe('⚠️ çalışan silme', () => {
    it.each(['owner', 'admin'])('%s rolünde Sil düğmesi çizilir', async (role) => {
      useCurrentRole.mockReturnValue(role);

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /kaydını sil/ })).toBeInTheDocument();
      });
    });

    it.each(['member', 'viewer'])('%s rolünde Sil düğmesi ÇİZİLMEZ', async (role) => {
      useCurrentRole.mockReturnValue(role);

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /kaydını sil/ })).not.toBeInTheDocument();
    });

    /**
     * ⚠️ İLK TIKLAMA SİLMEZ — yalnızca onayı açar. Silme geri alınamaz ve
     * izin kayıtları CASCADE ile gider; tek tıklık bir "Sil", yanlış karta
     * basmayı kalıcı veri kaybına çevirirdi.
     */
    it('⚠️ ilk tıklama SİLMEZ — onay sorar ve NE gideceğini söyler', async () => {
      useCurrentRole.mockReturnValue('owner');

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /kaydını sil/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /kaydını sil/ }));

      expect(deleteEmployee).not.toHaveBeenCalled();
      // ⚠️ İzin kayıtlarının gideceği ve doğru alternatif ("Ayrıldı") YAZILI.
      expect(screen.getByRole('alert').textContent).toMatch(/izin kayıtları da silinir/i);
      expect(screen.getByRole('alert').textContent).toMatch(/Ayrıldı/);
    });

    it('onaydan sonra siler', async () => {
      useCurrentRole.mockReturnValue('owner');
      deleteEmployee.mockResolvedValue(undefined);

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /kaydını sil/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /kaydını sil/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Evet, kaydı sil' }));

      await waitFor(() => {
        expect(deleteEmployee).toHaveBeenCalledWith(EMPLOYEE_ID);
      });
    });

    /**
     * ⚠️ ÜCRET KAYDI OLAN ÇALIŞAN SİLİNEMEZ (409) — ve düğme ÖNCEDEN
     * GİZLENMEZ.
     *
     * Gizlemek "ücret kaydı var mı" bilgisini gerektirir ve o bilgi
     * `compensation:read` taşımayan kullanıcıda YOKTUR — düğmenin yokluğu
     * maaşın varlığını sızdıran bir yan kanal olurdu (§4.2'nin tam tersi).
     * Cevap kullanıcıya HATA MESAJI olarak döner.
     */
    it('⚠️ sunucu reddederse (409) mesaj GÖSTERİLİR, düğme gizlenmez', async () => {
      useCurrentRole.mockReturnValue('owner');
      deleteEmployee.mockRejectedValue(new Error('Ucret kaydi olan bir calisan silinemez'));

      render(<EmployeeDetailScreen employeeId={EMPLOYEE_ID} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /kaydını sil/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /kaydını sil/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Evet, kaydı sil' }));

      await waitFor(() => {
        expect(screen.getByText(/silinemez/i)).toBeInTheDocument();
      });
    });
  });
});
