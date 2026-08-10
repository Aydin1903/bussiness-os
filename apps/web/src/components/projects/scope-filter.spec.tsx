import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScopeFilter } from './scope-filter';

/**
 * Kapsam seçici — SEKME DEĞİL.
 *
 * ============================================================================
 * NEDEN BU AYRIM TEST EDİLİYOR
 * ============================================================================
 * Görünüm sekme şeridiyle AYNI reçetedir (bilinçli: aynı ekranda iki farklı
 * "seçim yapılıyor" dili olmasın). Bu yüzden ayrımın tek görünür kanıtı
 * SEMANTİKTİR: bunlar `<button aria-pressed>`, `<a aria-current>` değil.
 *
 * Biri "tutarlılık olsun" diye `<Link>`e çevirirse ekran okuyucu kullanıcısına
 * "gidilecek yer" diye sunulur ve yalan söylenmiş olur — üstelik URL
 * değişmediği için geri tuşu da beklendiği gibi çalışmaz.
 */
describe('ScopeFilter', () => {
  it('BAĞLANTI DEĞİL, düğmedir', () => {
    render(<ScopeFilter scope="inbox" onPick={vi.fn()} />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('seçili kapsam `aria-pressed` ile bildirilir', () => {
    render(<ScopeFilter scope="overdue" onPick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Gecikmiş' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Projesiz' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('tıklanınca seçilen kapsamı bildirir', () => {
    const onPick = vi.fn();
    render(<ScopeFilter scope="inbox" onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gecikmiş' }));

    expect(onPick).toHaveBeenCalledWith('overdue');
  });

  it('grup, ekran okuyucuya ADIYLA sunulur', () => {
    render(<ScopeFilter scope="inbox" onPick={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Görev kapsamı' })).toBeInTheDocument();
  });
});
