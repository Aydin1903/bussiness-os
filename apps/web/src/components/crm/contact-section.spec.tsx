import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactSection } from './contact-section';

/**
 * Müşteri detayındaki yetkililer bölümü.
 *
 * ============================================================================
 * ASIL İDDİA: `companyId` GÜNCELLEMEDE GÖVDEYE GİRMEZ
 * ============================================================================
 * Backend'in `updateContactSchema`'sı `.strict()`'tir ve `companyId`'yi kabul
 * etmez — gönderilirse istek 400 ile döner. Form ise `companyId`'yi
 * OLUŞTURMA için taşımak zorunda. Bu ikisi arasındaki geçiş sessizce
 * bozulabilecek bir yerdir; test onu sabitler.
 */
const createContact = vi.hoisted(() => vi.fn());
const updateContact = vi.hoisted(() => vi.fn());
const deleteContact = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/crm', () => ({ createContact, updateContact, deleteContact }));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

function contact(overrides: Partial<{ id: string; fullName: string }> = {}) {
  return {
    id: CONTACT_ID,
    companyId: COMPANY_ID,
    fullName: 'Ayşe Kaya',
    title: 'Satın alma',
    email: 'ayse@kuzey.example',
    phone: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function renderSection(
  overrides: Partial<{
    contacts: ReturnType<typeof contact>[];
    total: number;
    loading: boolean;
    failed: boolean;
    readOnly: boolean;
    onChanged: () => void;
  }> = {},
) {
  const props = {
    companyId: COMPANY_ID,
    contacts: [contact()],
    total: 1,
    loading: false,
    failed: false,
    readOnly: false,
    onChanged: vi.fn(),
    ...overrides,
  };

  render(<ContactSection {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  createContact.mockResolvedValue(contact({ id: 'contact-2' }));
  updateContact.mockResolvedValue(contact());
  deleteContact.mockResolvedValue(undefined);
});

describe('ContactSection — güncelleme gövdesi', () => {
  it('`companyId` gövdeye GİRMEZ — backend kabul etmiyor', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Ayşe Kaya yetkilisini düzenle' }));
    fireEvent.change(screen.getByLabelText(/Ünvan/), { target: { value: 'Genel müdür' } });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledTimes(1);
    });

    // TAM eşitlik: fazladan bir anahtar (ör. `companyId`) olsaydı bu iddia
    // düşerdi. `objectContaining` kullanılmıyor — o, fazlalığı GÖRMEZDİ ve
    // testin tek amacı zaten fazlalığın olmadığını kanıtlamak.
    expect(updateContact).toHaveBeenCalledWith(CONTACT_ID, {
      fullName: 'Ayşe Kaya',
      title: 'Genel müdür',
      email: 'ayse@kuzey.example',
      phone: null,
    });
  });

  it('oluşturmada `companyId` gövdeye GİRER — orada zorunlu', async () => {
    renderSection({ contacts: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Yetkili ekle' }));
    fireEvent.change(screen.getByLabelText(/Ad soyad/), { target: { value: 'Mehmet Uz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yetkiliyi ekle' }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalledWith({
        companyId: COMPANY_ID,
        fullName: 'Mehmet Uz',
        title: null,
        email: null,
        phone: null,
      });
    });
  });
});

describe('ContactSection — durumlar', () => {
  it('liste düşerse "yetkili yok" DEMEZ', () => {
    renderSection({ contacts: [], total: 0, failed: true });

    expect(screen.getByText('Yetkililer şu an getirilemedi.')).toBeInTheDocument();
    expect(screen.queryByText(/Henüz yetkili yok/)).not.toBeInTheDocument();
  });

  it('liste düşerse sayaç da yazılmaz', () => {
    renderSection({ contacts: [], total: 0, failed: true });

    expect(screen.getByText('Yetkililer')).toBeInTheDocument();
  });

  it('viewer yetkili ekleyemez ve düzenleyemez', () => {
    renderSection({ readOnly: true });

    expect(screen.queryByRole('button', { name: 'Yetkili ekle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /yetkilisini düzenle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /yetkilisini sil/ })).not.toBeInTheDocument();
  });

  /**
   * Kişiler tek çağrıda (limit 100) çekilir. Sınır aşıldığında sessizce
   * kırpmak, var olan kişileri YOK göstermek olurdu.
   */
  it('gösterilenden fazlası varsa sınır AÇIKÇA söylenir', () => {
    renderSection({ contacts: [contact()], total: 140 });

    expect(screen.getByText(/İlk 1 yetkili gösteriliyor \(toplam 140\)/)).toBeInTheDocument();
  });

  it('silme iki adımlıdır', async () => {
    const props = renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Ayşe Kaya yetkilisini sil' }));
    expect(deleteContact).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith(CONTACT_ID);
    });
    expect(props.onChanged).toHaveBeenCalled();
  });
});
