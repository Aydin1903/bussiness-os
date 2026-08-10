import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DueMark, StatusPill, TaskStatusPill } from './marks';

/**
 * Projeler'in kart işaretleri.
 *
 * ============================================================================
 * TESTLER SABİT TARİH YAZMAZ
 * ============================================================================
 * "Gecikmiş" BUGÜNE göre hesaplanır; sabit bir tarih yazan test yarın kırmızıya
 * döner. Günler bugünden kaydırılarak üretilir — `signals.spec.tsx`'in aynı
 * yaklaşımı (global `Date`'i değiştirmek yerine girdiyi kaydırmak).
 */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('DueMark', () => {
  it('tarihsiz görevde HİÇBİR ŞEY çizilmez', () => {
    const { container } = render(<DueMark day={null} done={false} />);
    // "Son tarih yok" yazmak, boş bir alanı doldurulmuş gibi göstermek olurdu.
    expect(container).toBeEmptyDOMElement();
  });

  it('GEÇMİŞ tarih gecikmiş olarak işaretlenir', () => {
    render(<DueMark day={dayOffset(-5)} done={false} />);
    expect(screen.getByText(/5 gün GECİKTİ/)).toBeInTheDocument();
  });

  it('BİTMİŞ görev geçmiş tarihli olsa da GECİKMİŞ SAYILMAZ', () => {
    // ⚠️ Backend'in `overdue` yüklemi de `status <> 'done'` taşır. İki taraf
    // ayrışsaydı ekran, AI'ın saymadığı bir görevi gecikmiş gösterirdi (ya da
    // tersi) ve hangisinin doğru olduğu belirsiz kalırdı.
    render(<DueMark day={dayOffset(-5)} done />);
    expect(screen.queryByText(/GECİKTİ/)).not.toBeInTheDocument();
    expect(screen.getByText(/Son tarih/)).toBeInTheDocument();
  });

  it('GELECEK tarih sessiz kalır', () => {
    render(<DueMark day={dayOffset(10)} done={false} />);
    expect(screen.queryByText(/GECİKTİ/)).not.toBeInTheDocument();
    expect(screen.getByText(/Son tarih/)).toBeInTheDocument();
  });

  it('BUGÜN gecikmiş SAYILMAZ', () => {
    // Sınır: `due_on < bugün` yüklemi bugünü DIŞLAR; bugün biten bir iş henüz
    // gecikmemiştir.
    render(<DueMark day={dayOffset(0)} done={false} />);
    expect(screen.queryByText(/GECİKTİ/)).not.toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('durumun ADINI yazar — renk tek başına bilgi taşımaz', () => {
    // FRONTEND §4.8'in renk körlüğü kuralı: rozet yalnızca renkle ayrılsaydı
    // renk körü kullanıcı için hiçbir şey söylemezdi.
    render(<StatusPill status="in_progress" />);
    expect(screen.getByText('Devam Ediyor')).toBeInTheDocument();
  });

  it('kapanmış durumlar da adıyla yazılır', () => {
    render(<StatusPill status="cancelled" />);
    expect(screen.getByText('İptal')).toBeInTheDocument();
  });
});

describe('TaskStatusPill', () => {
  it('görev durumunun adını yazar', () => {
    render(<TaskStatusPill status="todo" />);
    expect(screen.getByText('Yapılacak')).toBeInTheDocument();
  });
});
