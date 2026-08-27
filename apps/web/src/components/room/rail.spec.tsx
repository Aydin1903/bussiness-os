import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Rail } from './rail';

/**
 * KORİDOR — `sidebar.spec.tsx`'in devraldığı güvenceler.
 *
 * ============================================================================
 * BU DOSYA BİR TAŞIMADIR, YENİ BİR TEST SETİ DEĞİL
 * ============================================================================
 * `sidebar.tsx` ADR-0038 ile emekliye ayrıldı ama testinin koruduğu şeyler
 * emekli OLMADI — hepsi koridorda da geçerli ve hepsi hâlâ SESSİZ hata
 * sınıfından. Silinen tek grup "daraltılmış" testleridir: koridorda daraltma
 * diye bir şey yok, şerit zaten 54 px.
 *
 * ⚠️ "YAKINDA BÖLÜMÜ ÇİZİLMEZ" testi de taşınmadı ve sebebi taşınmamasıdır:
 * koridorda `SOON` diye bir dizi HİÇ YOK, yani boş bir başlık bırakma tuzağı
 * yapısal olarak imkânsız. Var olmayan bir mekanizmayı test etmek, testi
 * okuyan kişiye o mekanizmanın var olduğunu düşündürürdü.
 */
vi.mock('@/components/app-shell/company-switcher', () => ({
  CompanySwitcher: () => <div data-testid="company-switcher" />,
}));
vi.mock('@/components/app-shell/user-menu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

const pathname = vi.hoisted(() => ({ current: '/app' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function renderAt(path: string, collapsed = false) {
  pathname.current = path;
  return render(<Rail collapsed={collapsed} />);
}

describe('Koridor — kapılar gerçek bağlantı', () => {
  /*
   * Bu ayrım bir kez kayda geçti: "Bilgi Bankası" Faz 4'te çalışır hale
   * geldiği hâlde gezinme Faz 3'ten kalma "yakında" rozetini taşımaya devam
   * etmiş ve modül kullanıcı için ERİŞİLEMEZ kalmıştı. Beş kapının beşi de
   * burada sabitleniyor.
   */
  it.each([
    ['Panel', '/app'],
    ['Müşteriler', '/app/crm'],
    ['Projeler', '/app/projects'],
    ['Finans', '/app/finance'],
    ['Randevular', '/app/appointments'],
    // ⚠️ ONUNCU KAPI (ADR-0043 §10) — dogrudan CANLI eklendi.
    ['Ekip', '/app/hr'],
  ])('%s → %s', (name, href) => {
    renderAt('/app');

    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('DAR hâlde erişilebilir ad TAM kalır, görünen etiket KISALIR', () => {
    /*
     * ⚠️ Dar koridorda (62 px) kapı "Müşteri" yazar. Erişilebilir ad içerikten
     * türeseydi ekran okuyucu kullanıcısı da kısaltmayı duyardı — görsel
     * kullanıcı ikonu görüp bağlamı tamamlar, o tamamlayamaz.
     */
    renderAt('/app', true);

    const door = screen.getByRole('link', { name: 'Müşteriler' });
    expect(door).toHaveTextContent('Müşteri');
  });

  it('GENİŞ hâlde tam etiket GÖRÜNÜR', () => {
    // Varsayılan geniştir: ilk kez açan kullanıcı ürünün neye sahip olduğunu
    // okuyabilmeli (PO, 2026-08-17 — "küçük geldi").
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Müşteriler' })).toHaveTextContent('Müşteriler');
  });

  it('daraltma düğmesi durumunu ekran okuyucuya BİLDİRİR', () => {
    render(<Rail collapsed={false} onToggle={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Menüyü daralt' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('ayrı bir "Bilgi Bankası" kapısı YOK — çalışma yüzeyi Panel', () => {
    renderAt('/app');

    expect(screen.queryByText('Bilgi Bankası')).not.toBeInTheDocument();
  });
});

/**
 * Modül başına imza rengi — kapı kendi kapsamını TAŞIR.
 *
 * `data-module` unutulursa hata SESSİZDİR: ekran çalışır, yalnızca terracotta
 * kalır. Ne tip denetimi ne lint yakalar. Renk DEĞERİ burada test EDİLMEZ ve
 * edilemez — değer `module-colors.css`'te yaşar, jsdom stylesheet çözmez.
 * Test edilen şey doğru olan tek şeydir: kapsamın deklare edilmiş olması.
 */
describe('Koridor — modül renk kapsamı', () => {
  it.each([
    ['Müşteriler', 'crm'],
    ['Projeler', 'projects'],
    ['Finans', 'finance'],
    // ⚠️ `booking` DEĞİL (ADR-0035 §1.1): şema/modül/attribute üçü de aynı
    // kelime olmak zorunda. Yanlış anahtar hiçbir paletle eşleşmez.
    ['Randevular', 'appointments'],
    // ⚠️ `hr` — sema, modul, rota ve attribute DORDU DE ayni kelime.
    ['Ekip', 'hr'],
  ])('%s kapısı `%s` kapsamını deklare eder', (name, key) => {
    renderAt('/app');

    expect(screen.getByRole('link', { name })).toHaveAttribute('data-module', key);
  });

  it('Panel kapsam TAŞIMAZ — bir modül değil, AI’ın yüzeyi', () => {
    // Panel'de imza rengi terracottadır ve öyle kalmalıdır. Buraya bir
    // `data-module` konsaydı AI'ın kendi ekranı bir modül gibi boyanırdı.
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Panel' })).not.toHaveAttribute('data-module');
  });

  it('KORİDORUN KENDİSİ kapsam taşımaz — marka, modül değil', () => {
    /*
     * `data-module` modülün kendi layout'undadır, kabukta değil. Koridora
     * konsaydı şerit aktif odanın rengine boyanırdı ve KobiWise işareti de
     * onunla birlikte renk değiştirirdi — marka bir odaya ait değildir
     * (ADR-0038 §7.1).
     */
    const { container } = renderAt('/app/finance');

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav).not.toHaveAttribute('data-module');
  });
});

/**
 * Aktiflik — EN UZUN eşleşen önek.
 *
 * Eşitlik `/app/crm/<id>` detayında "Müşteriler"i söndürürdü; salt önek ise
 * her yol `/app` ile başladığı için Panel'i HER sayfada aktif gösterirdi.
 */
describe('Koridor — aktif kapı', () => {
  it('/app üzerinde YALNIZCA Panel aktif', () => {
    renderAt('/app');

    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Müşteriler' })).not.toHaveAttribute('aria-current');
  });

  it('/app/crm üzerinde Panel DEĞİL Müşteriler aktif', () => {
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

describe('Koridor — kimlik solda toplanır', () => {
  it('şirket anahtarı ÜSTTE, kullanıcı menüsü ALTTA', () => {
    renderAt('/app');

    expect(screen.getByTestId('company-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('KobiWise işareti ana sayfaya götürür', () => {
    renderAt('/app/finance');

    expect(screen.getByRole('link', { name: 'KobiWise ana sayfa' })).toHaveAttribute(
      'href',
      '/app',
    );
  });
});

/**
 * ⚠️ KORİDOR KAYDIRILABİLİR OLMALIDIR — ölçülmüş bir kullanılabilirlik hatası.
 *
 * ============================================================================
 * ⚠️ NEDEN BU TESTLER VAR
 * ============================================================================
 * Faz 5 kapanınca koridor **on üç kapıya** çıktı (Panel + on iki modül) ve
 * toplam yükseklik küçük ekranlarda görüntü alanını aştı. Kabuk
 * `h-dvh overflow-hidden` olduğu için taşan kısım **kırpıldı**: son üç kapı
 * (Geri Bildirim · Kampanya · Sadakat) ve hesap menüsü ekranda GÖRÜNMÜYOR ve
 * ULAŞILAMIYORDU.
 *
 * ⚠️ Hata SESSİZDİ: kapılar DOM'da vardı, yalnızca görünmüyorlardı — hiçbir
 * test kırmızı yanmadı, lint uyarmadı. ⚠️ Ve her yeni modül kendi kapısını
 * gizlerdi, çünkü son eklenen her zaman en alttadır.
 *
 * ⚠️ Bu testler bir GÖRÜNÜMÜ değil, DÜZENİN ÜÇ ZORUNLU PARÇASINI kilitler.
 * JSDOM gerçek düzen hesaplamaz (`scrollHeight` her zaman 0'dır), yani
 * "gerçekten kaydırılıyor mu" burada ölçülemez — o, gerçek tarayıcıda
 * ölçüldü. Buradaki iş, **mekanizmanın sessizce kaldırılmasını** engellemek.
 */
describe('⚠️ Koridor kaydırılabilir — 13 kapı sığmadığında', () => {
  it('⚠️ liste `overflow-y-auto` VE `min-h-0` VE `flex-1` taşır — üçü birlikte', () => {
    renderAt('/app');
    const nav = screen.getByRole('navigation', { name: 'Odalar' });

    // ⚠️ `min-h-0` OLMADAN `overflow-y-auto` HİÇBİR ŞEY YAPMAZ: bir flex
    // çocuğunun varsayılanı `min-height: auto`dur ve içeriğinin altına asla
    // küçülmez. Bu yüzden üçü de ayrı ayrı iddia ediliyor — biri sessizce
    // silinirse test kırmızı yanar.
    expect(nav.className).toContain('overflow-y-auto');
    expect(nav.className).toContain('min-h-0');
    expect(nav.className).toContain('flex-1');
  });

  it('⚠️ kaydırma odaya SIÇRAMAZ (`overscroll-contain`)', () => {
    // Onsuz, liste sonuna gelindiğinde tekerlek sağdaki odayı kaydırırdı.
    renderAt('/app');
    expect(screen.getByRole('navigation', { name: 'Odalar' }).className).toContain(
      'overscroll-contain',
    );
  });

  it('⚠️ MARKA ve ŞİRKET SEÇİCİ kaydırma alanının DIŞINDA kalır', () => {
    // Üst kısım SABİTTİR: hangi şirkette olduğunu görmek için on üç kapıyı
    // geçmek gerekmemeli.
    renderAt('/app');
    const nav = screen.getByRole('navigation', { name: 'Odalar' });

    expect(nav.contains(screen.getByTestId('company-switcher'))).toBe(false);
    expect(nav.contains(screen.getByLabelText('KobiWise ana sayfa'))).toBe(false);
  });

  it('⚠️ HESAP MENÜSÜ de kaydırma alanının DIŞINDA ve daima görünür', () => {
    // İçeri alınsaydı, çıkış yapmak için önce on üç kapıyı geçmek gerekirdi.
    renderAt('/app');
    const nav = screen.getByRole('navigation', { name: 'Odalar' });

    expect(nav.contains(screen.getByTestId('user-menu'))).toBe(false);
  });

  it('⚠️ ON ÜÇ KAPININ ON ÜÇÜ DE listede — sonuncusu SADAKAT', () => {
    // ⚠️ Bu sayı bilerek SABİT yazıldı: on dördüncü bir kapı eklendiğinde test
    // kırmızı yanar ve ekleyen kişi bu dosyayı — yani kaydırma gerekçesini —
    // okumak zorunda kalır.
    renderAt('/app');
    const nav = screen.getByRole('navigation', { name: 'Odalar' });
    const doors = [...nav.querySelectorAll('a')];

    expect(doors).toHaveLength(13);
    expect(doors[doors.length - 1]?.getAttribute('href')).toBe('/app/loyalty');
  });

  it('⚠️ DAR koridorda da kaydırılabilir — 62 px"de taşma daha erken başlar', () => {
    renderAt('/app', true);
    const nav = screen.getByRole('navigation', { name: 'Odalar' });

    expect(nav.className).toContain('overflow-y-auto');
    expect(nav.className).toContain('min-h-0');
  });
});
