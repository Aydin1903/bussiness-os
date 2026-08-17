import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_ATTRIBUTE } from '@/lib/theme/theme';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { UserMenu } from './user-menu';

const push = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/session/logout', () => ({ logout }));

/**
 * ⚠️ SAĞLAYICI ZORUNLU. Menü artık tema seçimini barındırıyor (ADR-0038
 * Dilim 1) ve `useTheme` sağlayıcı yoksa FIRLATIR — sessizce varsayılana
 * düşmez. Sessiz geri dönüş, ağaca eklenmesi unutulmuş bir sağlayıcıyı çalışır
 * gibi gösterirdi; bu testin sarmalayıcısı o kararın bedelidir.
 */
function renderMenu(): void {
  render(
    <ThemeProvider>
      <UserMenu />
    </ThemeProvider>,
  );
}

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı menüsü' }));
}

beforeEach(() => {
  push.mockReset();
  logout.mockReset();
  logout.mockResolvedValue(undefined);
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('UserMenu', () => {
  it('kapalıyken hesap eylemlerini göstermez', () => {
    renderMenu();

    expect(screen.queryByRole('link', { name: 'Şifre Değiştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çıkış' })).toBeNull();
  });

  it('açıldığında "Şifre Değiştir" bağlantısını /app/change-password e yönlendirir', () => {
    renderMenu();

    openMenu();

    expect(screen.getByRole('link', { name: 'Şifre Değiştir' })).toHaveAttribute(
      'href',
      '/app/change-password',
    );
  });

  it('bağlantıya tıklanınca menüyü kapatır', () => {
    renderMenu();

    openMenu();
    fireEvent.click(screen.getByRole('link', { name: 'Şifre Değiştir' }));

    expect(screen.queryByRole('link', { name: 'Şifre Değiştir' })).toBeNull();
  });

  it('çıkış eylemi korunur (yeni bağlantı onu gölgelemez)', () => {
    renderMenu();

    openMenu();

    expect(screen.getByRole('button', { name: 'Çıkış' })).toBeInTheDocument();
  });
});

describe('UserMenu — görünüm teması', () => {
  it('üç seçeneği de sunar', () => {
    // İkili bir anahtar "sistemi takip et" durumunu yok ederdi (ADR-0038).
    renderMenu();
    openMenu();

    expect(screen.getByRole('radio', { name: 'Sistem' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Açık' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Koyu' })).toBeInTheDocument();
  });

  it('koyu seçilince belgeye yazar', () => {
    renderMenu();
    openMenu();

    fireEvent.click(screen.getByRole('radio', { name: 'Koyu' }));

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Koyu' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sisteme dönülünce attribute KALKAR', () => {
    /*
     * ⚠️ Asıl sınav bu. Attribute `"system"` diye yazılsaydı ekran koyu
     * kalmaya devam ederdi: CSS'in `:not([data-theme='light'])` koşulu
     * `system` değerinde de doğrudur. Doğru davranış attribute'u SİLMEKTİR ve
     * bunu yalnızca burada görebiliriz.
     */
    renderMenu();
    openMenu();

    fireEvent.click(screen.getByRole('radio', { name: 'Koyu' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sistem' }));

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});
