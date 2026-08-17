import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StageListScreen } from './stage-list-screen';

/**
 * `/app/crm/pipeline/[stage]` — bir aşamanın TAM listesi.
 *
 * En değerli iddialar: (1) panoyla AYNI sıralamayı ister (`priority`) —
 * ayrışsaydı "tümünü gör" beklenmedik bir yere açılmış gibi olurdu,
 * (2) geçersiz aşama adında ağa hiç çıkılmaz, (3) satırlar KOMPAKT.
 */
const listOpportunities = vi.hoisted(() => vi.fn());

/*
 * ⚠️ ODANIN DUVARI MOCK'LANIR — bu testin konusu ekranın KENDİ mantığı.
 * Duvar ayrı bir bileşendir, kendi veri çağrılarını yapar ve kendi testini
 * hak eder; buraya karıştırmak her ekran testine ilgisiz mock'lar
 * eklettirirdi (ADR-0038 §6.5 — duvar ortak, tezgah değişir).
 */
vi.mock('./crm-wall', () => ({ CrmWall: () => null }));
vi.mock('@/lib/api/crm', () => ({ listOpportunities }));
vi.mock('next/navigation', () => ({ usePathname: () => '/app/crm/pipeline/potential' }));

function opportunity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    companyName: 'Kuzey Mimarlık',
    contactId: null,
    title: 'Yıllık sözleşme',
    stage: 'potential',
    estimatedValue: '250000.00',
    currency: 'TRY',
    nextFollowUpOn: null,
    stageChangedAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

function page(items: ReturnType<typeof opportunity>[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  listOpportunities.mockResolvedValue(page([opportunity()]));
});

describe('StageListScreen — sorgu', () => {
  it('panoyla AYNI sıralamayı ister ve aşamayı filtreler', async () => {
    render(<StageListScreen stage="potential" />);

    await waitFor(() => {
      expect(listOpportunities).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        stage: 'potential',
        order: 'priority',
      });
    });
  });

  /**
   * Geçersiz aşamada sunucuya istek atmak, cevabı zaten bilinen bir soruyu
   * sormak olurdu — beş aşama istemcide de bilinir.
   */
  it('geçersiz aşamada AĞA ÇIKMAZ', () => {
    render(<StageListScreen stage="olmayan-asama" />);

    expect(listOpportunities).not.toHaveBeenCalled();
    expect(screen.getByText('Böyle bir aşama yok')).toBeInTheDocument();
  });
});

describe('StageListScreen — içerik', () => {
  it('aşama adını başlık yapar ve toplamı gösterir', async () => {
    listOpportunities.mockResolvedValue(page([opportunity()], 37));

    render(<StageListScreen stage="potential" />);

    expect(await screen.findByRole('heading', { name: 'Potansiyel' })).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('satır başlık · müşteri · tutarı TEK satırda taşır', async () => {
    render(<StageListScreen stage="potential" />);

    expect(await screen.findByRole('link', { name: 'Yıllık sözleşme' })).toHaveAttribute(
      'href',
      '/app/crm/22222222-2222-4222-8222-222222222222',
    );
    expect(screen.getByText('Kuzey Mimarlık')).toBeInTheDocument();
    expect(screen.getByText('250.000 TRY')).toBeInTheDocument();
  });

  /**
   * Pano bir ÖZET, burası bir ARŞİV: panonun büyük kartını kullanmak ekranı üç
   * ekran boyu uzatır ve taramayı imkânsız kılardı. `py-[12px]` o kararın imzası.
   */
  it('satırlar KOMPAKT — panonun büyük kart dolgusunu KULLANMAZ', async () => {
    const { container } = render(<StageListScreen stage="potential" />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });

    expect(container.querySelector('[class*="py-[12px]"]')).not.toBeNull();
    expect(container.querySelector('[class*="py-[20px]"]')).toBeNull();
  });

  it('panoya dönüş yolu verir', async () => {
    render(<StageListScreen stage="potential" />);

    const back = await screen.findByRole('link', { name: 'Fırsatlar panosuna dön' });
    expect(back).toHaveAttribute('href', '/app/crm/pipeline');
  });

  it('aşama boşsa neden boş olduğunu söyler', async () => {
    listOpportunities.mockResolvedValue(page([]));

    render(<StageListScreen stage="won" />);

    expect(await screen.findByText('"Kazanıldı" aşamasında fırsat yok')).toBeInTheDocument();
  });

  /**
   * Kapanmış aşamada "kaç gündür bekliyor" uyarısı ÇİZİLMEZ: kazanılmış bir
   * anlaşmanın aylardır o aşamada durması beklenen şeydir.
   */
  it('KAPANMIŞ aşamada bekleme uyarısı yok', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    listOpportunities.mockResolvedValue(page([opportunity({ stage: 'won', stageChangedAt: old })]));

    render(<StageListScreen stage="won" />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(screen.queryByText(/gündür bekliyor/)).not.toBeInTheDocument();
  });

  it('liste düşerse "fırsat yok" DEMEZ — hatayı söyler', async () => {
    listOpportunities.mockRejectedValue(new Error('ağ'));

    render(<StageListScreen stage="potential" />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/aşamasında fırsat yok/)).not.toBeInTheDocument();
  });
});
