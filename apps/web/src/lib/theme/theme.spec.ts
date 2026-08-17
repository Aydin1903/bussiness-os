import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyThemeChoice,
  isThemeChoice,
  readThemeChoice,
  THEME_ATTRIBUTE,
  THEME_KEY,
  THEME_NO_FLASH_SCRIPT,
  writeThemeChoice,
} from './theme';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  vi.restoreAllMocks();
});

describe('tema seçimi', () => {
  it('kayıt yoksa sistem tercihine düşer', () => {
    expect(readThemeChoice()).toBe('system');
  });

  it('yazılanı geri okur', () => {
    writeThemeChoice('dark');
    expect(readThemeChoice()).toBe('dark');
  });

  it("'system' seçimi anahtarı SİLER, 'system' diye yazmaz", () => {
    /*
     * ⚠️ Bu ayrım görünmez ama davranışı belirler. Anahtarda `"system"` dizesi
     * kalsaydı, bir sonraki okuma onu geçerli bir seçim sanıp attribute'u
     * `data-theme="system"` diye yazardı — ve CSS'in
     * `:not([data-theme='light'])` koşulu o değerde de doğru olduğu için
     * sistem AÇIKKEN bile tema koyuya kayabilirdi.
     */
    writeThemeChoice('dark');
    writeThemeChoice('system');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('bozuk değeri sistem tercihi sayar', () => {
    window.localStorage.setItem(THEME_KEY, 'mor');
    expect(readThemeChoice()).toBe('system');
  });

  it('depolama fırlatırsa uygulama çökmez', () => {
    // Gizli sekmede `localStorage` erişimi fırlatabilir. Tema tercihi
    // uygulamanın çalışmasını engelleyemez.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readThemeChoice()).toBe('system');
    expect(() => {
      writeThemeChoice('dark');
    }).not.toThrow();
  });

  it('yalnızca üç değeri tanır', () => {
    expect(isThemeChoice('system')).toBe(true);
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('auto')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe('belgeye uygulama', () => {
  it("'dark' ve 'light' attribute yazar", () => {
    applyThemeChoice('dark');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');

    applyThemeChoice('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it("'system' attribute'u KALDIRIR", () => {
    applyThemeChoice('dark');
    applyThemeChoice('system');
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});

describe('FOUC engelleyen script', () => {
  it('anahtar ve attribute adlarını SABİTLERDEN alır', () => {
    /*
     * ⚠️ Testin asıl konusu ikizleşmedir. Script gövdesi elle yazılsaydı
     * depolama anahtarı iki yerde dururdu; biri değişince hata SESSİZ olurdu —
     * tema kaydedilir ama açılışta okunmaz, yani yalnızca ilk kare yanlış
     * temada boyanır ve kimse fark etmez.
     */
    expect(THEME_NO_FLASH_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_NO_FLASH_SCRIPT).toContain(JSON.stringify(THEME_ATTRIBUTE));
  });

  it('depolama fırlatsa bile sessizce geçer', () => {
    expect(THEME_NO_FLASH_SCRIPT).toContain('catch');
  });

  /*
   * ⚠️ `new Function` BİLEREK kullanılıyor ve lint kuralı burada susturuluyor.
   *
   * Script'i yalnızca string olarak kontrol etmek YETMEZ: sözdizimi hatası
   * taşıyan bir string de `toContain` iddialarını geçerdi ve tarayıcıda
   * sessizce ölürdü — FOUC geri gelir, hiçbir test kırmızı yanmaz. Bu testin
   * varlık sebebi tam olarak o boşluktur, dolayısıyla script GERÇEKTEN
   * çalıştırılmak zorunda.
   */
  function runNoFlashScript(): void {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function(THEME_NO_FLASH_SCRIPT)();
  }

  it('gerçekten çalışır ve attribute yazar', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    runNoFlashScript();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it("'system' kayıtlıyken attribute YAZMAZ", () => {
    runNoFlashScript();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});
