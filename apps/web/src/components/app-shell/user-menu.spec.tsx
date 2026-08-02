import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserMenu } from './user-menu';

const push = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/session/logout', () => ({ logout }));

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı menüsü' }));
}

beforeEach(() => {
  push.mockReset();
  logout.mockReset();
  logout.mockResolvedValue(undefined);
});

describe('UserMenu', () => {
  it('kapalıyken hesap eylemlerini göstermez', () => {
    render(<UserMenu />);

    expect(screen.queryByRole('link', { name: 'Şifre Değiştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çıkış' })).toBeNull();
  });

  it('açıldığında "Şifre Değiştir" bağlantısını /app/change-password e yönlendirir', () => {
    render(<UserMenu />);

    openMenu();

    expect(screen.getByRole('link', { name: 'Şifre Değiştir' })).toHaveAttribute(
      'href',
      '/app/change-password',
    );
  });

  it('bağlantıya tıklanınca menüyü kapatır', () => {
    render(<UserMenu />);

    openMenu();
    fireEvent.click(screen.getByRole('link', { name: 'Şifre Değiştir' }));

    expect(screen.queryByRole('link', { name: 'Şifre Değiştir' })).toBeNull();
  });

  it('çıkış eylemi korunur (yeni bağlantı onu gölgelemez)', () => {
    render(<UserMenu />);

    openMenu();

    expect(screen.getByRole('button', { name: 'Çıkış' })).toBeInTheDocument();
  });
});
