import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { FollowUpsScreen } from './follow-ups-screen';

/**
 * `/app/crm/follow-ups` — takipler.
 *
 * En değerli iddia: GECİKME işaretini istemci koyar ve KULLANICININ takvim
 * gününe göre koyar. Bu yüzden test sabit bir tarih yazmaz — bugüne göre
 * kaydırılmış günler üretir; aksi halde test yarın kırmızıya dönerdi.
 */
const listFollowUps = vi.hoisted(() => vi.fn());

/*
 * ⚠️ ODANIN DUVARI MOCK'LANIR — bu testin konusu ekranın KENDİ mantığı.
 * Duvar ayrı bir bileşendir, kendi veri çağrılarını yapar ve kendi testini
 * hak eder; buraya karıştırmak her ekran testine ilgisiz mock'lar
 * eklettirirdi (ADR-0038 §6.5 — duvar ortak, tezgah değişir).
 */
vi.mock('./crm-wall', () => ({ CrmWall: () => null }));
vi.mock('@/lib/api/crm', () => ({ listFollowUps }));
vi.mock('next/navigation', () => ({ usePathname: () => '/app/crm/follow-ups' }));

/** Bugünden `days` gün kaydırılmış YEREL takvim günü (`YYYY-MM-DD`). */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function followUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    opportunityId: '11111111-1111-4111-8111-111111111111',
    title: 'Yıllık sözleşme',
    stage: 'in_discussion',
    companyId: '22222222-2222-4222-8222-222222222222',
    companyName: 'Kuzey Mimarlık',
    nextFollowUpOn: dayOffset(3),
    ...overrides,
  };
}

function page(items: ReturnType<typeof followUp>[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  listFollowUps.mockResolvedValue(page([followUp()]));
});

describe('FollowUpsScreen — gecikme işareti', () => {
  it('geçmiş tarihli takip KAÇ GÜN geciktiğini yazar', async () => {
    listFollowUps.mockResolvedValue(page([followUp({ nextFollowUpOn: dayOffset(-5) })]));

    render(<FollowUpsScreen />);

    expect(await screen.findByText(/5 gün gecikti/)).toBeInTheDocument();
  });

  it('bugünkü takip "bugün" der — gecikmiş DEMEZ', async () => {
    listFollowUps.mockResolvedValue(page([followUp({ nextFollowUpOn: dayOffset(0) })]));

    render(<FollowUpsScreen />);

    expect(await screen.findByText(/bugün/)).toBeInTheDocument();
    expect(screen.queryByText(/gecikti/)).not.toBeInTheDocument();
  });

  it('gelecekteki takip yalnızca tarihi gösterir', async () => {
    render(<FollowUpsScreen />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(screen.queryByText(/gecikti/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bugün/)).not.toBeInTheDocument();
  });

  it('gecikmiş sayısı başlıkta ve "bu sayfada" diye SINIRLANDIRILARAK yazılır', async () => {
    listFollowUps.mockResolvedValue(
      page(
        [
          followUp({ opportunityId: 'a', nextFollowUpOn: dayOffset(-2) }),
          followUp({ opportunityId: 'b', nextFollowUpOn: dayOffset(-1) }),
          followUp({ opportunityId: 'c', nextFollowUpOn: dayOffset(5) }),
        ],
        40,
      ),
    );

    render(<FollowUpsScreen />);

    // Sayı YALNIZCA bu sayfadan hesaplanır; toplamı iddia etmek için sunucuya
    // ayrı bir sorgu gerekirdi.
    expect(await screen.findByText(/bu sayfada gecikmiş/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('FollowUpsScreen — liste', () => {
  it('sunucunun SIRASINI korur — istemci yeniden sıralamaz', async () => {
    listFollowUps.mockResolvedValue(
      page([
        followUp({ opportunityId: 'a', title: 'Gecikmiş', nextFollowUpOn: dayOffset(-3) }),
        followUp({ opportunityId: 'b', title: 'Yarın', nextFollowUpOn: dayOffset(1) }),
        followUp({ opportunityId: 'c', title: 'Gelecek ay', nextFollowUpOn: dayOffset(30) }),
      ]),
    );

    render(<FollowUpsScreen />);

    await screen.findByRole('link', { name: 'Gecikmiş' });

    // Sorgu LİSTEYE daraltılır: sayfada sekme bağlantıları da var ve
    // `getAllByRole('link')` onları da toplardı.
    const titles = within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(titles).toEqual(['Gecikmiş', 'Yarın', 'Gelecek ay']);
  });

  it('satır müşteri adını gösterir ve MÜŞTERİYE bağlanır', async () => {
    render(<FollowUpsScreen />);

    const link = await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(link).toHaveAttribute('href', '/app/crm/22222222-2222-4222-8222-222222222222');
    expect(screen.getByText('Kuzey Mimarlık')).toBeInTheDocument();
  });

  it('takip yoksa neden boş olduğunu açıklar', async () => {
    listFollowUps.mockResolvedValue(page([]));

    render(<FollowUpsScreen />);

    expect(await screen.findByText('Bekleyen takip yok')).toBeInTheDocument();
  });

  /**
   * "Takibi tamamla" düğmesi YOK: görünümün kendi verisi yoktur, tamamlamak
   * fırsatın tarihini ya da aşamasını değiştirmektir ve o iş fırsatın kendi
   * formunda yapılır (ADR-0031 §3).
   */
  it('takibi "tamamlama" eylemi YOK — görünümün kendi verisi yok', async () => {
    render(<FollowUpsScreen />);

    await screen.findByRole('link', { name: 'Yıllık sözleşme' });
    expect(screen.queryByRole('button', { name: /tamamla/i })).not.toBeInTheDocument();
  });

  it('liste düşerse "takip yok" DEMEZ — hatayı söyler', async () => {
    listFollowUps.mockRejectedValue(
      new ApiError(
        500,
        {
          type: 'https://api.businessos.com/errors/test',
          title: 'Hata',
          status: 500,
          detail: 'Sunucu hatası.',
        },
        'Hata',
      ),
    );

    render(<FollowUpsScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucu hatası.');
    expect(screen.queryByText('Bekleyen takip yok')).not.toBeInTheDocument();
  });

  it('sayfalama sunucunun toplamına göre çizilir', async () => {
    listFollowUps.mockResolvedValue(page([followUp()], 40));

    render(<FollowUpsScreen />);

    expect(await screen.findByRole('button', { name: 'Önceki' })).toBeDisabled();

    await waitFor(() => {
      expect(listFollowUps).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });
  });
});
