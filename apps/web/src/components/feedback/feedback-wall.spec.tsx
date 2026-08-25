import type { FeedbackSummary } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FeedbackWall } from './feedback-wall';

/**
 * Geri bildirim duvarı (ADR-0045 §9).
 *
 * ⚠️ BU DOSYANIN ASIL İŞİ §9.1'İ KİLİTLEMEKTİR: `N = 0` iken ortalama HİÇ
 * gösterilmez. `0,0` basılsaydı "çok kötü" ile "hiç veri yok" AYNI GÖRÜNÜRDÜ
 * ve hata SESSİZ olurdu.
 */

function summary(overrides: Partial<FeedbackSummary> = {}): FeedbackSummary {
  return {
    average: '4.2',
    count: 12,
    lowRatingCount: 3,
    withoutCommentCount: 5,
    windowDays: 30,
    lowRatingMax: 2,
    ...overrides,
  };
}

describe('FeedbackWall (ADR-0045 §9)', () => {
  it('ortalamayı SUNUCUNUN kanonik dizesiyle basar', () => {
    // ⚠️ `Number`a ÇEVRİLMEZ: yuvarlama sunucuda yapıldı (`round(avg, 1)`).
    // Burada yeniden biçimlendirmek İKİ YERDE İKİ FARKLI yuvarlama demekti.
    render(<FeedbackWall summary={summary({ average: '4.2' })} loading={false} />);

    expect(screen.getByText('4.2')).toBeInTheDocument();
  });

  it('⚠️ N HER ZAMAN ortalamanın yanında yazılır (§9.1)', () => {
    // Tek kayıtlık bir ortalama bir eğilim DEĞİLDİR; N'siz okunması onu bir
    // eğilim gibi gösterirdi.
    render(<FeedbackWall summary={summary({ count: 12 })} loading={false} />);

    expect(screen.getByText(/12 geri bildirim/)).toBeInTheDocument();
  });

  it('⚠️ N = 0 iken ORTALAMA GÖSTERİLMEZ — "0,0" ya da "0" BASILMAZ', () => {
    render(
      <FeedbackWall
        summary={summary({ average: null, count: 0, lowRatingCount: 0, withoutCommentCount: 0 })}
        loading={false}
      />,
    );

    // ⚠️ Kahraman rakam yerine bir TİRE: "veri yok"u "çok kötü"den ayırır.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.queryByText('0,0')).not.toBeInTheDocument();
  });

  it('N = 0 iken ne yapılacağını SÖYLER', () => {
    render(<FeedbackWall summary={summary({ average: null, count: 0 })} loading={false} />);

    expect(screen.getByText(/Bu pencerede geri bildirim yok/)).toBeInTheDocument();
  });

  it('⚠️ PENCERE ETİKETİ SUNUCUDAN gelen sayıyla kurulur — "30" gömülü DEĞİL', () => {
    // Gömülü olsaydı sunucudaki pencere değiştiğinde ekran eski sayıyı
    // göstermeye devam ederdi ve hata SESSİZ olurdu.
    render(<FeedbackWall summary={summary({ windowDays: 7 })} loading={false} />);

    expect(screen.getAllByText(/son 7 günde/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/son 30 günde/)).not.toBeInTheDocument();
  });

  it('⚠️ DÜŞÜK PUAN EŞİĞİ de SUNUCUDAN gelir — "≤2" gömülü DEĞİL', () => {
    render(<FeedbackWall summary={summary({ lowRatingMax: 3 })} loading={false} />);

    expect(screen.getByText('≤3 puan')).toBeInTheDocument();
  });

  it('⚠️ "Yorumsuz" uydusu MODÜLÜN KENDİ SINIRINI görünür kılar (§3.5)', () => {
    // Yorumsuz kayıtların `POST /ask` havuzunda hiçbir sesi yoktur.
    // Göstermemek, "asistan neden bu puanları bilmiyor" sorusunu CEVAPSIZ
    // bırakırdı.
    render(<FeedbackWall summary={summary({ withoutCommentCount: 5 })} loading={false} />);

    expect(screen.getByText('Yorumsuz')).toBeInTheDocument();
    expect(screen.getByText('aranamaz')).toBeInTheDocument();
  });

  it('⚠️ BİR TREND OKU YOKTUR (§10)', () => {
    // "Geçen aya göre +0,3" İKİNCİ BİR PENCERE ve bir KARŞILAŞTIRMA kararıdır;
    // NPS/trend analizi ADR §10'da açıkça kapsam dışıdır.
    const { container } = render(<FeedbackWall summary={summary()} loading={false} />);

    expect(container.textContent).not.toMatch(/geçen ay|önceki|trend|↑|↓/i);
  });

  it('yüklenirken iskelet gösterir, sayı UYDURMAZ', () => {
    const { container } = render(<FeedbackWall summary={null} loading />);

    expect(container.textContent).not.toMatch(/\d/);
  });
});
