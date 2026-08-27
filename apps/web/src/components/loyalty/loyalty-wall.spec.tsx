import type { LoyaltySummary } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoyaltyWall } from './loyalty-wall';

const SUMMARY: LoyaltySummary = {
  windowDays: 30,
  outstandingPoints: 12_400,
  accountCount: 37,
  earnedInWindow: 3_150,
  spentInWindow: 900,
};

describe('LoyaltyWall', () => {
  it('kahraman rakam DOLASIMDAKI TOPLAM PUANDIR ve binlik ayracli yazilir', () => {
    // ⚠️ ADR-0051 §9.1: projede ILK KEZ anlamli bir TOPLAM. ADR-0034'un para
    // birimi ve ADR-0039'un birim kurali burada TETIKLENMEZ — puanin para
    // birimi yoktur ve tek bir birim vardir.
    render(<LoyaltyWall summary={SUMMARY} loading={false} />);

    expect(screen.getByText('Dolaşımdaki puan')).toBeInTheDocument();
    expect(screen.getByText('12.400')).toBeInTheDocument();
  });

  it('⚠️ PARA BIRIMI SIMGESI YAZILMAZ — puanin TL karsiligi modellenmiyor', () => {
    // ⚠️ Bir simge, olmayan bir donusumu IMA ederdi (§10: puanin para
    // karsiligi kapsam disi).
    const { container } = render(<LoyaltyWall summary={SUMMARY} loading={false} />);

    expect(container.textContent).not.toMatch(/₺|TL|EUR|USD/);
  });

  it('⚠️ HESAP YOKKEN `0` BASILMAZ — bos bir odada sifir bir HABER gibi okunur', () => {
    // ADR-0047 §9'un kurali, ikinci kez.
    render(
      <LoyaltyWall
        summary={{ ...SUMMARY, accountCount: 0, outstandingPoints: 0 }}
        loading={false}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('henüz hesap yok')).toBeInTheDocument();
  });

  it('kazandirilan ve kullanilan YAN YANA durur — biri tek basina yukumlulugu soylemez', () => {
    render(<LoyaltyWall summary={SUMMARY} loading={false} />);

    expect(screen.getByText('Kazandırılan')).toBeInTheDocument();
    expect(screen.getByText('3.150')).toBeInTheDocument();
    expect(screen.getByText('Kullanılan')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
  });

  it('pencere metni SUNUCUDAN gelir — arayuz "son 30 gunde" yazmaz', () => {
    // ⚠️ `windowDays` sunucunun kanonik degeridir; arayuzde sabit yazilsaydi
    // sunucu penceresi degistiginde ekran SESSIZCE yanlis olurdu.
    render(<LoyaltyWall summary={{ ...SUMMARY, windowDays: 7 }} loading={false} />);

    expect(screen.getAllByText('son 7 günde').length).toBeGreaterThan(0);
  });

  it('yuklenirken iskelet gosterir, sayi UYDURMAZ', () => {
    const { container } = render(<LoyaltyWall summary={null} loading />);

    expect(container.textContent).toBe('');
  });
});
