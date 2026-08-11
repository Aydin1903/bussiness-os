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

  it('Projeler ARTIK gerçek bir bağlantı', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Projeler' })).toHaveAttribute('href', '/app/projects');
  });

  it('Finans ARTIK gerçek bir bağlantı', () => {
    // ⚠️ Slice 7'de SOON'dan LIVE'a taşındı: üç rota çalışıyor. Modül çalışır
    // hâldeyken "yakında" rozetini taşımaya devam etmek, Faz 4'te bir kez
    // yaşanan ve modülü kullanıcı için erişilemez bırakan hatanın aynısı olurdu.
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Finans' })).toHaveAttribute('href', '/app/finance');
  });

  it('⚠️ "YAKINDA" BÖLÜMÜ HİÇ ÇİZİLMEZ — dizi boş', () => {
    // ============================================================================
    // BU TESTİN İŞİ BİR ŞEYİN OLMADIĞINI KANITLAMAKTIR
    // ============================================================================
    // Finans LIVE'a taşınınca `SOON` boşaldı. Bölüm koşulsuz çizilseydi ekranda
    // İÇİ BOŞ bir "MODÜLLER" başlığı kalırdı: ekran çalışır, lint yakalamaz,
    // hiçbir test kırmızı yanmaz — yalnızca anlamsız bir boşluk görünür.
    // ADR-0034 §10 bu tuzağı adıyla kaydetti.
    renderAt('/app');

    expect(screen.queryByText('yakında')).not.toBeInTheDocument();
    expect(screen.queryByText('Modüller')).not.toBeInTheDocument();
  });

  it('ayrı bir "Bilgi Bankası" satırı YOK — çalışma yüzeyi Panel', () => {
    renderAt('/app');

    expect(screen.queryByText('Bilgi Bankası')).not.toBeInTheDocument();
  });
});

/**
 * Modül başına imza rengi — satır kendi kapsamını TAŞIR.
 *
 * ============================================================================
 * NEDEN BU TEST VAR: `data-module` UNUTULURSA HATA SESSİZDİR
 * ============================================================================
 * Attribute eksik olduğunda ekran çalışmaya devam eder, yalnızca terracotta
 * kalır. Ne tip denetimi ne lint bunu yakalar — bir kullanıcı fark edene kadar
 * hiçbir sinyal yoktur. Test, o sessizliği sese çevirir.
 *
 * Renk DEĞERİ burada test EDİLMEZ ve edilemez: değer `module-colors.css`'te
 * yaşar, jsdom stylesheet'i çözmez. Test edilen şey doğru olan tek şeydir —
 * kapsamın deklare edilmiş olması.
 */
describe('Sidebar — modül renk kapsamı', () => {
  it('Müşteriler satırı CRM kapsamını deklare eder', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveAttribute('data-module', 'crm');
  });

  it('Panel kapsam TAŞIMAZ — bir modül değil, AI’ın yüzeyi', () => {
    // Panel'de imza rengi terracottadır ve öyle kalmalıdır. Buraya bir
    // `data-module` konsaydı AI'ın kendi ekranı bir modül gibi boyanırdı.
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('data-module');
  });

  it('Projeler satırı kendi kapsamını deklare eder — ZEYTİN', () => {
    // ⚠️ Bu iddia Slice 5'te DEĞİŞTİ: Projeler eskiden bir "yakında" satırıydı,
    // artık canlı bir bağlantı. Test o geçişi kilitler — modül çalışır hâldeyken
    // "yakında" rozetiyle kalmak, Faz 4'te bir kez yaşanan ve modülü kullanıcı
    // için erişilemez bırakan hatanın aynısı olurdu.
    //
    // Anahtar `projects`, `projeler` DEĞİL: on iki modülün hepsi İngilizce
    // anahtar taşır ve yanlış yazım SESSİZCE terracottada bırakır.
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Projeler' })).toHaveAttribute(
      'data-module',
      'projects',
    );
  });

  it('Finans satırı kendi kapsamını deklare eder — YEŞİL', () => {
    // ⚠️ Bu iddia Slice 7'de DEĞİŞTİ: Finans eskiden bir "yakında" satırıydı,
    // artık canlı bir bağlantı. Anahtar `finance`, `finans` DEĞİL — yanlış
    // yazım SESSİZCE terracottada bırakır.
    //
    // Renk DEĞERİ (#307d54 / #6cb78b) burada test EDİLMEZ ve edilemez: değer
    // `module-colors.css`'te yaşar, jsdom stylesheet'i çözmez. Gerçek renk
    // tarayıcıda, açık VE koyu temada gezilerek doğrulanır.
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Finans' })).toHaveAttribute('data-module', 'finance');
  });

  it('KABUK kapsam TAŞIMAZ — marka, modül değil', () => {
    // ⚠️ Modül başına imza rengi kuralının İKİNCİ MODÜLDEKİ asıl sınavı budur.
    // `data-module` modülün kendi layout'undadır, kabukta değil; dolayısıyla
    // sidebar'ın kendisi hiçbir modülün rengini almaz ve terracotta kalır.
    // Kabuğa konsaydı burada bir `data-module` bulunurdu.
    const { container } = renderAt('/app');

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav).not.toHaveAttribute('data-module');
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
  });

  it('daraltılınca şirket/kullanıcı satırları çizilmez', () => {
    renderAt('/app', true);

    expect(screen.queryByTestId('company-switcher')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });
});
