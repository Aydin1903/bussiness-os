/**
 * TEMA SEÇİMİ — üç durum, iki yazar (ADR-0038 Dilim 1).
 *
 * ============================================================================
 * NEDEN ARTIK ZORUNLU
 * ============================================================================
 * Koyu tema bugüne kadar YALNIZCA işletim sistemi tercihinden geliyordu;
 * `data-theme` hiçbir yerde yazılmıyordu (FRONTEND §4.8'in kayıtlı sınırı).
 * Oda sisteminde gündüz ve gece aynı odanın iki ışık kaynağıdır ve ikisi de
 * birinci sınıf vatandaştır — kullanıcının seçebilmesi gerekir.
 *
 * ============================================================================
 * ÜÇ DURUM, İKİSİ ATTRIBUTE YAZAR
 * ============================================================================
 *   'system' → attribute HİÇ yazılmaz; `@media (prefers-color-scheme)` karar verir
 *   'light'  → `data-theme="light"`; `:not([data-theme='light'])` eler, açık kalır
 *   'dark'   → `data-theme="dark"`;  özgüllük kazanır, koyu olur
 *
 * ⚠️ 'system' için attribute'u `"system"` diye YAZMAK bozardı: CSS yalnızca
 * `light` ve `dark` değerlerini tanıyor ve `:not([data-theme='light'])` koşulu
 * `system` değerinde de doğru olurdu — yani sistem açıkken bile koyu tema
 * medya sorgusuna kalırdı. Doğru davranış attribute'u KALDIRMAKTIR.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * ⚠️ `bo_` öneki BİLİNÇLİ olarak korundu (`bo_last_tenant`, `bo_session_hint`
 * ile aynı aile). Ürün adı KobiWise oldu ama depolama anahtarlarını yeniden
 * adlandırmak, kullanıcıların tarayıcısındaki mevcut değerleri görünmez kılar —
 * marka değişikliği yüzünden herkesin tema tercihinin sıfırlanması kabul
 * edilebilir bir bedel değil.
 */
export const THEME_KEY = 'bo_theme';
export const THEME_ATTRIBUTE = 'data-theme';

/**
 * ⚠️ `readonly string[]` — `readonly ThemeChoice[]` DEĞİL, ve bu bilinçli.
 *
 * Daha dar tip, `includes` çağrısını `value as ThemeChoice` gibi bir tip
 * iddiasına mecbur bırakıyordu; projenin lint kuralı
 * (`consistent-type-assertions`) tip iddialarını yasaklıyor ve haklı — bir
 * daraltma fonksiyonunun İÇİNDE iddia kullanmak, fonksiyonun kanıtlaması
 * gereken şeyi varsaymaktır. Geniş tiple `includes(value)` doğrudan geçer.
 */
const CHOICES: readonly string[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && CHOICES.includes(value);
}

/** Kayıtlı seçim; okunamazsa (SSR, kapalı depolama, bozuk değer) `'system'`. */
export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    // Gizli sekmede ya da depolama kapalıyken `localStorage` FIRLATIR.
    // Tema tercihi uygulamanın çalışmasını engelleyemez.
    return 'system';
  }
}

export function writeThemeChoice(choice: ThemeChoice): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (choice === 'system') {
      window.localStorage.removeItem(THEME_KEY);
    } else {
      window.localStorage.setItem(THEME_KEY, choice);
    }
  } catch {
    // Yazılamadıysa seçim bu oturumda geçerli olur, kalıcı olmaz. Sessiz
    // kalmak doğru: kullanıcı temayı DEĞİŞTİRDİĞİNİ ekranda zaten görüyor.
  }
}

/** Seçimi belgeye uygular. `'system'` attribute'u KALDIRIR (yukarıdaki not). */
export function applyThemeChoice(choice: ThemeChoice): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE);
  } else {
    root.setAttribute(THEME_ATTRIBUTE, choice);
  }
}

/**
 * İLK BOYAMADAN ÖNCE çalışan script — beyaz parlama (FOUC) engeli.
 *
 * ============================================================================
 * NEDEN BİR STRING, NEDEN BURADA
 * ============================================================================
 * React ağacı hidrasyondan sonra çalışır; o ana kadar belge attribute'suzdur ve
 * koyu tema seçmiş bir kullanıcı bir kare boyunca BEYAZ ekran görür. Tek çözüm
 * senkron çalışan bir inline script'tir.
 *
 * ⚠️ Script yukarıdaki mantığı TEKRAR eder ve bu bir ikizleşme riskidir —
 * `globals.css`'in iki koyu tema bloğuyla aynı sınıftan hata. Risk şöyle
 * kapatıldı: anahtar adı ve attribute adı buradaki SABİTLERDEN üretiliyor,
 * elle yazılmıyor. Bir birim testi de üretilen string'in ikisini de içerdiğini
 * kilitliyor.
 *
 * `try/catch` ZORUNLU: `localStorage` erişimi gizli sekmede fırlatır ve
 * yakalanmazsa script ölür — belge attribute'suz kalır ve FOUC geri gelir.
 */
export const THEME_NO_FLASH_SCRIPT = [
  '(function(){try{var c=localStorage.getItem(',
  JSON.stringify(THEME_KEY),
  ");if(c==='dark'||c==='light'){document.documentElement.setAttribute(",
  JSON.stringify(THEME_ATTRIBUTE),
  ',c)}}catch(e){}})()',
].join('');
