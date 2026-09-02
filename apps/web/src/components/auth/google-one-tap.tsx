'use client';

import { useEffect, useRef, useState } from 'react';

import { initGoogleOneTap, submitGoogleOneTap } from '@/lib/api/oauth';

/** GIS betiginin tek mesru kaynagi — CSP'de `script-src`e acilan TEK host. */
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * ⚠️ Kisisellestirilmis dugme `type=icon` OLAMAZ, `small`/`medium` OLAMAZ ve
 * genisligi 200 px'in ALTINDA OLAMAZ — Google'in yazili kurali.
 *
 * Bu, ADR-0053 §10.1'in olculmus kisitidir ve PO'nun istedigi duzenin
 * (ustte ayri satir, altta ikon sirasi) TEK uyumlu cozumu olmasinin sebebidir:
 * "kucuk yuvarlak ikon" ile "kisisellestirilmis kutu" ayni dugme OLAMAZ.
 */
const BUTTON_WIDTH_PX = 280;

/** GIS'in `window`a yazdigi yuzeyin ihtiyacimiz olan DAR gorunumu. */
interface GisCredentialResponse {
  readonly credential?: unknown;
}

interface GisIdApi {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

function readGisApi(): GisIdApi | null {
  const google: unknown = Reflect.get(window, 'google');
  if (typeof google !== 'object' || google === null) {
    return null;
  }
  const accounts: unknown = Reflect.get(google, 'accounts');
  if (typeof accounts !== 'object' || accounts === null) {
    return null;
  }
  const id: unknown = Reflect.get(accounts, 'id');
  if (typeof id !== 'object' || id === null) {
    return null;
  }
  // ⚠️ TIP ONAYI DEGIL TIP KORUYUCU: proje `as` kullanimini yasaklar
  // (`consistent-type-assertions`) ve burada dogru arac zaten koruyucudur —
  // `window.google` ucuncu tarafin yazdigi bir nesnedir ve sekli CALISMA
  // ANINDA dogrulanmalidir, derleyiciye beyan edilerek degil.
  return isGisIdApi(id) ? id : null;
}

function isGisIdApi(value: object): value is GisIdApi {
  return (
    typeof Reflect.get(value, 'initialize') === 'function' &&
    typeof Reflect.get(value, 'renderButton') === 'function'
  );
}

/** Betigi bir kez yukler; zaten varsa onu bekler. Basarisizlikta `null`. */
async function loadGisScript(): Promise<GisIdApi | null> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);

  await new Promise<void>((resolve) => {
    if (existing !== null) {
      // ⚠️ Zaten yuklenmisse `load` bir daha ATESLENMEZ; API varsa hemen gec.
      if (readGisApi() !== null) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        resolve();
      });
      existing.addEventListener('error', () => {
        resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    // ⚠️ Hem `load` hem `error` AYNI sekilde cozer: bu fonksiyon "yuklendi mi"
    // sorusunu `readGisApi()` ile cevaplar, olayla degil. Reklam engelleyici
    // bazen `error` bile tetiklemez; API kontrolu TEK guvenilir olcuttur.
    script.addEventListener('load', () => {
      resolve();
    });
    script.addEventListener('error', () => {
      resolve();
    });
    document.head.append(script);
  });

  return readGisApi();
}

/**
 * Google kisisellestirilmis giris kutusu — ADR-0053 §10 + EK-1.
 *
 * ============================================================================
 * ⚠️ BETIK ENGELLENIRSE HIC MOUNT EDILMEZ — "gorunmuyor" DEGIL, "hic yok"
 * ============================================================================
 * `accounts.google.com/gsi/client` reklam engelleyiciler tarafindan RUTIN
 * olarak engellenir. Bu bilesen o durumda `null` doner: ne kutu, ne iskelet,
 * ne de bir YER TUTUCU cizilir.
 *
 * ⚠️ Bu, ADR-0043'un ucret bolumu icin kurdugu ayni disiplindir. Bir iskelet
 * cizmek "yer ayirmak" olurdu ve ADR-0052 §6.1 onu acikca reddediyor; ayrica
 * betik hic gelmezse kullanici SONSUZA KADAR bir yukleme kutusuna bakardi.
 *
 * ============================================================================
 * ⚠️ GOOGLE IKI KEZ GORUNUR VE BU BILINCLIDIR (§10.2)
 * ============================================================================
 * Bu kutu gorundugunde ikon siradaki Google dugmesi KAYBOLMAZ. Iki gerekce:
 *   1. ⚠️ Duzenimiz kontrol etmedigimiz bir betige BAGIMLI OLAMAZ — betik gec
 *      yuklenir ya da hic gelmezse sira uzunlugu degisir ve sayfa ZIPLAR.
 *   2. Iki kontrol AYNI SORUYU SORMUYOR: ustteki "bu hesapla", alttaki "bir
 *      Google hesabiyla" (kullanicinin ikinci bir hesabi olabilir).
 *
 * ============================================================================
 * ⚠️ FedCM ACIK (§10.3)
 * ============================================================================
 * Ucuncu taraf cerezleri engellendiginde kisisellestirilmis dugme, FedCM
 * surumu acik DEGILSE hic cizilmez. Ucuncu taraf cerezleri kaybolmakta oldugu
 * icin FedCM'siz bir kurulum "calisiyor gorunur ama ozellik HICBIR ZAMAN
 * ortaya cikmaz" — bu projenin surekli isaretledigi sessiz bozulma sinifi.
 * ============================================================================
 */
export function GoogleOneTap({ enabled }: { readonly enabled: boolean }) {
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) {
      return;
    }
    startedRef.current = true;

    /*
     * ⚠️ `AbortController` — duz bir `let cancelled = false` DEGIL.
     *
     * Iki sebep: (1) TypeScript duz bir bayragi kapanis boyunca `false` olarak
     * DARALTIR ve kontroller "her zaman yanlis" diye isaretlenir; (2) daha
     * onemlisi, iptal edilebilir asenkron bir akisin DOGRU araci zaten budur —
     * ileride `fetch`e `signal` gecirmek gerekirse hazir.
     */
    const controller = new AbortController();

    /*
     * ⚠️ Bayrak BIR FONKSIYON UZERINDEN okunur. TypeScript
     * `new AbortController().signal.aborted` degerini baslangicta `false` diye
     * DARALTIR ve kontroller "her zaman yanlis" isaretlenir; bir cagri sonucu
     * daraltilamaz. Yani bu dolayli okuma bir uslup tercihi degil, derleyicinin
     * goremedigi bir gercegi (bayrak ASENKRON olarak degisir) ona soylemenin
     * yoludur.
     */
    const aborted = (): boolean => controller.signal.aborted;

    async function setup(): Promise<void> {
      /*
       * ⚠️ SIRA: ONCE BETIK, SONRA SUNUCU CAGRISI — VE BU SIRA BIR OLCUMDEN
       * SONRA TERSINE CEVRILDI.
       *
       * Ilk yazimda once `init` cagriliyordu. Iki sorunu vardi:
       *
       * 1. ⚠️ `init` bir YAN ETKI uretir — sunucu `oauth_one_tap` cerezini
       *    YAZAR. Kullanamayacagimiz bir durumu once yaratmak yanlisti:
       *    betik engellenmis olsa bile kullaniciya bir cerez birakilirdi.
       * 2. ⚠️ StrictMode'da (dev) effect IKI KEZ kosar; birinci kosu
       *    cleanup'ta iptal edilir. Eski sirada iki kosu da `init`e ULASIP
       *    IKI AYRI NONCE uretiyordu ve hangi cerezin kaldigi YARISA bagliydi
       *    — GIS bir nonce'la yapilandirilirken cerezde otekinin durmasi
       *    mumkundu ve hata SESSIZDI (One Tap "calismiyor" derdi, sebebi
       *    gorunmezdi).
       *
       * Yeni sirada birinci kosu neredeyse her zaman `loadGisScript()`
       * beklemesinde iptal olur ve `init`e HIC varmaz — yani cerezi yazan tek
       * kosu, dugmeyi gercekten cizen kosudur.
       */
      const gis = await loadGisScript();
      const container = containerRef.current;
      if (gis === null || container === null || aborted()) {
        // ⚠️ Betik engellendi ya da bilesen soküldü — SESSIZCE hicbir sey.
        return;
      }

      // ⚠️ `nonce` ve `clientId` SUNUCUDAN gelir: `nonce` istemci uretseydi
      // dogrulama kendi kendini onaylardi, `clientId` iki yerde tutulsaydi
      // ayrisirdi (EK-1.1).
      const init = await initGoogleOneTap('google').catch(() => null);
      if (init === null || aborted()) {
        return;
      }

      gis.initialize({
        client_id: init.clientId,
        // ⚠️ `nonce` GIS'e verilir ve uretilen ID token'in icine claim olarak
        // girer; sunucu onu imzali cerezdekiyle karsilastirir (EK-1.2, 5/5).
        nonce: init.nonce,
        use_fedcm_for_prompt: true,
        callback: (response: GisCredentialResponse) => {
          const credential = response.credential;
          if (typeof credential === 'string' && credential.length > 0) {
            void submitGoogleOneTap(credential);
          }
        },
      });

      gis.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: BUTTON_WIDTH_PX,
      });

      if (!aborted()) {
        setReady(true);
      }
    }

    void setup();

    return () => {
      controller.abort();
      /*
       * ⚠️ BAYRAK SIFIRLANIR — VE BU SATIR OLMADAN BILESEN KALICI OLARAK OLUR.
       *
       * `startedRef` "ayni mount icinde iki kez baslama" icindir. Sifirlanmazsa
       * StrictMode'un (dev) mount → cleanup → mount dizisi sunu uretir: birinci
       * kosu bayragi kaldirir ve cleanup'ta IPTAL EDILIR, ikinci kosu ise
       * bayraga takilip HIC BASLAMAZ. Sonuc: betik hic istenmez, kutu hic
       * cizilmez.
       *
       * ⚠️ Gercekten yasandi (ADR-0053 EK-2.4 dogrulamasi): ag gunlugunde
       * `accounts.google.com/gsi/client` istegi HIC YOKTU ve hicbir CSP ihlali,
       * hicbir konsol hatasi, hicbir kirmizi test bunu soylemiyordu — bilesen
       * "engellenmis gibi" davraniyordu, ki tam olarak o durumda da hicbir sey
       * cizmemesi GEREKIYOR. Iki durum disaridan AYIRT EDILEMEZDI.
       *
       * Ayni tuzak uretimde de vardir: bir rotadan hizlica cikip geri donmek
       * bileseni ayni olu duruma sokardi.
       */
      startedRef.current = false;
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  /*
    ⚠️ KAP HER ZAMAN DOM'DA OLMAK ZORUNDA (GIS ona render eder) ama GORSEL
    OLARAK yer kaplamamalidir. `hidden` kullanilmaz — `display:none` bir
    elemente render eden GIS'in olculeri sifir alir ve dugme bozulur.
    Bunun yerine kap, hazir OLANA KADAR sifir yukseklikte ve tasma gizli.
  */
  return (
    <div className={ready ? 'flex justify-center' : 'h-0 overflow-hidden'} aria-hidden={!ready}>
      <div ref={containerRef} />
    </div>
  );
}
