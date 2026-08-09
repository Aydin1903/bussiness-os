import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompanySummaryPanel } from './company-summary';

/**
 * Müşteri özeti — beş ekran durumu (ADR-0032 §5).
 *
 * ============================================================================
 * RENK BURADA TEST EDİLMEZ, EDİLEMEZ
 * ============================================================================
 * `--ai-accent` bir CSS değişkenidir ve jsdom stylesheet çözmez. Test edilen
 * şey doğru olan tek şeydir: AI'a ait öğelerin `ai-*` SINIFLARINI taşıması.
 * Sınıf yerindeyse değer `module-colors.css`'in ve `globals.css`'in
 * sorumluluğundadır; gerçek renk Slice 9 denetiminde tarayıcıda gezilir.
 */
const getCompanySummary = vi.hoisted(() => vi.fn());
const generateCompanySummary = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/crm', () => ({ getCompanySummary, generateCompanySummary }));

const COMPANY_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';

const READY = {
  summary: 'Acme ile bütçe onaylandı, teklif aşamasında.',
  generatedAt: '2026-08-08T09:00:00.000Z',
  stale: false,
  generating: false,
  summarizable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCompanySummary.mockResolvedValue(READY);
});

function renderPanel(readOnly = false) {
  return render(<CompanySummaryPanel companyId={COMPANY_ID} readOnly={readOnly} />);
}

describe('CompanySummaryPanel — beş durum', () => {
  it('VAR: özet metni ve tarihi görünür', async () => {
    renderPanel();

    expect(await screen.findByText(READY.summary)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yenile' })).toBeInTheDocument();
  });

  it('YOK: davet metni ve "Özet çıkar" düğmesi', async () => {
    getCompanySummary.mockResolvedValue({ ...READY, summary: null, generatedAt: null });

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Özet çıkar' })).toBeInTheDocument();
  });

  it('BAYAT: "sonrasında değişiklik var" rozeti — renk TEK taşıyıcı değil', async () => {
    getCompanySummary.mockResolvedValue({ ...READY, stale: true });

    renderPanel();

    // Rozet METİN taşır; renk körlüğünde de okunur.
    expect(await screen.findByText('sonrasında değişiklik var')).toBeInTheDocument();
  });

  it('ÜRETİLİYOR: düğme kilitli, durum yazıyla söyleniyor', async () => {
    getCompanySummary.mockResolvedValue({ ...READY, generating: true });

    renderPanel();

    expect(await screen.findByText('Özet hazırlanıyor…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hazırlanıyor…' })).toBeDisabled();
  });

  it('HATA: uç çökerse blok hiç çizilmez, sayfa çalışmaya devam eder', async () => {
    getCompanySummary.mockRejectedValue(new Error('ağ'));

    const { container } = renderPanel();

    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
  });
});

describe('CompanySummaryPanel — görüşme yoksa üretim KAPALI', () => {
  it('düğme çizilmez ve sebep yazıyla söylenir', async () => {
    getCompanySummary.mockResolvedValue({
      ...READY,
      summary: null,
      generatedAt: null,
      summarizable: false,
    });

    renderPanel();

    expect(await screen.findByText(/henüz bir görüşme kaydedilmemiş/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — israf freni KULLANICIYA söylenir', () => {
  it('regenerated:false ise "mevcut özet güncel" bildirimi çıkar', async () => {
    // Söylenmeseydi kullanıcı "yenile"ye basıp metnin değişmemesini bir hata
    // sanardı — sessiz doğruluk, görünür yanlışlıktan iyi değildir.
    generateCompanySummary.mockResolvedValue({ ...READY, regenerated: false });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));

    expect(await screen.findByText(/mevcut özet güncel/)).toBeInTheDocument();
  });

  it('regenerated:true ise bildirim ÇIKMAZ, yeni metin görünür', async () => {
    generateCompanySummary.mockResolvedValue({
      ...READY,
      summary: 'Yeni özet.',
      regenerated: true,
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));

    expect(await screen.findByText('Yeni özet.')).toBeInTheDocument();
    expect(screen.queryByText(/mevcut özet güncel/)).not.toBeInTheDocument();
  });

  it('409 gelirse hata gösterilir, mevcut özet SİLİNMEZ', async () => {
    generateCompanySummary.mockRejectedValue(new Error('Bu musterinin ozeti su anda hazirlaniyor'));

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Yenile' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(READY.summary)).toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — viewer OKUR, üretemez', () => {
  it('readOnly iken düğme yok ama özet görünür', async () => {
    renderPanel(true);

    expect(await screen.findByText(READY.summary)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CompanySummaryPanel — AI sesi', () => {
  it('özet metni serif AI sınıfını taşır', async () => {
    const { container } = renderPanel();

    await screen.findByText(READY.summary);
    expect(container.querySelector('.ai-voice-lead')).not.toBeNull();
  });

  it('asistan noktası `bg-ai-accent` taşır — modülün rengini DEĞİL', async () => {
    const { container } = renderPanel();

    await screen.findByText(READY.summary);
    expect(container.querySelector('.bg-ai-accent')).not.toBeNull();
    expect(container.querySelector('.bg-accent')).toBeNull();
  });
});
