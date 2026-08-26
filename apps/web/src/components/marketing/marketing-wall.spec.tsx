import type { CampaignSummary } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarketingWall } from './marketing-wall';

/**
 * Kampanya odasının duvarı (ADR-0047 §9).
 *
 * ⚠️ İki davranış kilitleniyor:
 *   1. `totalCount === 0` iken KAHRAMAN RAKAM BASILMAZ (boş oda ≠ "sıfır")
 *   2. "Aranamayan" uydusu MODÜLÜN KENDİ SINIRINI gösterir
 */

function summary(overrides: Partial<CampaignSummary> = {}): CampaignSummary {
  return {
    windowDays: 30,
    activeCount: 2,
    endedInWindow: 3,
    missingResultCount: 1,
    unsearchableCount: 4,
    totalCount: 7,
    ...overrides,
  };
}

describe('MarketingWall', () => {
  it('yayında kampanya sayısını KAHRAMAN RAKAM olarak gösterir', () => {
    render(<MarketingWall summary={summary()} loading={false} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Yayında kampanya')).toBeInTheDocument();
  });

  it('⚠️ hiç kampanya yokken `0` BASMAZ — boş oda bir HABER değildir', () => {
    render(<MarketingWall summary={summary({ totalCount: 0, activeCount: 0 })} loading={false} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Henüz kampanya yok/)).toBeInTheDocument();
  });

  it('⚠️ "Sonucu yazılmadı" uydusu VURGULANIR — `campaign-gap`in kümesi', () => {
    // ⚠️ Degerler BILEREK ayri: iki uydu ayni sayiyi tasisaydi sorgu
    // belirsizlesir ve test dogru uyduyu okudugunu KANITLAYAMAZDI.
    render(
      <MarketingWall
        summary={summary({ endedInWindow: 3, missingResultCount: 9 })}
        loading={false}
      />,
    );

    expect(screen.getByText('Sonucu yazılmadı')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('⚠️ "Aranamayan" uydusu MODÜLÜN SINIRINI gösterir', () => {
    // Sonuç notu olmayan kampanyaların `POST /ask` havuzunda hiçbir sesi
    // yoktur; göstermemek "asistan neden bilmiyor" sorusunu cevapsız
    // bırakırdı.
    render(<MarketingWall summary={summary()} loading={false} />);

    expect(screen.getByText('Aranamayan')).toBeInTheDocument();
    expect(screen.getByText('sonuç notu yok')).toBeInTheDocument();
  });

  it('pencere SUNUCUDAN gelir — arayüz "30" yazmaz', () => {
    render(<MarketingWall summary={summary({ windowDays: 45 })} loading={false} />);

    expect(screen.getByText(/son 45 günde/)).toBeInTheDocument();
  });

  it('yüklenirken iskelet gösterir', () => {
    const { container } = render(<MarketingWall summary={null} loading />);

    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });
});
