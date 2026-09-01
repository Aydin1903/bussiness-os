import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthCompleteClient } from './oauth-complete-client';

/**
 * ⚠️ BU DOSYA GERÇEK BİR PROD OLAYININ KAYDIDIR (2026-09-01 13:08).
 *
 * Sosyal girişin ilk gerçek denemesi **BAŞARILI OLDU** (prod log'u `?status=ok`,
 * veritabanında bağlantı satırı) ama bu sayfa henüz yazılmamıştı; kullanıcı
 * 404 gördü, geri/yenile yaptı, tarayıcı aynı callback URL'ini yeniden
 * gönderdi ve tek kullanımlık state çerezi tükenmiş olduğu için sunucu
 * **haklı olarak** `?error=state` döndü.
 *
 * Yani kusur state doğrulamasında DEĞİL, "başarının başarısızlık gibi
 * görünmesindeydi". Aşağıdaki testler o iki davranışı kilitler.
 */

const refreshIdentityToken = vi.hoisted(() => vi.fn());
const listMyMemberships = vi.hoisted(() => vi.fn());
const selectTenant = vi.hoisted(() => vi.fn());
const setSessionHint = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/refresh', () => ({ refreshIdentityToken }));
vi.mock('@/lib/api/tenants', () => ({ listMyMemberships }));
vi.mock('@/lib/session/select-tenant', () => ({ selectTenant }));
vi.mock('@/lib/session/session-hint', () => ({ setSessionHint }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';

function renderPage(props: {
  status?: string | undefined;
  error?: string | undefined;
  next?: string | undefined;
}) {
  return render(
    <OAuthCompleteClient status={props.status} error={props.error} next={props.next} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshIdentityToken.mockResolvedValue('identity-token');
  listMyMemberships.mockResolvedValue({ total: 1, items: [{ tenantId: TENANT_ID }] });
  selectTenant.mockResolvedValue(undefined);
});

describe('OAuthCompleteClient — basari yolu', () => {
  it('`status=ok` geldiginde kimligi tazeler ve ipucu yazar', async () => {
    renderPage({ status: 'ok' });

    await waitFor(() => {
      expect(refreshIdentityToken).toHaveBeenCalledTimes(1);
    });
    expect(setSessionHint).toHaveBeenCalledTimes(1);
  });

  it('TEK uyelikte otomatik tenant secip hedefe gider (ADR-0028)', async () => {
    renderPage({ status: 'ok' });

    await waitFor(() => {
      expect(selectTenant).toHaveBeenCalledWith(TENANT_ID);
    });
    expect(replace).toHaveBeenCalledWith('/app');
  });

  it('SIFIR uyelikte /create-tenant e gider', async () => {
    listMyMemberships.mockResolvedValue({ total: 0, items: [] });

    renderPage({ status: 'ok' });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/create-tenant');
    });
    expect(selectTenant).not.toHaveBeenCalled();
  });

  it('IKI+ uyelikte /select-tenant e gider', async () => {
    listMyMemberships.mockResolvedValue({
      total: 2,
      items: [{ tenantId: TENANT_ID }, { tenantId: TENANT_ID }],
    });

    renderPage({ status: 'ok' });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/select-tenant');
    });
  });

  /** Açık yönlendirme koruması — `login-form`daki `safeNext` ile AYNI kural. */
  it('⚠️ site-disi `next` degeri YOK SAYILIR', async () => {
    renderPage({ status: 'ok', next: '//evil.example/kotu' });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/app');
    });
  });

  it('site-ici `next` degerine gider', async () => {
    renderPage({ status: 'ok', next: '/app/crm' });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/app/crm');
    });
  });

  /**
   * ⚠️ Bekleme ekrani OLUMSUZ OLAMAZ: yonlendirme bir ag turu surer ve o
   * sirada hata gostermek, basarili bir girisi yine basarisiz gibi
   * gosterirdi — bu sayfanin var olma sebebinin tam tersi.
   */
  it('beklerken hata DEGIL, ilerleme gosterir', () => {
    renderPage({ status: 'ok' });

    expect(screen.getByText('Giriş tamamlanıyor…')).toBeInTheDocument();
    expect(screen.queryByText('Giriş tamamlanamadı')).not.toBeInTheDocument();
  });
});

describe('⚠️ OAuthCompleteClient — `error=state` SESSIZ KURTARMA (13:08 olayı)', () => {
  /**
   * ⚠️ BU TESTIN ANLATTIGI GERCEK OLAY:
   * Kullanici zaten giris yapmisti; tarayici ayni callback'i tekrar gonderdi
   * ve tek kullanimlik state tukenmis oldugu icin sunucu `error=state` dondu.
   * Refresh cookie'si elinde oldugu icin kurtarma TUTMALI ve kullanici iceri
   * ALINMALIDIR.
   */
  it('refresh cookie GECERLIYSE kullaniciyi iceri alir, hata GOSTERMEZ', async () => {
    renderPage({ error: 'state' });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/app');
    });
    expect(screen.queryByText('Giriş tamamlanamadı')).not.toBeInTheDocument();
  });

  it('refresh cookie YOKSA hata gosterir — kurtarma sessizce yutmaz', async () => {
    refreshIdentityToken.mockRejectedValue(new Error('401'));

    renderPage({ error: 'state' });

    await waitFor(() => {
      expect(screen.getByText('Giriş tamamlanamadı')).toBeInTheDocument();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ KURTARMA YALNIZCA `state` ICINDIR. `cancelled` gelen bir kullaniciyi
   * eski bir cerezle iceri almak, onun BILINCLI tercihini gormezden gelmek
   * olurdu.
   */
  it('⚠️ `cancelled` icin kurtarma DENENMEZ', async () => {
    renderPage({ error: 'cancelled' });

    await waitFor(() => {
      expect(screen.getByText('Giriş iptal edildi.')).toBeInTheDocument();
    });
    expect(refreshIdentityToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('⚠️ `email_required` icin de kurtarma DENENMEZ', async () => {
    renderPage({ error: 'email_required' });

    await waitFor(() => {
      expect(screen.getByText(/e-posta adresi paylaşmadı/u)).toBeInTheDocument();
    });
    expect(refreshIdentityToken).not.toHaveBeenCalled();
  });
});

describe('OAuthCompleteClient — diger hata kodlari', () => {
  it('`provider` kodu icin acik mesaj gosterir', async () => {
    renderPage({ error: 'provider' });

    await waitFor(() => {
      expect(
        screen.getByText('Bu sağlayıcı ile giriş şu anda kullanılamıyor.'),
      ).toBeInTheDocument();
    });
  });

  /** Bilinmeyen bir kod sessizce yutulmaz; genel mesaja duser. */
  it('BILINMEYEN kod genel mesaja duser', async () => {
    renderPage({ error: 'bilinmeyen-kod' });

    await waitFor(() => {
      expect(
        screen.getByText('Sağlayıcı ile iletişim kurulamadı. Lütfen tekrar deneyin.'),
      ).toBeInTheDocument();
    });
  });

  it('hicbir parametre yoksa genel mesaja duser', async () => {
    renderPage({});

    await waitFor(() => {
      expect(screen.getByText('Giriş tamamlanamadı')).toBeInTheDocument();
    });
    expect(refreshIdentityToken).not.toHaveBeenCalled();
  });
});
