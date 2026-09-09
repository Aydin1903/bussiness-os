import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
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

/**
 * ⚠️ `GoogleOneTap` SAHTELENIR — ve sebebi bir kolaylık degil bir ZORUNLULUK:
 * gercek bilesen `accounts.google.com` betigini yuklemeye calisir ve jsdom onu
 * hicbir zaman calistirmaz. Yani gercek bilesenle "kutu cizildi" hali
 * TESTTE URETILEMEZ.
 *
 * ⚠️ Sahte, gercegin SOZLESMESINI taklit eder, gorunumunu degil: `enabled`
 * okur ve `onMountedChange`i cagirir. Test ettigimiz sey kutunun nasil
 * gorundugu degil, `SocialSignIn`in o sinyale NE YAPTIGIDIR.
 *
 * ⚠️ Varsayilan `false` — yani sahtenin varsayilan davranisi jsdom'daki
 * GERCEK davranisla ayni: hicbir sey cizmez, hicbir sey bildirmez. Bu sayede
 * dosyadaki DIGER testler bu mock'tan etkilenmez.
 */
const oneTapMounts = vi.hoisted(() => ({ value: false }));

vi.mock('./google-one-tap', () => ({
  GoogleOneTap: ({
    enabled,
    onMountedChange,
  }: {
    readonly enabled: boolean;
    readonly onMountedChange?: (mounted: boolean) => void;
  }) => {
    const shown = enabled && oneTapMounts.value;

    useEffect(() => {
      if (!shown) {
        return;
      }
      onMountedChange?.(true);
      // ⚠️ Sokulurken `false` — gercek bilesenin cleanup'iyla ayni sozlesme.
      return () => {
        onMountedChange?.(false);
      };
    }, [shown, onMountedChange]);

    return shown ? <div data-testid="gis-box" /> : null;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  oneTapMounts.value = false;
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
   *
   * ⚠️ VE BU ARTIK OLCULDU: uc saglayicinin adapter'lari yazildiginda bu
   * dosyaya TEK SATIR dokunulmadi — degisen yalnizca `provider-marks.tsx`
   * sozlugu ve sunucunun registry'si oldu.
   */
  it('sunucu yeni bir saglayici eklediginde BU DOSYA degismeden calisir', async () => {
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'microsoft'] });

    render(<SocialSignIn />);

    expect(await screen.findByRole('link', { name: 'Google ile giriş yap' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Microsoft ile giriş yap' })).toBeInTheDocument();
    expect(listOAuthProviders).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ SIRA SUNUCUDAN GELIR VE ISTEMCI ONU YENIDEN SIRALAMAZ (ADR-0053 §9.3:
   * Google · Microsoft · LinkedIn · Facebook — yaygin kullanim sirasi).
   *
   * ⚠️ Bu test sirayi TERSTEN vererek sinar: bilesen kendi tercihini
   * dayatsaydi (alfabetik, sabit bir dizi, ya da sozlugun yazim sirasi) cikti
   * DUZELIRDI ve test kirmizi yanardi. Sunucunun sirasi korunuyorsa cikti da
   * terstir.
   */
  it('⚠️ SUNUCUNUN sirasini korur — istemci YENIDEN SIRALAMAZ', async () => {
    listOAuthProviders.mockResolvedValue({
      providers: ['facebook', 'linkedin', 'microsoft', 'google'],
    });

    render(<SocialSignIn />);

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(4);
    });
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Facebook ile giriş yap',
      'LinkedIn ile giriş yap',
      'Microsoft ile giriş yap',
      'Google ile giriş yap',
    ]);
  });

  it.each(['microsoft', 'linkedin', 'facebook'])(
    '`%s` dugmesi kendi `/start` adresine gider',
    async (provider) => {
      listOAuthProviders.mockResolvedValue({ providers: [provider] });

      render(<SocialSignIn />);

      const link = await screen.findByRole('link');
      expect(link.getAttribute('href')).toContain(`/auth/oauth/${provider}/start`);
    },
  );

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

/**
 * ============================================================================
 * ⚠️ GOOGLE TEKRARI — ADR-0053 §10.2 DEĞİŞTİ (PO, 2026-09-09)
 * ============================================================================
 * Eski karar Google'ın İKİ KEZ görünmesiydi (kişiselleştirilmiş kutu + ikon
 * sırası). Yeni karar: kutu GERÇEKTEN çizildiyse ikon sırasındaki Google
 * elenir.
 *
 * ⚠️ BU TESTLERİN ASIL KORUDUĞU ŞEY ELEME DEĞİL, YEDEĞİN GERÇEKLİĞİDİR.
 * "Google'ı gizle" tek satırlık bir iştir ve kolayca fazla gizler: betik
 * engellendiğinde de gizlerse kullanıcıda HİÇBİR Google girişi kalmaz ve
 * hata SESSİZDİR — ekran çalışır, yalnızca bir giriş yolu yok olur.
 *
 * Bu yüzden üç hâlin ÜÇÜ de ayrı ayrı kilitlenir:
 *   · kutu çizildi        → Google elenir, DİĞERLERİ kalır
 *   · kutu hiç çizilmedi  → Google YERİNDE kalır (gerçek yedek)
 *   · kutu söküldü        → Google GERİ gelir
 */
describe('SocialSignIn — ⚠️ GIS kutusu çizildiğinde ikon sırasındaki Google elenir', () => {
  /**
   * ⚠️ "SAĞLAYICI LİSTESİ GELDİ" SİNYALİ — ve bu yardımcının var olma sebebi
   * BU DOSYADA YAŞANMIŞ BİR HATADIR.
   *
   * İlk yazımda eleme testi doğrudan _"Google DOM'da yok"_ diye bekliyordu.
   * ⚠️ O iddia, sağlayıcı listesi HENÜZ GELMEDİĞİ için sıfır bağlantı varken
   * de doğrudur — yani `waitFor` ilk denemede geçer, sonra Google görünür ve
   * test **yanlış yere** güvenmiş olur.
   *
   * ⚠️ Kalıcı ders: **bir şeyin YOKLUĞUNU beklemek, o şey henüz hiç
   * görünmemişken beklemek değildir.** Önce POZİTİF bir sinyal beklenir.
   *
   * Ayraç bu sinyaldir: yalnızca `drawable.length > 0` olduğunda —yani liste
   * çözüldükten sonra— render edilir.
   */
  async function providersResolved(): Promise<void> {
    await screen.findByText('veya şununla devam et');
  }

  /** Sıradaki düğmelerin erişilebilir adları — sayı değil, LİSTE. */
  function rowLabels(): (string | null)[] {
    return screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
  }

  it('kutu çizildiğinde Google sıradan ÇIKAR', async () => {
    oneTapMounts.value = true;
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'linkedin'] });

    render(<SocialSignIn />);

    await screen.findByTestId('gis-box');
    await providersResolved();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Google ile giriş yap' })).not.toBeInTheDocument();
    });
  });

  /**
   * ⚠️ EN ÖNEMLİ SATIR: elenen YALNIZCA Google'dır. Bütün sırayı gizlemek
   * kullanıcıyı tek bir sağlayıcıya hapsederdi — ve bu, ADR-0053 §3.3'ün
   * "düğme sayısı 1–4 arasında herhangi bir şey olabilir" kararının sessiz
   * ihlali olurdu.
   *
   * ⚠️ İddia `waitFor`ın İÇİNDEDİR ve tam listeyi karşılaştırır: eleme bir
   * sonraki tepkime turunda olur, yani dışarıda yazılırsa yarışa girer
   * (gerçekten yaşandı — tek başına geçti, tüm pakette düştü).
   */
  it('⚠️ DİĞER sağlayıcılar sırada KALIR — yalnızca Google elenir', async () => {
    oneTapMounts.value = true;
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'linkedin'] });

    render(<SocialSignIn />);

    await screen.findByTestId('gis-box');
    await providersResolved();

    await waitFor(() => {
      expect(rowLabels()).toEqual(['LinkedIn ile giriş yap']);
    });
  });

  /**
   * ⚠️ YEDEĞİN KANITI. Betik engellenirse `onMountedChange` hiç `true`
   * almaz ve Google ikon sırasında DURUR — yani kaybolan bir KOPYADIR,
   * bir YOL değil.
   */
  it('⚠️ kutu ÇİZİLMEZSE (betik engellendi) Google sırada KALIR', async () => {
    oneTapMounts.value = false;
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'linkedin'] });

    render(<SocialSignIn />);

    await providersResolved();

    expect(rowLabels()).toEqual(['Google ile giriş yap', 'LinkedIn ile giriş yap']);
    expect(screen.queryByTestId('gis-box')).not.toBeInTheDocument();
  });

  /**
   * ⚠️ SÖKÜLME YOLU. Kutu bir kez çizilip sonra sökülürse (rota değişimi,
   * StrictMode'un ikinci turu) bayrak `true` takılı kalsaydı kullanıcıda
   * HİÇBİR Google girişi kalmazdı. `google-one-tap.tsx`in cleanup'ındaki
   * `notifyRef.current?.(false)` satırı tam olarak bunun içindir.
   */
  it('⚠️ kutu SÖKÜLÜNCE Google sıraya GERİ döner', async () => {
    oneTapMounts.value = true;
    listOAuthProviders.mockResolvedValue({ providers: ['google', 'linkedin'] });

    const { rerender } = render(<SocialSignIn />);

    await screen.findByTestId('gis-box');
    await providersResolved();
    await waitFor(() => {
      expect(rowLabels()).toEqual(['LinkedIn ile giriş yap']);
    });

    // Kutu artık çizilmiyor (betik kayboldu / bileşen söküldü).
    oneTapMounts.value = false;
    rerender(<SocialSignIn />);

    await waitFor(() => {
      expect(rowLabels()).toEqual(['Google ile giriş yap', 'LinkedIn ile giriş yap']);
    });
  });

  /**
   * ⚠️ TEK SAĞLAYICI + ÇİZİLMİŞ KUTU: sıra BOŞALIR ama bileşen `null`
   * DÖNMEZ — kutu ekrandadır ve ayraç ona aittir. Erken bir `return null`
   * buraya konsaydı, tek sağlayıcılı kurulumda kişiselleştirilmiş kutu
   * ayraçsız ve bağlamsız kalırdı.
   */
  it('⚠️ yalnızca Google varken kutu çizilirse ayraç ve kutu KALIR, sıra boşalır', async () => {
    oneTapMounts.value = true;
    listOAuthProviders.mockResolvedValue({ providers: ['google'] });

    render(<SocialSignIn />);

    await screen.findByTestId('gis-box');
    await providersResolved();

    await waitFor(() => {
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    expect(screen.getByText('veya şununla devam et')).toBeInTheDocument();
  });
});
