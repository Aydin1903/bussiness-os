import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { CompaniesScreen } from './companies-screen';

/**
 * `/app/crm` — müşteriler ekranı.
 *
 * En değerli iddialar üçü: (1) "0 müşteri" ile "listeyi getiremedim" ayrımı,
 * (2) `viewer` yazma yüzeylerini görmez, (3) sayfanın son kaydı silinince
 * kullanıcı BOŞ bir sayfada bırakılmaz.
 */
const listCompanies = vi.hoisted(() => vi.fn());
const createCompany = vi.hoisted(() => vi.fn());
const updateCompany = vi.hoisted(() => vi.fn());
const deleteCompany = vi.hoisted(() => vi.fn());
const role = vi.hoisted((): { value: string } => ({ value: 'owner' }));

vi.mock('@/lib/api/crm', () => ({ listCompanies, createCompany, updateCompany, deleteCompany }));
vi.mock('@/lib/session/use-current-role', () => ({
  useCurrentRole: () => role.value,
  // Gerçek kuralın KOPYASI değil, aynısı: `use-current-role.spec.tsx` onu
  // ayrıca doğruluyor; burada test edilen şey ekranın ona uyup uymadığı.
  isReadOnly: (value: string) => value === 'viewer',
}));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

function company(
  overrides: Partial<{
    id: string;
    name: string;
    industry: string | null;
    lastInteractionOn: string | null;
    contactCount: number;
    openOpportunityCount: number;
  }> = {},
) {
  return {
    id: COMPANY_ID,
    name: 'Kuzey Mimarlık',
    industry: 'Mimarlık',
    email: 'info@kuzey.example',
    phone: null,
    website: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    lastInteractionOn: null,
    contactCount: 0,
    openOpportunityCount: 0,
    ...overrides,
  };
}

function page(items: ReturnType<typeof company>[], total = items.length, offset = 0) {
  return { items, total, limit: 20, offset };
}

function apiError(status: number, detail: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title: 'Hata', status, detail },
    'Hata',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  role.value = 'owner';
  listCompanies.mockResolvedValue(page([company()], 1));
  createCompany.mockResolvedValue(company({ id: 'company-2' }));
  updateCompany.mockResolvedValue(company());
  deleteCompany.mockResolvedValue(undefined);
});

describe('CompaniesScreen — liste', () => {
  it('müşterileri çizer ve detay bağlantısı verir', async () => {
    render(<CompaniesScreen />);

    const link = await screen.findByRole('link', { name: 'Kuzey Mimarlık' });
    expect(link).toHaveAttribute('href', `/app/crm/${COMPANY_ID}`);
  });

  it('hiç müşteri yokken ne yapılacağını söyler', async () => {
    listCompanies.mockResolvedValue(page([], 0));

    render(<CompaniesScreen />);

    expect(await screen.findByText('Henüz müşteri yok')).toBeInTheDocument();
    // Boş durum YÖNLENDİRİR: eylem düğmesi boş ekranın içinde de durur.
    expect(screen.getByRole('button', { name: 'İlk müşteriyi ekle' })).toBeInTheDocument();
  });

  /**
   * SESSİZ DOĞRULUK DELİĞİ — Panel'de bir kez yaşandı, burada tekrarlanmıyor.
   *
   * Liste çekilemediğinde "0 müşteri / henüz müşteri yok" demek, var olan
   * müşteri kayıtlarını SİLİNMİŞ gibi gösterir.
   */
  it('liste düşerse "henüz müşteri yok" DEMEZ — hatayı söyler', async () => {
    listCompanies.mockRejectedValue(apiError(500, 'Sunucu hatası.'));

    render(<CompaniesScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucu hatası.');
    expect(screen.queryByText('Henüz müşteri yok')).not.toBeInTheDocument();
  });

  it('liste düşerse sayaç da çizilmez — ölçememek bir ölçüm değildir', async () => {
    listCompanies.mockRejectedValue(apiError(500, 'Sunucu hatası.'));

    render(<CompaniesScreen />);

    await screen.findByRole('alert');
    expect(screen.getByText('Müşteri listeniz şu an açılamıyor')).toBeInTheDocument();
  });
});

/**
 * SON TEMAS — kartın tek "akıllı" satırı ve tamamen bedava (AI çağrısı yok).
 *
 * ⚠️ `null` ile "bugün" karıştırılırsa ekran yalan söyler; ayrım
 * `signals.spec.tsx`'te ayrıca kanıtlanıyor, burada test edilen şey KARTA
 * bağlanmış olması.
 */
describe('CompaniesScreen — son temas sinyali', () => {
  it('hiç görüşülmemiş müşteride "henüz görüşülmedi" yazar', async () => {
    render(<CompaniesScreen />);

    expect(await screen.findByText('Henüz görüşülmedi')).toBeInTheDocument();
  });

  /**
   * Sayaçlar kartı "dolduran" süs değil: 720px'lik bir kartta iki kısa satır,
   * dolgu ne kadar kalın olursa olsun seyrek görünür. Bunlar kartın
   * genişliğini hak eden gerçek bilgi.
   */
  it('yetkili ve açık fırsat sayılarını karta taşır', async () => {
    listCompanies.mockResolvedValue(
      page([company({ contactCount: 2, openOpportunityCount: 3 })], 1),
    );

    render(<CompaniesScreen />);

    expect(await screen.findByText('2 yetkili')).toBeInTheDocument();
    expect(screen.getByText('3 açık fırsat')).toBeInTheDocument();
  });

  /**
   * SIFIR GİZLENMEZ: "0 açık fırsat" tam olarak bakılması gereken durumdur
   * (müşteri var, iş yok). Gizlenseydi o müşteri sayaçlı olanlardan görsel
   * olarak ayırt edilemezdi.
   */
  it('sıfır sayaç GİZLENMEZ', async () => {
    render(<CompaniesScreen />);

    expect(await screen.findByText('0 yetkili')).toBeInTheDocument();
    expect(screen.getByText('0 açık fırsat')).toBeInTheDocument();
  });

  it('son görüşme gününü karta taşır', async () => {
    const date = new Date();
    date.setDate(date.getDate() - 3);
    const pad = (value: number) => String(value).padStart(2, '0');
    const threeDaysAgo = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    listCompanies.mockResolvedValue(page([company({ lastInteractionOn: threeDaysAgo })], 1));

    render(<CompaniesScreen />);

    expect(await screen.findByText(/3 gün önce/)).toBeInTheDocument();
  });
});

describe('CompaniesScreen — yetki', () => {
  it('viewer yazma yüzeylerini GÖRMEZ', async () => {
    role.value = 'viewer';

    render(<CompaniesScreen />);

    await screen.findByRole('link', { name: 'Kuzey Mimarlık' });
    expect(screen.queryByRole('button', { name: 'Yeni müşteri' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /müşterisini düzenle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /müşterisini sil/ })).not.toBeInTheDocument();
  });

  it('rol bilinmiyorsa yüzeyler ÇİZİLİR (fail-open) — sunucu son sözü söyler', async () => {
    role.value = 'unknown';

    render(<CompaniesScreen />);

    expect(await screen.findByRole('button', { name: 'Yeni müşteri' })).toBeInTheDocument();
  });

  it('403 gelirse teknik izin adı değil ANLAŞILIR bir cümle gösterilir', async () => {
    role.value = 'unknown';
    createCompany.mockRejectedValue(apiError(403, 'company:write yetkisi yok.'));

    render(<CompaniesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni müşteri' }));
    fireEvent.change(screen.getByLabelText(/Müşteri adı/), { target: { value: 'Yeni' } });
    fireEvent.click(screen.getByRole('button', { name: 'Müşteriyi kaydet' }));

    expect(await screen.findByText(/yalnızca sahip, yönetici veya üye/)).toBeInTheDocument();
    expect(screen.queryByText(/company:write/)).not.toBeInTheDocument();
  });
});

describe('CompaniesScreen — oluşturma', () => {
  it('boş ad ağa ÇIKMADAN alan hatası verir', async () => {
    render(<CompaniesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni müşteri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Müşteriyi kaydet' }));

    expect(await screen.findByText('Şirket adı boş olamaz')).toBeInTheDocument();
    expect(createCompany).not.toHaveBeenCalled();
  });

  it('boş opsiyonel alan `null` gider — boş dizge DEĞİL', async () => {
    render(<CompaniesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni müşteri' }));
    fireEvent.change(screen.getByLabelText(/Müşteri adı/), { target: { value: '  Batı Yapı  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Müşteriyi kaydet' }));

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledWith({
        name: 'Batı Yapı',
        industry: null,
        email: null,
        phone: null,
        website: null,
      });
    });
  });
});

describe('CompaniesScreen — silme', () => {
  it('iki adım gerektirir ve sonra listeyi tazeler', async () => {
    render(<CompaniesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Kuzey Mimarlık müşterisini sil' }));
    expect(deleteCompany).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith(COMPANY_ID);
    });
    // İlk yükleme + silme sonrası tazeleme.
    await waitFor(() => {
      expect(listCompanies).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Sayfanın SON kaydı silindiğinde kullanıcı boş bir sayfada kalmamalı;
   * aksi halde tüm listesinin silindiğini sanar.
   */
  it('son kayıt silinince bir sayfa GERİ gidilir', async () => {
    listCompanies.mockResolvedValue(page([company()], 21, 20));

    render(<CompaniesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki' }));
    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Kuzey Mimarlık müşterisini sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    });
  });
});

describe('CompaniesScreen — sayfalama', () => {
  it('tek sayfaya sığıyorsa sayfalayıcı çizilmez', async () => {
    render(<CompaniesScreen />);

    await screen.findByRole('link', { name: 'Kuzey Mimarlık' });
    expect(screen.queryByRole('button', { name: 'Sonraki' })).not.toBeInTheDocument();
  });

  it('ilk sayfada "Önceki" kilitlidir', async () => {
    listCompanies.mockResolvedValue(page([company()], 40));

    render(<CompaniesScreen />);

    expect(await screen.findByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });
});
