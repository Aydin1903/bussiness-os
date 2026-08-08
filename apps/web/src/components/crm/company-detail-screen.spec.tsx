import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { CompanyDetailScreen } from './company-detail-screen';

/**
 * `/app/crm/[companyId]` — müşteri detayı.
 *
 * En değerli iddialar: (1) müşteri düşerse ekran YOK, tamamlayıcı veri düşerse
 * ekran VAR; (2) indekslenemeyen görüşme SESSİZ kalmaz; (3) görüşme akışı
 * `occurredOn`'u dilim dönüşümüne sokmadan çizer.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

const getCompany = vi.hoisted(() => vi.fn());
const listContacts = vi.hoisted(() => vi.fn());
const listInteractions = vi.hoisted(() => vi.fn());
const createInteraction = vi.hoisted(() => vi.fn());
const updateCompany = vi.hoisted(() => vi.fn());
const deleteCompany = vi.hoisted(() => vi.fn());
const countUnindexedInteractions = vi.hoisted(() => vi.fn());
const listOpportunities = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const role = vi.hoisted((): { value: string } => ({ value: 'owner' }));

vi.mock('@/lib/api/crm', () => ({
  getCompany,
  listContacts,
  listInteractions,
  createInteraction,
  updateCompany,
  deleteCompany,
  countUnindexedInteractions,
  listOpportunities,
  reindexInteractions: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  deleteOpportunity: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/session/use-current-role', () => ({
  useCurrentRole: () => role.value,
  isReadOnly: (value: string) => value === 'viewer',
}));

const COMPANY = {
  id: COMPANY_ID,
  name: 'Kuzey Mimarlık',
  industry: 'Mimarlık',
  email: 'info@kuzey.example',
  phone: null,
  website: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const CONTACT = {
  id: CONTACT_ID,
  companyId: COMPANY_ID,
  fullName: 'Ayşe Kaya',
  title: null,
  email: null,
  phone: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

function interaction(
  overrides: Partial<{ id: string; occurredOn: string; contactId: string | null }> = {},
) {
  return {
    id: 'interaction-1',
    companyId: COMPANY_ID,
    contactId: null,
    opportunityId: null,
    authorUserId: 'user-1',
    occurredOn: '2026-08-05',
    body: 'Teklif revize edilecek.',
    createdAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
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
  getCompany.mockResolvedValue(COMPANY);
  listContacts.mockResolvedValue({ items: [CONTACT], total: 1, limit: 100, offset: 0 });
  listOpportunities.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  listInteractions.mockResolvedValue({ items: [interaction()], total: 1, limit: 20, offset: 0 });
  createInteraction.mockResolvedValue({ interactionId: 'interaction-2', chunkCount: 2 });
  countUnindexedInteractions.mockResolvedValue({ count: 0 });
  updateCompany.mockResolvedValue(COMPANY);
  deleteCompany.mockResolvedValue(undefined);
});

describe('CompanyDetailScreen — yükleme', () => {
  it('müşteriyi ve görüşmesini çizer', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByRole('heading', { name: 'Kuzey Mimarlık' })).toBeInTheDocument();
    expect(screen.getByText('Teklif revize edilecek.')).toBeInTheDocument();
  });

  /**
   * Şirket ZORUNLU kaynaktır: yoksa gösterilecek sayfa da yoktur. Burada
   * istenmeyen davranış, boş bir iskeletle "her şey yolunda" görüntüsü vermek
   * olurdu.
   */
  it('müşteri bulunamazsa sayfa çizilmez, çıkış yolu verilir', async () => {
    getCompany.mockRejectedValue(apiError(404, 'Sirket bulunamadi.'));

    render(<CompanyDetailScreen companyId="yok" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu müşteri bulunamadı');
    expect(screen.getByRole('link', { name: /Müşteriler/ })).toHaveAttribute('href', '/app/crm');
  });

  /**
   * Tamamlayıcı kaynak düşerse ekranın KALANI çalışmaya devam eder — ama
   * eksiklik gizlenmez ("hiç görüşme yok" ile "getiremedim" ayrı şeylerdir).
   */
  it('görüşmeler düşerse müşteri yine çizilir ve eksiklik SÖYLENİR', async () => {
    listInteractions.mockRejectedValue(new Error('ağ'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByRole('heading', { name: 'Kuzey Mimarlık' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('görüşmeler');
    expect(screen.queryByText(/Henüz görüşme yok/)).not.toBeInTheDocument();
  });

  it('yetkililer düşse bile görüşmeler çizilir — çalışan yarı cezalandırılmaz', async () => {
    listContacts.mockRejectedValue(new Error('ağ'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByText('Teklif revize edilecek.')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('yetkililer');
  });
});

describe('CompanyDetailScreen — görüşme akışı', () => {
  it('takvim gününü OLDUĞU GİBİ çizer (dilim dönüşümü yok)', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByText('5 Ağu')).toBeInTheDocument();
  });

  it('yetkiliye bağlı görüşmede yetkilinin ADI yazılır', async () => {
    listInteractions.mockResolvedValue({
      items: [interaction({ contactId: CONTACT_ID })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByText('Ayşe Kaya ile')).toBeInTheDocument();
  });

  it('bilinmeyen yetkili id’si için ad UYDURULMAZ', async () => {
    listInteractions.mockResolvedValue({
      items: [interaction({ contactId: 'bilinmeyen' })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    await screen.findByText('Teklif revize edilecek.');
    expect(screen.queryByText(/ile$/)).not.toBeInTheDocument();
  });
});

describe('CompanyDetailScreen — görüşme kaydetme', () => {
  it('bugünün YEREL takvim günüyle gönderir', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    const body = await screen.findByLabelText(/Görüşme notu/);
    fireEvent.change(body, { target: { value: 'Fiyat konuşuldu.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Görüşmeyi kaydet' }));

    const now = new Date();
    const expected = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await waitFor(() => {
      expect(createInteraction).toHaveBeenCalledWith({
        companyId: COMPANY_ID,
        contactId: null,
        opportunityId: null,
        occurredOn: expected,
        body: 'Fiyat konuşuldu.',
      });
    });
  });

  /**
   * SESSİZ DOĞRULUK DELİĞİ: `chunkCount === 0` görüşmenin kaydedildiğini ama
   * AI tarafından BULUNAMAYACAĞINI söyler. Sessiz kalınırsa kullanıcı sorusuna
   * cevap alamaz ve nedenini asla anlayamaz.
   */
  it('indekslenemeyen görüşme SESSİZ kalmaz', async () => {
    createInteraction.mockResolvedValue({ interactionId: 'interaction-2', chunkCount: 0 });

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    fireEvent.change(await screen.findByLabelText(/Görüşme notu/), {
      target: { value: 'Fiyat konuşuldu.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Görüşmeyi kaydet' }));

    expect(await screen.findByText(/okuyamadı/)).toBeInTheDocument();
  });

  it('boş not gönderilemez', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    expect(await screen.findByRole('button', { name: 'Görüşmeyi kaydet' })).toBeDisabled();
  });
});

describe('CompanyDetailScreen — yetki ve silme', () => {
  it('viewer görüşme yazma alanını GÖRMEZ', async () => {
    role.value = 'viewer';

    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    await screen.findByRole('heading', { name: 'Kuzey Mimarlık' });
    expect(screen.queryByLabelText(/Görüşme notu/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /düzenle/i })).not.toBeInTheDocument();
  });

  it('silme iki adımlıdır ve sonrasında listeye DÖNÜLÜR', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Kuzey Mimarlık müşterisini sil' }));
    expect(deleteCompany).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    await waitFor(() => {
      // `replace`, `push` DEĞİL: geri tuşu silinmiş bir sayfaya götürmemeli.
      expect(replace).toHaveBeenCalledWith('/app/crm');
    });
  });

  it('silme onayı CASCADE’i açıkça söyler', async () => {
    render(<CompanyDetailScreen companyId={COMPANY_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Kuzey Mimarlık müşterisini sil' }));

    expect(screen.getByRole('alert')).toHaveTextContent('yapay zekânın hafızasından da çıkar');
  });
});
