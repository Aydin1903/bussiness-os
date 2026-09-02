import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SocialSignIn } from './social-sign-in';

/**
 * ADR-0053 §9'un kararlarını kilitler.
 *
 * ⚠️ En önemlisi "SABİT KODLANMAZ": düğmeler `GET /auth/oauth/providers`
 * yanıtından çizilir. Bir gün biri listeyi koda gömerse bu testler kırmızı
 * yanar — ve gömülmüş bir liste, yapılandırılmamış bir sağlayıcının
 * tıklanınca 404 veren düğmesini ekranda bırakırdı (ADR-0052 §6.1'in açıkça
 * reddettiği şey).
 */

const listOAuthProviders = vi.hoisted(() => vi.fn());

/**
 * ⚠️ YALNIZCA `listOAuthProviders` SAHTELENIR; `oauthStartUrl` GERCEK KALIR.
 *
 * Sebep: `href` iddialari (site-ici/disi `next`, `/start` yolu) URL'i GERCEKTEN
 * uretenin dogrulugunu sinamalidir. Sahte bir `oauthStartUrl` yazsaydik,
 * testler kendi stub'imizi dogrular ve acik yonlendirme korumasi hakkinda
 * HICBIR SEY soylemezdi.
 *
 * ⚠️ `importOriginal` jenerigi `Record<string, unknown>`tir, `typeof import(...)`
 * DEGIL: proje `import()` tip anotasyonlarini yasaklar
 * (`consistent-type-imports`).
 */
vi.mock('@/lib/api/oauth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listOAuthProviders };
});

beforeEach(() => {
  vi.clearAllMocks();
  listOAuthProviders.mockResolvedValue({ providers: ['google'] });
});

describe('SocialSignIn — liste SUNUCUDAN gelir (ADR-0053 §9.4)', () => {
  it('yapilandirilmis saglayici icin dugme cizer', async () => {
    render(<SocialSignIn />);

    expect(await screen.findByRole('link', { name: 'Google ile giriş yap' })).toBeInTheDocument();
  });

  /**
   * ⚠️ BU TESTIN KORUDUGU SEY BIR DAVRANIS DEGIL BIR MIMARIDIR: Microsoft
   * yapilandirildiginda `social-sign-in.tsx`e DOKUNULMADAN dugmesi cikmali.
   * (Sozlukte karsiligi olmadigi icin bugun cizilmez — bir sonraki test.)
   */
  it('sunucu yeni bir saglayici eklediginde BU DOSYA degismeden calisir', async () => {
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'microsoft'] });

    render(<SocialSignIn />);

    // Google cizildi; bilesen listeyi sorgulamaya devam ediyor.
    expect(await screen.findByRole('link', { name: 'Google ile giriş yap' })).toBeInTheDocument();
    expect(listOAuthProviders).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ DARALMA, BOZULMA DEGIL: sunucu bizden once guncellenirse bilinmeyen
   * anahtar sessizce atlanir — TUM dugmeler kaybolmaz.
   */
  it('sozlukte karsiligi OLMAYAN anahtari sessizce atlar', async () => {
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'bilinmeyen-saglayici'] });

    render(<SocialSignIn />);

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
    expect(screen.getByRole('link', { name: 'Google ile giriş yap' })).toBeInTheDocument();
  });

  it('dugme `/auth/oauth/google/start` adresine gider', async () => {
    render(<SocialSignIn />);

    const link = await screen.findByRole('link', { name: 'Google ile giriş yap' });
    expect(link.getAttribute('href')).toContain('/auth/oauth/google/start');
  });

  it('site-ici `next` degeri sorguya eklenir', async () => {
    render(<SocialSignIn next="/app/crm" />);

    const link = await screen.findByRole('link', { name: 'Google ile giriş yap' });
    expect(link.getAttribute('href')).toContain('next=%2Fapp%2Fcrm');
  });

  /** Acik yonlendirme korumasi — sunucu da eler, ama gondermemek daha iyi. */
  it('⚠️ site-disi `next` degeri HIC gonderilmez', async () => {
    render(<SocialSignIn next="//evil.example/kotu" />);

    const link = await screen.findByRole('link', { name: 'Google ile giriş yap' });
    expect(link.getAttribute('href')).not.toContain('next=');
  });
});

describe('⚠️ SocialSignIn — HICBIR SEY YOKSA HICBIR SEY CIZILMEZ', () => {
  /**
   * ADR-0052 §6.1: _"yer de AYRILMAZ; bos bir alan birakip 'buraya gelecek'
   * demek ayni seyin daha sessiz halidir."_
   */
  it('liste BOSSA ne ayrac ne dugme ne yer tutucu render eder', async () => {
    listOAuthProviders.mockResolvedValue({ providers: [] });

    const { container } = render(<SocialSignIn />);

    await waitFor(() => {
      expect(listOAuthProviders).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('ISTEK BASARISIZ olursa sessizce bos kalir — hata GOSTERMEZ', async () => {
    listOAuthProviders.mockRejectedValue(new Error('ag hatasi'));

    const { container } = render(<SocialSignIn />);

    await waitFor(() => {
      expect(listOAuthProviders).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /** Yukleme sirasinda da bos: iskelet cizmek "yer ayirmak"tir. */
  it('yanit gelmeden ONCE de bostur', () => {
    listOAuthProviders.mockReturnValue(new Promise(() => undefined));

    const { container } = render(<SocialSignIn />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('SocialSignIn — erisilebilirlik (ADR-0053 §9.2 hafifletmesi)', () => {
  /**
   * ⚠️ Yuvarlak ikon dugmede saglayicinin ISTEDIGI eylem ifadesi GORSEL olarak
   * yoktur; erisilebilirlik agacinda ve ipucunda VARDIR. ⚠️ Bu bir HAFIFLETME,
   * uyum DEGIL — ADR-0053 §9.2 bunu acikca yazar.
   */
  it('dugme tam ifadeyi erisilebilir ad olarak tasir', async () => {
    render(<SocialSignIn />);

    const link = await screen.findByRole('link', { name: 'Google ile giriş yap' });
    expect(link).toHaveAttribute('title', 'Google ile giriş yap');
  });

  it('fiili veren ayrac dugmelerin USTUNDE bulunur', async () => {
    render(<SocialSignIn />);

    await screen.findByRole('link', { name: 'Google ile giriş yap' });
    expect(screen.getByText('veya şununla devam et')).toBeInTheDocument();
  });
});
