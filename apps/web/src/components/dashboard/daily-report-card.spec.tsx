import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { DailyReportCard, formatRelativeTime } from './daily-report-card';

/**
 * Günlük rapor kartı — üç durum: rapor var, rapor yok, çağrı çöktü.
 *
 * `fetchDailyReport` MOCK'lanır; test edilen şey kartın kullanıcıya NE
 * GÖSTERDİĞİDİR (API sözleşmesinin kendi testleri `client.spec.ts`).
 */
const fetchDailyReport = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ fetchDailyReport }));

function reportResponse(overrides: Partial<{ summary: string; generatedAt: string }> = {}) {
  return {
    report: {
      reportDate: '2026-08-04',
      summary: 'Bugun fatura sureci gozden gecirildi.',
      generatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    },
  };
}

beforeEach(() => {
  fetchDailyReport.mockResolvedValue(reportResponse());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DailyReportCard — rapor VARKEN', () => {
  it('ozeti gosterir', async () => {
    render(<DailyReportCard />);

    expect(await screen.findByText('Bugun fatura sureci gozden gecirildi.')).toBeInTheDocument();
  });

  it('baslik gosterilir', async () => {
    render(<DailyReportCard />);

    expect(await screen.findByRole('heading', { name: 'Günlük özet' })).toBeInTheDocument();
  });

  it('uretim zamanini GORELI gosterir', async () => {
    render(<DailyReportCard />);

    expect(await screen.findByText('3 saat önce oluşturuldu')).toBeInTheDocument();
  });

  it('bos durum metni GOSTERILMEZ', async () => {
    render(<DailyReportCard />);

    await screen.findByText('Bugun fatura sureci gozden gecirildi.');
    expect(screen.queryByText(/Henüz bir özet yok/)).not.toBeInTheDocument();
  });
});

describe('DailyReportCard — rapor YOKKEN', () => {
  it('nazik bos durum gosterir', async () => {
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<DailyReportCard />);

    expect(await screen.findByText(/Henüz bir özet yok/)).toBeInTheDocument();
  });

  it('kart YINE DE gorunur — ozellik kesfedilebilir kalmali', async () => {
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<DailyReportCard />);

    expect(await screen.findByRole('heading', { name: 'Günlük özet' })).toBeInTheDocument();
  });

  it('bos durumda SAAT yazmaz — sunucu config i istemcide tekrarlanmaz', async () => {
    fetchDailyReport.mockResolvedValue({ report: null });

    render(<DailyReportCard />);

    const element = await screen.findByText(/Henüz bir özet yok/);
    expect(element.textContent).not.toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe('DailyReportCard — cagri COKERSE', () => {
  it('SAYFA COKMEZ, kart sessizce kaybolur', async () => {
    fetchDailyReport.mockRejectedValue(new ApiError(500, undefined, 'Sunucu hatasi'));

    const { container } = render(<DailyReportCard />);

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('kullaniciya hata mesaji GOSTERILMEZ', async () => {
    // Bir ozet kartinin yuklenememesi kullanicinin ilgilenmesi gereken bir sey
    // degil; panelin geri kalani calisiyor.
    fetchDailyReport.mockRejectedValue(new Error('ag hatasi'));

    render(<DailyReportCard />);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/hata/i)).not.toBeInTheDocument();
  });

  it('yuklenirken hicbir sey cizilmez (sicrama olmasin)', () => {
    // Hic cozulmeyen promise: kart kalici olarak `loading` fazinda kalir.
    fetchDailyReport.mockReturnValue(
      new Promise(() => {
        // Bilerek bos: bu promise ASLA cozulmemeli.
      }),
    );

    const { container } = render(<DailyReportCard />);

    expect(container).toBeEmptyDOMElement();
  });
});

// --- Goreli zaman ------------------------------------------------------------

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-08-04T12:00:00.000Z');

  it('bir dakikadan yeni: "az once"', () => {
    expect(formatRelativeTime('2026-08-04T11:59:30.000Z', NOW)).toBe('az önce');
  });

  it('dakika', () => {
    expect(formatRelativeTime('2026-08-04T11:45:00.000Z', NOW)).toBe('15 dakika önce');
  });

  it('saat', () => {
    expect(formatRelativeTime('2026-08-04T09:00:00.000Z', NOW)).toBe('3 saat önce');
  });

  it('gun', () => {
    expect(formatRelativeTime('2026-08-02T12:00:00.000Z', NOW)).toBe('2 gün önce');
  });

  it('GELECEK tarih "az once" sayilir — saat kaymasi negatif sure uretmesin', () => {
    expect(formatRelativeTime('2026-08-04T12:00:30.000Z', NOW)).toBe('az önce');
  });

  it('ayristirilamayan deger COKMEZ', () => {
    expect(formatRelativeTime('bozuk-tarih', NOW)).toBe('yakın zamanda');
  });
});
