/**
 * AUTH PANELLERİ — yedi ekranın sol paneli, tek tabloda (ADR-0052 §1, §2).
 *
 * ============================================================================
 * ⚠️ NEDEN BİR TABLO, NEDEN LAYOUT'TA `pathname → kademe` HARİTASI DEĞİL
 * ============================================================================
 * `(auth)/layout.tsx` içinde bir yol haritası tutulsaydı, sekizinci ekran
 * geldiğinde layout dosyası değişmek zorunda kalırdı. ADR-0025 (permission
 * registry), ADR-0031 (`RetrievalContributor`) ve ADR-0038'in (`data-module`
 * modülün kendi layout'unda) aynı disiplini: **platform mekanizmayı sahiplenir,
 * yüzey kimliğini DEKLARE eder.**
 *
 * Bu tablo bir harita değil bir SÖZLÜKTÜR: sayfa kendi anahtarını `AuthScreen`e
 * verir, layout hiçbir şey bilmez.
 *
 * ============================================================================
 * ÜÇ KADEME — iskelet aynı, panelin İŞİ farklı
 * ============================================================================
 * | Kademe            | Ekranlar                              | Panel            |
 * | ----------------- | ------------------------------------- | ---------------- |
 * | A — Kapı          | login · register                      | fotoğraf + slogan|
 * | B — Akış          | verify-email · forgot · reset         | FOTOĞRAF YOK     |
 * | C — Eşiğin içi    | create-tenant · select-tenant         | fotoğraf + slogan|
 *
 * ⚠️ Panelde MARKA ÖĞESİ YOKTUR — yazılı logo sağ sütunun üstündedir
 * (ADR-0052 §5.2 düzeltmesi, 2026-08-31). Panelin taşıdığı tek metin
 * slogandır.
 *
 * ⚠️ Kademe B'de `scene` yoktur ve bu bir eksiklik DEĞİLDİR: o ekranlar
 * mekaniktir (gelen kutusundan altı hane taşımak), çoğunlukla telefonda
 * açılır ve büyük bir fotoğraf orada ikna etmez GECİKTİRİR. Panel kaybolmaz —
 * Mars zemini, tanecik ve logo kalır; değişen şey sesin yüksekliğidir.
 *
 * ⚠️ `mascot-portrait` varlığı HENÜZ ÜRETİLMEDİ (ADR-0052 §2.3) ve bir sahne
 * kırpılıp "portre" diye KULLANILMAZ: kırpma arka plandaki Mars zeminini de
 * taşır ve panelin kendi gradyanıyla üst üste binerdi. Kademe B bugün
 * gradyan + slogan ile çalışır; bu, kabul edilmiş bir geri düşüştür.
 */

/**
 * Sahne anahtarları — ⚠️ ad SAHNENİN İÇERİĞİYLE verilir, kullanıldığı ekranla
 * DEĞİL (ADR-0052 §5.4). Yarın `login` başka bir sahneye geçerse
 * `mascot-login.avif` adında ama yürüyüş gösteren bir dosya kalırdı ve yanlış
 * ad SESSİZCE yaşardı.
 *
 * Değerler `auth-surface.css`'teki `[data-scene='…']` seçicileriyle ve
 * `public/brand/mascot-scene-<ad>.{avif,webp}` dosya adlarıyla birebir aynı
 * olmak zorundadır.
 */
export type AuthScene = 'path' | 'walk' | 'orbit' | 'stage';

export interface AuthPanelContent {
  /** Yoksa Kademe B: fotoğraf katmanı hiç kurulmaz. */
  readonly scene?: AuthScene;
  /**
   * Panelin TEK cümlesi. ⚠️ Görsele GÖMÜLMEZ — gerçek DOM metnidir.
   *
   * ⚠️ **DESTEK SATIRI KALDIRILDI** (Product Owner, 2026-08-31 — ADR-0052
   * düzeltme notu). Panelde önce bir başlık + bir açıklama satırı ikilisi
   * vardı; gerçek ekranda referansla (TradingView) yan yana konunca ikili
   * bir **paragraf** gibi okundu, bir slogan gibi değil.
   *
   * Bir slogan tek bir fikir söyler ve açıklanmaz — açıklandığı anda slogan
   * olmaktan çıkar. Açıklama zaten sağ panelde, formun kendi başlığının
   * altında duruyor; panelde tekrarı hem yer harcıyor hem de kullanıcının
   * gözünü ikiye bölüyordu.
   */
  readonly slogan: string;
  /**
   * Sahneyi `<link rel="preload">` ile öne çeker.
   *
   * ⚠️ YALNIZCA `login` ve `register` (ADR-0052 §5.3). Gerekçe LCP'nin
   * nerede olduğudur: bu ikisi SOĞUK açılan giriş noktalarıdır. `create-tenant`
   * ve `select-tenant` ise login'den sonra istemci tarafı gezinmeyle gelir —
   * orada preload bir yarış kazanmaz, yalnızca erken bayt harcar.
   */
  readonly preload?: boolean;
}

/**
 * Sahne eşlemesi rastgele değildir: **karakterin bulunduğu durum,
 * kullanıcının bulunduğu durumla aynı olmalıdır** (ADR-0052 §2.1).
 *
 * ⚠️ `login` en çok görülen ekrandır (`register` hayatta bir kez) ve bu yüzden
 * EN SAKİN sahneyi alır: M1'in yüksek doygunluklu gün batımı bir kez
 * etkileyici, her sabah yorucudur. `walk` aynı palettedir ama ışığı dağılmış
 * ve kontrastı düşüktür.
 *
 * ⚠️ `select-tenant` → `stage` bir tesadüf değil görüntünün İÇERİĞİDİR:
 * o sahnede merkezdeki podyumda maskot durur, yanlarda BOŞ PODYUMLAR bekler —
 * kullanıcı da birden fazla şirket arasından seçiyordur.
 */
export const AUTH_PANELS = {
  register: {
    scene: 'path',
    preload: true,
    slogan: 'İşletmenin hafızası buradan başlıyor.',
  },
  login: {
    scene: 'walk',
    preload: true,
    slogan: 'Şirketin hafızası yerinde duruyor.',
  },
  'verify-email': {
    slogan: 'Neredeyse tamam.',
  },
  'forgot-password': {
    /*
     * ⚠️ Setin en güçlü cümlesi ve TEK cümleye indirilirken korundu: iki
     * yarısı bir KARŞITLIK kurar, yani ikinci yarı bir açıklama değil
     * fikrin kendisidir. Ekranda iki satıra sarabilir — kısıt "tek satır"
     * değil "tek fikir".
     */
    slogan: 'Parolalar unutulur, şirketin hafızası unutmaz.',
  },
  'reset-password': {
    slogan: 'Sıfırlanan yalnızca parolan.',
  },
  'create-tenant': {
    scene: 'orbit',
    slogan: 'Şirketini kur, her şeyi tek yerden gör.',
  },
  'select-tenant': {
    scene: 'stage',
    /*
     * ⚠️ Soru cümlesi ("Hangi şirkete geçiyorsun?") BIRAKILDI: formun kendi
     * başlığı zaten "Şirket seç" diyor ve panel onu tekrar ediyordu. Panelin
     * işi yönlendirmek değil, markanın bir şey söylemesidir.
     */
    slogan: 'Her şirketin kendi hafızası var.',
  },
} as const satisfies Record<string, AuthPanelContent>;

/** Yedi ekranın anahtarı — testler ve sayfalar bu tipten geçer. */
export type AuthScreenKey = keyof typeof AUTH_PANELS;

/**
 * Anahtarların gezilebilir listesi.
 *
 * ⚠️ `Object.keys(AUTH_PANELS)` `string[]` döndürür ve onu `AuthScreenKey[]`e
 * çevirmek bir TİP ONAYI gerektirirdi — proje bunu yasaklıyor
 * (`consistent-type-assertions`). Bu yüzden liste ELLE yazılır ama TİPLE
 * bağlanır: yanlış bir anahtar derlemede yakalanır.
 *
 * ⚠️ Kalan tek risk sapmadır (tabloya sekizinci ekran eklenir, liste
 * güncellenmez) ve bir test onu kapatır: `auth-surface.spec` iki tarafın
 * uzunluğunu karşılaştırır.
 */
export const AUTH_SCREEN_KEYS: readonly AuthScreenKey[] = [
  'register',
  'login',
  'verify-email',
  'forgot-password',
  'reset-password',
  'create-tenant',
  'select-tenant',
];
