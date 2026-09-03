import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthVerifyForm } from './oauth-verify-form';

/**
 * ============================================================================
 * ⚠️ D3'ÜN KOD EKRANI — VE BU DOSYA BİR 404'ÜN KAYDIDIR
 * ============================================================================
 * `oauth.controller.ts` (callback) ve `lib/api/oauth.ts` (One Tap) bu adrese
 * **zaten yönlendiriyordu**; sayfa yoktu. Yani `email_verified: false` dönen
 * bir giriş kullanıcıyı **404'e** düşürürdü — `/oauth/complete`in
 * 2026-09-01'de yaşanan kusurunun **birebir aynısı**: doğru ilerleyen bir
 * akış, başarısızlık gibi görünür.
 *
 * ⚠️ Aşağıdaki testler ekranın **var olduğunu** değil, üç kararını kilitler:
 * (1) gövdede yalnızca `code` gider, (2) redler ayırt edilmez, (3) başarıda
 * yönlendirme `/oauth/complete`e yapılır — ADR-0028'in kuralı TEK YERDE kalsın.
 * ============================================================================
 */

const verifyOAuthEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/oauth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, verifyOAuthEmail };
});

/**
 * ⚠️ `window.location` ACIKCA KURULMUS bir nesneyle degistirilir — YAYILARAK
 * DEGIL. Iki ayri sinir bu bicimi zorladi ve ikisi de kayda deger:
 *
 *   1. `{ ...window.location }` LINT HATASIDIR (`no-misused-spread`):
 *      `Location` bir SINIF ORNEGIDIR ve yayilan kopya prototipini kaybeder.
 *   2. ⚠️ Yalnizca `assign`i degistirmek de OLMAZ: jsdom'da `Location.assign`
 *      **yeniden tanimlanamaz** (`Cannot redefine property`). Yeniden
 *      tanimlanabilen sey `window.location`in KENDISIDIR.
 *
 * Alanlar tek tek yazilir; bilesenin kullandigi TEK sey `assign`dir ve digerleri
 * yalnizca jsdom'un beklentisini karsilar.
 */
const assign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  assign.mockClear();
  verifyOAuthEmail.mockResolvedValue({ identityToken: 'kimlik-token' });

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, href: originalLocation.href, origin: originalLocation.origin },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

function typeCodeAndSubmit(code: string): void {
  fireEvent.change(screen.getByLabelText('Doğrulama kodu'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve devam et' }));
}

describe('OAuthVerifyForm — başarı yolu', () => {
  it('6 haneli kodu SUNUCUYA gönderir', async () => {
    render(<OAuthVerifyForm next={undefined} />);
    typeCodeAndSubmit('123456');

    await waitFor(() => {
      expect(verifyOAuthEmail).toHaveBeenCalledWith('123456');
    });
  });

  /**
   * ⚠️ YANITTAKİ `identityToken` KULLANILMAZ ve bu bilinçlidir: sunucu aynı
   * istekte refresh çerezini de yazdı, `/oauth/complete` onu bir `refresh`
   * çağrısına çevirir. Böylece ADR-0028'in yönlendirme kuralı (0 üyelik →
   * `/create-tenant` · 1 → otomatik geçiş · 2+ → `/select-tenant`) **TEK
   * YERDE** kalır ve ikinci bir kopya bir gün birincisinden ayrışamaz.
   */
  it('⚠️ başarıda `/oauth/complete`e gider — yönlendirme mantığı TEK YERDE', async () => {
    render(<OAuthVerifyForm next={undefined} />);
    typeCodeAndSubmit('123456');

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/oauth/complete?status=ok');
    });
  });

  it('site-içi `next` hedefe taşınır', async () => {
    render(<OAuthVerifyForm next="/app/crm" />);
    typeCodeAndSubmit('123456');

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/oauth/complete?status=ok&next=%2Fapp%2Fcrm');
    });
  });

  /**
   * ⚠️ AÇIK YÖNLENDİRME KORUMASI. `//evil.example` protokole göreli bir
   * MUTLAK adrestir ve `startsWith('/')` testini **geçer** — bu yüzden ikinci
   * kontrol şarttır. Sunucu da ayrıca eler; iki savunma da durur.
   */
  it('⚠️ site-dışı `next` DÜŞÜRÜLÜR, hedef `/oauth/complete` kalır', async () => {
    render(<OAuthVerifyForm next="//evil.example/kotu" />);
    typeCodeAndSubmit('123456');

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/oauth/complete?status=ok');
    });
  });
});

describe('OAuthVerifyForm — ⚠️ redler AYIRT EDİLMEZ (P2)', () => {
  /**
   * ⚠️ Sunucu "kod yanlış", "süresi dolmuş", "deneme hakkı bitti", "çerez yok"
   * ve "hesap kilitli" hallerinin **hepsini** aynı 401'e indirir. Ekran
   * hangisinin gerçekleştiğini bilmez ve **bilmemelidir** — aksi halde yanıt
   * bir hesap sayım (enumeration) oracle'ına dönerdi.
   */
  it('hata durumunda genel mesaj gösterir ve YÖNLENDİRMEZ', async () => {
    verifyOAuthEmail.mockRejectedValue(new Error('401'));

    render(<OAuthVerifyForm next={undefined} />);
    typeCodeAndSubmit('000000');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('hatadan sonra kullanıcı TEKRAR deneyebilir (form kilitlenmez)', async () => {
    verifyOAuthEmail.mockRejectedValueOnce(new Error('401'));

    render(<OAuthVerifyForm next={undefined} />);
    typeCodeAndSubmit('000000');
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Doğrula ve devam et' }));

    await waitFor(() => {
      expect(verifyOAuthEmail).toHaveBeenCalledTimes(2);
    });
  });
});

describe('OAuthVerifyForm — giriş alanı', () => {
  it('rakam DIŞI karakterleri temizler ve 6 haneyle sınırlar', () => {
    render(<OAuthVerifyForm next={undefined} />);

    const input = screen.getByLabelText('Doğrulama kodu');
    fireEvent.change(input, { target: { value: 'a1b2 c3-4d5e6f789' } });

    expect(input).toHaveValue('123456');
  });

  it('tek seferlik kod için `autocomplete` ipucu taşır', () => {
    render(<OAuthVerifyForm next={undefined} />);

    expect(screen.getByLabelText('Doğrulama kodu')).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
  });
});

describe('OAuthVerifyForm — ⚠️ ekranın SÖYLEMEDİKLERİ', () => {
  /**
   * ⚠️ E-POSTA ADRESİ EKRANDA YAZMAZ. Adres yalnızca imzalı, `HttpOnly`
   * bekleyen-bağlama çerezindedir; URL'e yazmak `email_at_link`i (bir TEŞHİS
   * kolonu, ADR-0053 §2.1) API yüzeyine çıkarmanın ilk adımı olurdu.
   *
   * ⚠️ Bu test bir "boşluğu" değil bir KARARI korur: biri kolaylık olsun diye
   * adresi sorguya eklerse burası kırmızı yanmalı.
   */
  it('⚠️ hiçbir e-posta adresi göstermez', () => {
    const { container } = render(<OAuthVerifyForm next={undefined} />);

    expect(container.textContent).not.toContain('@');
  });

  /**
   * ⚠️ "KODU YENİDEN GÖNDER" DÜĞMESİ YOKTUR — ADR-0053 §4.1 dört uç tanımlar
   * ve yeniden gönderme yoktur. Sahte bir düğme koymak, ADR-0052 §6.1'in
   * reddettiği _"tıklandığında hiçbir şey yapmayan düğme"_ olurdu. Kullanıcının
   * yolu akışı baştan başlatmaktır ve bağlantı tam olarak bunu söyler.
   */
  it('⚠️ "yeniden gönder" düğmesi YOKTUR; yerine giriş ekranına dönüş vardır', () => {
    render(<OAuthVerifyForm next={undefined} />);

    expect(screen.queryByRole('button', { name: /yeniden gönder/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /giriş ekranından tekrar deneyin/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
