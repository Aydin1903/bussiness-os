import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './sidebar';

/**
 * Gezinme — hangi modülün GERÇEK, hangisinin placeholder olduğu.
 *
 * Bu ayrım bir kez kayda geçti: "Bilgi Bankası" Faz 4'te tamamen çalışır hale
 * geldiği hâlde sidebar Faz 3'ten kalma "yakında" rozetini taşımaya devam
 * ediyordu ve modül kullanıcı için ERİŞİLEMEZ kalmıştı. Aynı hatanın CRM'de
 * tekrarlanmaması için "Müşteriler" satırı da burada sabitlendi (Slice 8a).
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

/** Aktif satır hesabı `usePathname`'e bağlı; her testte yol açıkça verilir. */
const pathname = vi.hoisted(() => ({ current: '/app' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderAt(path: string, collapsed = false) {
  pathname.current = path;
  return render(<Sidebar collapsed={collapsed} />);
}

describe('Sidebar — gezinme', () => {
  it('Panel GERÇEK bir link', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('href', '/app');
  });

  it('Müşteriler GERÇEK bir link — CRM ekranları çalışıyor', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute('href', '/app/crm');
  });

  it('henüz gelmemiş modüller link DEĞİL', () => {
    // Olmayan bir şeye tıklanabilir görünüm vermek, vaat etmektir.
    renderAt('/app');

    for (const label of ['Finans', 'Projeler']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('yalnızca placeholder modüller "yakında" rozeti taşır', () => {
    renderAt('/app');

    expect(screen.getAllByText('yakında')).toHaveLength(2);
  });

  it('ayrı bir "Bilgi Bankası" satırı YOK — çalışma yüzeyi Panel', () => {
    renderAt('/app');

    expect(screen.queryByText('Bilgi Bankası')).not.toBeInTheDocument();
  });
});

/**
 * Aktiflik — iki canlı satır olduğu anda HESAPLANMAK zorunda.
 *
 * Eskiden vurgu koşulsuzdu ve tek satır varken doğru görünüyordu; ikinci satır
 * eklendiğinde ikisi birden aktif görünürdü. Kural "en uzun eşleşen önek"tir
 * ve üç tuzağı birden kapatır (aşağıdaki üç test tam olarak onlar).
 */
describe('Sidebar — aktif satır', () => {
  it('/app üzerinde YALNIZCA Panel aktif', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Müşteriler' })).not.toHaveAttribute('aria-current');
  });

  it('/app/crm üzerinde Panel DEĞİL Müşteriler aktif — her yol /app ile başlar', () => {
    renderAt('/app/crm');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('aria-current');
  });

  it('şirket DETAY sayfasında Müşteriler aktif kalır', () => {
    renderAt('/app/crm/2f1c9a44-0000-4000-8000-000000000001');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('/app/knowledge üzerinde Panel aktif — arşiv Panel’in altındadır', () => {
    renderAt('/app/knowledge');

    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sidebar — kimlik solda toplanır', () => {
  it('şirket anahtarı ÜSTTE, kullanıcı menüsü ALTTA', () => {
    renderAt('/app');

    expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });
});

describe('Sidebar — daraltılmış', () => {
  it('daraltılınca etiketler gizlenir, link erişilebilir kalır', () => {
    renderAt('/app', true);

    // Görsel etiket yok ama `title` erişilebilir adı sağlıyor.
    expect(screen.getByRole('link', { name: 'Panel' })).toBeInTheDocument();
    expect(screen.queryByText('yakında')).not.toBeInTheDocument();
  });

  it('daraltılınca şirket/kullanıcı satırları çizilmez', () => {
    renderAt('/app', true);

    expect(screen.queryByTestId('company-switcher')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });
});
