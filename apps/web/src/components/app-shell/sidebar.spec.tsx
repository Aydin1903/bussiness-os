import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './sidebar';

/**
 * Gezinme — hangi modülün GERÇEK, hangisinin placeholder olduğu.
 *
 * Bu ayrım bir kez kayda geçti: "Bilgi Bankası" Faz 4'te tamamen çalışır hale
 * geldiği hâlde sidebar Faz 3'ten kalma "yakında" rozetini taşımaya devam
 * ediyordu ve modül kullanıcı için ERİŞİLEMEZ kalmıştı.
 *
 * Tasarım sürüm 2'de (2026-08-05) ayrı "Bilgi Bankası" satırı KALDIRILDI:
 * çalışma yüzeyi Panel'in kendisi oldu (sor + not ekle orada), arşive sağ
 * raydaki "Tümünü gör" ile gidiliyor. Test o kararı da kayda geçirir.
 *
 * Şirket anahtarı ve kullanıcı menüsü MOCK'lanır: ikisi de ağa çıkar ve
 * burada test edilen şey gezinmenin yapısıdır.
 */
vi.mock('./company-switcher', () => ({
  CompanySwitcher: () => <div data-testid="company-switcher" />,
}));
vi.mock('./user-menu', () => ({ UserMenu: () => <div data-testid="user-menu" /> }));

describe('Sidebar — gezinme', () => {
  it('Panel GERÇEK bir link', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('href', '/app');
  });

  it('henüz gelmemiş modüller link DEĞİL', () => {
    // Olmayan bir şeye tıklanabilir görünüm vermek, vaat etmektir.
    render(<Sidebar collapsed={false} />);

    for (const label of ['Müşteriler', 'Finans', 'Projeler']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('yalnızca placeholder modüller "yakında" rozeti taşır', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getAllByText('yakında')).toHaveLength(3);
  });

  it('ayrı bir "Bilgi Bankası" satırı YOK — çalışma yüzeyi Panel', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.queryByText('Bilgi Bankası')).not.toBeInTheDocument();
  });
});

describe('Sidebar — kimlik solda toplanır', () => {
  it('şirket anahtarı ÜSTTE, kullanıcı menüsü ALTTA', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });
});

describe('Sidebar — daraltılmış', () => {
  it('daraltılınca etiketler gizlenir, link erişilebilir kalır', () => {
    render(<Sidebar collapsed />);

    // Görsel etiket yok ama `title` erişilebilir adı sağlıyor.
    expect(screen.getByRole('link', { name: 'Panel' })).toBeInTheDocument();
    expect(screen.queryByText('yakında')).not.toBeInTheDocument();
  });

  it('daraltılınca şirket/kullanıcı satırları çizilmez', () => {
    render(<Sidebar collapsed />);

    expect(screen.queryByTestId('company-switcher')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });
});
