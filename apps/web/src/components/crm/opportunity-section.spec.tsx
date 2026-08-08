import type { OpportunityListRow } from '@business-os/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpportunitySection } from './opportunity-section';

/**
 * Müşteri detayındaki fırsatlar bölümü.
 *
 * En değerli iddialar: (1) `companyId` güncelleme gövdesine GİRMEZ, (2) tutar
 * varsa para birimi ağa çıkmadan istenir (sunucunun domain kuralı, erken
 * söylenir), (3) aşama seçimi hiçbir sırayı dayatmaz.
 */
const createOpportunity = vi.hoisted(() => vi.fn());
const updateOpportunity = vi.hoisted(() => vi.fn());
const deleteOpportunity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/crm', () => ({ createOpportunity, updateOpportunity, deleteOpportunity }));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333';

// Dönüş tipi AÇIKÇA verilir: `stage` aksi halde `string`e genişler ve
// bileşenin beklediği birleşim tipine uymaz.
function opportunity(overrides: Partial<OpportunityListRow> = {}): OpportunityListRow {
  return {
    id: OPPORTUNITY_ID,
    companyId: COMPANY_ID,
    companyName: 'Kuzey Mimarlık',
    contactId: null,
    title: 'Yıllık sözleşme',
    stage: 'in_discussion',
    estimatedValue: '250000.00',
    currency: 'TRY',
    nextFollowUpOn: null,
    stageChangedAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function renderSection(
  overrides: Partial<{
    opportunities: ReturnType<typeof opportunity>[];
    total: number;
    loading: boolean;
    failed: boolean;
    readOnly: boolean;
    onChanged: () => void;
  }> = {},
) {
  const props = {
    companyId: COMPANY_ID,
    opportunities: [opportunity()],
    contacts: [],
    total: 1,
    loading: false,
    failed: false,
    readOnly: false,
    onChanged: vi.fn(),
    ...overrides,
  };

  render(<OpportunitySection {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  createOpportunity.mockResolvedValue(opportunity());
  updateOpportunity.mockResolvedValue(opportunity());
  deleteOpportunity.mockResolvedValue(undefined);
});

describe('OpportunitySection — güncelleme gövdesi', () => {
  it('`companyId` gövdeye GİRMEZ — backend kabul etmiyor', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Yıllık sözleşme fırsatını düzenle' }));
    fireEvent.change(screen.getByLabelText(/Fırsat başlığı/), {
      target: { value: 'Revize sözleşme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));

    await waitFor(() => {
      expect(updateOpportunity).toHaveBeenCalledTimes(1);
    });

    // TAM eşitlik: fazladan bir anahtar olsaydı bu iddia düşerdi.
    expect(updateOpportunity).toHaveBeenCalledWith(OPPORTUNITY_ID, {
      contactId: null,
      title: 'Revize sözleşme',
      stage: 'in_discussion',
      estimatedValue: '250000.00',
      currency: 'TRY',
      nextFollowUpOn: null,
    });
  });
});

describe('OpportunitySection — tutar ve para birimi', () => {
  /**
   * Bu bir DOMAIN kuralıdır (`assertCurrency`) ve son sözü sunucu söyler (422).
   * Burada tekrarlanmasının tek sebebi, hatanın ağ turundan önce görülmesi.
   */
  it('tutar varsa para birimi ağa ÇIKMADAN istenir', async () => {
    renderSection({ opportunities: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Fırsat ekle' }));
    fireEvent.change(screen.getByLabelText(/Fırsat başlığı/), { target: { value: 'Yeni iş' } });
    fireEvent.change(screen.getByLabelText(/Tahmini değer/), { target: { value: '1000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fırsatı oluştur' }));

    expect(await screen.findByText('Tutar girdiyseniz para birimi de gerekli')).toBeInTheDocument();
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it('tutar yoksa para birimi istenmez', async () => {
    renderSection({ opportunities: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Fırsat ekle' }));
    fireEvent.change(screen.getByLabelText(/Fırsat başlığı/), { target: { value: 'Yeni iş' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fırsatı oluştur' }));

    await waitFor(() => {
      expect(createOpportunity).toHaveBeenCalledWith({
        companyId: COMPANY_ID,
        contactId: null,
        title: 'Yeni iş',
        stage: 'potential',
        estimatedValue: null,
        currency: null,
        nextFollowUpOn: null,
      });
    });
  });

  it('kartta tutar binlik ayracıyla yazılır', () => {
    renderSection();

    expect(screen.getByText('250.000 TRY')).toBeInTheDocument();
  });
});

describe('OpportunitySection — aşama', () => {
  /**
   * Backend hiçbir sıra dayatmaz (`lost` → `in_discussion` 200 döner).
   * Engellemek kullanıcıyı aşamayı hiç güncellememeye iter, veri bayatlar ve
   * AI bayat veriyle cevap verir.
   */
  it('beş aşamanın hepsi her zaman seçilebilir — sıra DAYATILMAZ', () => {
    renderSection({ opportunities: [opportunity({ stage: 'lost' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Yıllık sözleşme fırsatını düzenle' }));

    const select = screen.getByLabelText('Aşama');
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toEqual([
      'Potansiyel',
      'Görüşülüyor',
      'Teklif gönderildi',
      'Kazanıldı',
      'Kaybedildi',
    ]);
  });
});

describe('OpportunitySection — durumlar', () => {
  it('viewer fırsat ekleyemez ve düzenleyemez', () => {
    renderSection({ readOnly: true });

    expect(screen.queryByRole('button', { name: 'Fırsat ekle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fırsatını düzenle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fırsatını sil/ })).not.toBeInTheDocument();
  });

  it('liste düşerse "fırsat yok" DEMEZ', () => {
    renderSection({ opportunities: [], total: 0, failed: true });

    expect(screen.getByText('Fırsatlar şu an getirilemedi.')).toBeInTheDocument();
    expect(screen.queryByText(/Henüz fırsat yok/)).not.toBeInTheDocument();
  });

  it('silme iki adımlıdır ve müşterinin kalacağını söyler', async () => {
    const props = renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Yıllık sözleşme fırsatını sil' }));
    expect(deleteOpportunity).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Müşteri ve görüşmeler kalır');

    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    await waitFor(() => {
      expect(deleteOpportunity).toHaveBeenCalledWith(OPPORTUNITY_ID);
    });
    expect(props.onChanged).toHaveBeenCalled();
  });

  it('takip tarihi yoksa bunu açıkça yazar', () => {
    renderSection();

    expect(screen.getByText('Takip tarihi yok')).toBeInTheDocument();
  });
});
