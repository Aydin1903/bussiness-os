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
 * ⚠️ Sahnesi olan dört ekranın dördü de KENDİ cümlesini taşır; Kademe B'nin
 * üçünde slogan YOKTUR (aşağıdaki not).
 *
 * ⚠️ Panelde MARKA ÖĞESİ YOKTUR — yazılı logo sağ sütunun üstündedir
 * (ADR-0052 §5.2 düzeltmesi, 2026-08-31). Panelin taşıdığı tek metin
 * slogandır.
 *
 * ⚠️ Kademe B'de `scene` DE `slogan` DA yoktur ve bu bir eksiklik DEĞİLDİR:
 * o ekranlar mekaniktir (gelen kutusundan altı hane taşımak), çoğunlukla
 * telefonda açılır ve orada dekoratif bir anlatı ikna etmez GECİKTİRİR.
 * Panel kaybolmaz — Mars zemini ve taneciği kalır; susan şey METİNDİR.
 *
 * ⚠️ `mascot-portrait` varlığı HENÜZ ÜRETİLMEDİ (ADR-0052 §2.3) ve bir sahne
 * kırpılıp "portre" diye KULLANILMAZ: kırpma arka plandaki Mars zeminini de
 * taşır ve panelin kendi gradyanıyla üst üste binerdi. Kademe B bugün
 * yalnızca gradyanla çalışır; bu, kabul edilmiş bir geri düşüştür.
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

/**
 * ⚠️ SLOGAN EKRAN BAŞINADIR — ve bu, bir gün önceki kararın GERİ ALINMASIDIR.
 *
 * ============================================================================
 * ÖNCE "TEK MARKA SLOGANI" DENDİ, SONRA GERİ ALINDI
 * ============================================================================
 * Bir tur önce slogan `AUTH_PANELS`ten çıkarılıp tek bir `BRAND_SLOGAN`
 * sabitine taşınmıştı; gerekçe _"bir markanın bir sloganı vardır"_ idi ve bir
 * test kopyalanmasını engelliyordu.
 *
 * Product Owner kararı değiştirdi (2026-08-31): **dört sahneli ekranın her
 * biri kendi cümlesini taşır.** Gerekçe ADR-0052 §2.1'in kendi ölçütüdür —
 * _"karakterin bulunduğu durum, kullanıcının bulunduğu durumla aynı
 * olmalıdır"_. O ölçüt sahne seçimi için yazılmıştı; slogan da aynı ölçüte
 * tabi olunca sahneyle **aynı şeyi** söyler:
 *
 *   Yol (M1) → yeni gelen        → "Bugün katıl / yarın hatırlansın."
 *   Yürüyüş (M3) → dönen kullanıcı → "Sen büyü / o hatırlasın."
 *   Yörünge (M4) → kuruyor        → "Şirketini kur / merkezini oluştur."
 *   Sahne (M2) → seçiyor          → "Şirketini seç / kaldığın yerden sür."
 *
 * ⚠️ **KADEME B'NİN SLOGANI YOKTUR** ve bu bir eksiklik değil, ADR-0052
 * §1.3'ün zaten verilmiş kararının sonuna kadar götürülmesidir: o ekranlar
 * MEKANİKTİR (gelen kutusundan altı hane taşımak) ve orada dekoratif bir
 * anlatı kullanıcıyı ikna etmez, GECİKTİRİR. Panel yine de kaybolmaz —
 * Mars zemini ve taneciği kalır; susan şey **metindir**.
 *
 * ⚠️ Bir turdur ekranların üçünde de görünen `BRAND_SLOGAN` bu yüzden
 * **kaldırıldı**; "Sen büyü / o hatırlasın." artık markanın değil `login`in
 * cümlesidir. Sabiti adıyla bırakmak yanıltıcı olurdu: tek bir ekranın metnini
 * `BRAND_*` diye adlandırmak, okuyan birine olmayan bir kural anlatırdı.
 */

export interface AuthPanelContent {
  /** Yoksa Kademe B: fotoğraf katmanı hiç kurulmaz. */
  readonly scene?: AuthScene;
  /**
   * Panelin TEK cümlesi. ⚠️ Görsele GÖMÜLMEZ — gerçek DOM metnidir.
   *
   * ⚠️ **YOKSA PANEL SUSAR** (Kademe B). `''` yazmak DEĞİL, alanı hiç
   * yazmamak: boş bir dize `<p>`yi yine kurar ve panelde görünmez ama
   * ölçülebilir bir boşluk bırakırdı — bir test `<p>`nin hiç olmadığını
   * iddia ediyor.
   *
   * ⚠️ **İKİ YARIM, ARALARINDA EĞİK ÇİZGİ** (referans: _"Look first / Then
   * leap."_). Eğik çizgi metnin **İÇİNDEDİR**, ayrı bir öğe değildir: ayrı bir
   * `<span>`e alınsaydı slogan tek bir metin düğümü olmaktan çıkardı — ekran
   * okuyucu iki parça okur, tarayıcı çevirisi araya girer ve
   * `getByText(slogan)` çalışmaz hâle gelirdi. Biçim uğruna metnin bütünlüğü
   * bozulmaz.
   */
  readonly slogan?: string;
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
    slogan: 'Bugün katıl / yarın hatırlansın.',
  },
  login: {
    scene: 'walk',
    preload: true,
    slogan: 'Sen büyü / o hatırlasın.',
  },
  /*
   * ⚠️ ÜÇÜ DE BOŞ — Kademe B. `slogan` alanı YAZILMAZ (yukarıdaki not):
   * mekanik ekranda dekoratif anlatı yoktur.
   */
  'verify-email': {},
  'forgot-password': {},
  'reset-password': {},
  'create-tenant': {
    scene: 'orbit',
    slogan: 'Şirketini kur / merkezini oluştur.',
  },
  'select-tenant': {
    scene: 'stage',
    slogan: 'Şirketini seç / kaldığın yerden sür.',
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
