import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AuthLayout from '@/app/(auth)/layout';

import { AUTH_PANELS, AUTH_SCREEN_KEYS } from './auth-panels';
import { AuthScreen } from './auth-screen';

/**
 * ADR-0052 §7.2'NİN ÜÇ ZORUNLU TESTİ.
 *
 * ============================================================================
 * NEDEN ÜÇÜ DE VAR
 * ============================================================================
 * ADR yazılı bir sınır koyuyor: **auth yüzeyi sıcak/maskotlu, uygulama
 * soğuk-nötr; ikisi karışmayacak.** Yazılı sınırlar sızar — bu üç test, üç
 * ayrı sızıntı yolunu kapatır ve üçünde de hata SESSİZ olurdu:
 *
 *   1. `data-surface` unutulur → ekran çalışır, terracotta geri gelir.
 *   2. Mars/maskot uygulamaya sızar → ekran çalışır, iki dil karışır.
 *   3. Slogan görsele gömülür → ekran çalışır, metin okunamaz/çevrilemez.
 *
 * Üçü de lint'in ve tip denetiminin göremediği sınıftandır.
 */

const SRC = join(__dirname, '..', '..');

const SCREENS = AUTH_SCREEN_KEYS;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe('ADR-0052 · 1. kapsam — `data-surface="auth"`', () => {
  /*
   * ⚠️ Bu attribute, terracottanın auth ekranlarından çıkmasının TEK
   * mekanizmasıdır (`auth-surface.css`). Unutulursa hiçbir şey kırılmaz:
   * ekran çalışır, düğme yeniden terracotta olur ve "ekranda tek turuncu
   * bölge vardır" garantisi sessizce kaybolur — `data-module`'ün bilinen
   * sınırının aynısı (FRONTEND §4.8).
   */
  it('auth layout kökü kapsamı deklare eder', () => {
    const { container } = render(<AuthLayout>{null}</AuthLayout>);

    const root = container.querySelector('[data-surface="auth"]');

    expect(root).not.toBeNull();
  });

  it('kapsam KÖKTEDİR — çocuklar onun içindedir', () => {
    // Kapsam bir yaprağa konsaydı token'lar yalnızca orada ezilirdi ve
    // formun düğmesi terracotta kalırdı.
    const { container } = render(
      <AuthLayout>
        <span data-testid="cocuk" />
      </AuthLayout>,
    );

    const root = container.querySelector('[data-surface="auth"]');

    /*
     * ⚠️ Önce kökün varlığı iddia edilir. İlk yazımda yalnızca alttaki satır
     * vardı ve `root?.querySelector(...)` kök YOKKEN `undefined` döndürüyordu;
     * `expect(undefined).not.toBeNull()` ise GEÇER. Yani test, korumayı
     * kaldıran mutasyonda yeşil yanıyordu — mutasyon denemesinde yakalandı.
     */
    expect(root).not.toBeNull();
    expect(root?.querySelector('[data-testid="cocuk"]')).not.toBeNull();
  });
});

describe('ADR-0052 · 2. sızıntı — iki tasarım dili karışmaz', () => {
  /*
   * ⚠️ EN ÖNEMLİ TEST BUDUR ve `brand-assets.spec.ts`'in desenini kullanır:
   * bir sınır tekrarlanabilir değilse yalnızca o günün fotoğrafıdır
   * (ADR-0043 Slice 1b'nin cümlesi).
   *
   * Mars turuncusu FRONTEND §4.8'in "terracottanın ±35° koridoru yasak"
   * kuralının TAM İÇİNDEDİR. Auth'ta bu meşrudur (orada AI konuşmaz, modül
   * yoktur); `/app` altında ise kuralın DOĞRUDAN ihlalidir.
   */
  const APP_FILES = walk(join(SRC, 'app', 'app'));

  it('tarama gerçekten dosya buluyor (test kendini kandırmasın)', () => {
    // Boş bir liste aşağıdaki kontrolleri SESSİZCE geçerdi.
    expect(APP_FILES.length).toBeGreaterThan(20);
  });

  it.each([
    ['mascot-', 'maskot varlığı'],
    ['--mars-', 'Mars token’ı'],
    ['--bot-', 'maskot rengi'],
    ['auth-panel', 'auth panel sınıfı'],
    ['data-surface', 'auth kapsamı'],
  ])('`%s` uygulamanın (/app) içine SIZMAMIŞ — %s', (needle) => {
    const leaks = APP_FILES.filter((file) => readFileSync(file, 'utf8').includes(needle)).map(
      (file) => file.slice(SRC.length + 1),
    );

    expect(leaks, `sızıntı: ${leaks.join(', ')}`).toEqual([]);
  });

  it('modül paleti Mars token’ı TANIMLAMAZ — auth ayrı dosyadadır', () => {
    /*
     * `module-colors.css` on iki iş modülünün SSOT'udur. Mars oraya yazılsaydı
     * on üçüncü modül geldiğinde paletin yanlış yerde aranmasına yol açardı —
     * ve daha kötüsü, `[data-module]` kapsamına düşen bir Mars token'ı
     * uygulamanın içinde çözülebilir hâle gelirdi.
     */
    const modulePalette = readFileSync(join(SRC, 'app', 'module-colors.css'), 'utf8');

    expect(modulePalette).not.toContain('--mars-');
    expect(modulePalette).not.toContain('--bot-');
  });

  it('auth kapsamı AI token’larını EZMEZ', () => {
    /*
     * Auth'ta AI konuşmaz, yani `--ai-*`'ın tüketicisi yoktur; ezmek olmayan
     * bir sesi susturmak olurdu. Daha önemlisi: bir gün auth'a bir AI yüzeyi
     * gelirse onun terracotta kalması DOĞRU davranıştır (FRONTEND §4.8).
     */
    const authSurface = readFileSync(join(SRC, 'app', 'auth-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    expect(authSurface).not.toMatch(/--ai-(accent|ink|tint)\s*:/);
  });
});

describe('ADR-0052 · 3. slogan GERÇEKTEN DOM metnidir', () => {
  /*
   * ⚠️ Slogan görsele gömülseydi: ekran okuyucu okuyamaz, tarayıcı çeviremez,
   * kopyalanamaz ve değiştirmek için bir görüntü düzenleyici gerekirdi.
   * Ayrıca kontrast ölçülemez hâle gelirdi — metin piksele dönüşmüş olurdu.
   */
  it('yedi ekranın YEDİSİ de tabloda (eksik ekran sessizce panelsiz kalmasın)', () => {
    expect(SCREENS).toHaveLength(7);
  });

  it('anahtar listesi tabloyla AYNI — sapma sessiz kalmasın', () => {
    /*
     * `AUTH_SCREEN_KEYS` elle yazılır (tip onayı yasak, `auth-panels.ts`).
     * Tek riski sapmadır: tabloya sekizinci ekran eklenip liste unutulursa
     * o ekran hiçbir testten geçmez ve panelsiz kalabilir.
     */
    expect([...SCREENS].sort()).toEqual(Object.keys(AUTH_PANELS).sort());
  });

  it.each(SCREENS)('%s — slogan DOM’da', (key) => {
    render(
      <AuthScreen screen={key}>
        <span />
      </AuthScreen>,
    );

    expect(screen.getByText(AUTH_PANELS[key].slogan)).toBeInTheDocument();
  });

  it('yedi sloganın YEDİSİ de iki yarımdan oluşur (` / ` ayracı)', () => {
    /*
     * ⚠️ Biçim kararı: her slogan iki kısa yarımdır ve aralarında bir eğik
     * çizgi durur (Product Owner, 2026-08-31 — referansın _"Look first /
     * Then leap."_ biçimi). Bir gün biri tek yarımlı bir cümle eklerse ekran
     * çalışmaya devam eder ve hata SESSİZ olur: yalnızca o ekran setin
     * ritminden düşer.
     *
     * ⚠️ Eğik çizgi metnin İÇİNDEDİR, ayrı bir öğe değildir — bu test aynı
     * zamanda onu kilitler: ayrı bir `<span>`e alınsaydı slogan tek bir metin
     * düğümü olmaktan çıkardı (ekran okuyucu, tarayıcı çevirisi).
     */
    for (const key of SCREENS) {
      const { slogan } = AUTH_PANELS[key];
      const halves = slogan.split(' / ');

      expect(halves, `${key}: "${slogan}"`).toHaveLength(2);
      expect(halves[0]?.length ?? 0).toBeGreaterThan(0);
      expect(halves[1]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('panelde TEK cümle vardır — destek satırı geri gelmesin', () => {
    /*
     * ⚠️ Panelde önce bir başlık + bir açıklama satırı ikilisi vardı ve gerçek
     * ekranda bir SLOGAN gibi değil bir PARAGRAF gibi okundu (Product Owner,
     * 2026-08-31). İkinci bir `<p>` eklemek o kararı sessizce geri alırdı:
     * ekran çalışır, hiçbir test kırmızı yanmaz.
     */
    const { container } = render(
      <AuthScreen screen="login">
        <span />
      </AuthScreen>,
    );

    expect(container.querySelectorAll('.auth-panel p')).toHaveLength(1);
  });

  it('panelde <img> YOKTUR — sahne bir CSS zeminidir', () => {
    /*
     * Sahne `background-image` olarak verilir ki `@media (min-width: 1024px)`
     * altında dar ekranda HİÇ indirilmesin (ADR-0052 §4.2). Bir `<img>`
     * eklenmesi o garantiyi sessizce delerdi — ve görsel dekoratif olduğu için
     * zaten `alt=""` taşırdı, yani hiçbir anlam da kazandırmazdı.
     */
    const { container } = render(
      <AuthScreen screen="login">
        <span />
      </AuthScreen>,
    );

    const panel = container.querySelector('.auth-panel');

    expect(panel).not.toBeNull();
    expect(panel?.querySelector('img')).toBeNull();
  });

  it('KADEME B fotoğrafsızdır — `data-scene` hiç yazılmaz', () => {
    /*
     * ⚠️ `mascot-portrait` henüz üretilmedi ve bir sahne kırpılıp "portre"
     * diye KULLANILMAZ (ADR-0052 §2.3). Bu test o kararı kilitler: birine
     * `data-scene` eklemek, Kademe B'yi sessizce Kademe A'ya çevirirdi.
     */
    for (const key of ['verify-email', 'forgot-password', 'reset-password'] as const) {
      const { container, unmount } = render(
        <AuthScreen screen={key}>
          <span />
        </AuthScreen>,
      );

      expect(container.querySelector('.auth-panel')?.hasAttribute('data-scene')).toBe(false);
      unmount();
    }
  });

  it('yazılı logo SAĞ SÜTUNDADIR, panelde DEĞİL', () => {
    /*
     * ⚠️ ADR-0052 §5.2 TERSİNE ÇEVRİLDİ (Product Owner, 2026-08-31): logo sol
     * panelden sağ sütunun üstüne taşındı. Panelde bırakılsaydı okunurluğu
     * fotoğrafın o köşesindeki piksellere bağlı kalırdı ve sahne değiştiği gün
     * SESSİZCE zayıflardı — §3.7'nin metin için kurduğu scrim kuralının
     * logoda karşılığı yoktur.
     *
     * ⚠️ Ayrıca TEK bir örnek olmalı: önceki yazımda panelde bir, `<768px`'te
     * formun üstünde bir tane vardı ve ikisi ayrı kurallarla yaşıyordu.
     */
    const { container } = render(
      <AuthScreen screen="login">
        <span />
      </AuthScreen>,
    );

    const wordmarks = container.querySelectorAll('span.font-bold');
    const panel = container.querySelector('.auth-panel');
    const formCol = container.querySelector('.auth-form-col');

    expect(wordmarks).toHaveLength(1);

    /*
     * ⚠️ `?? null` GEREKLİ, süs değil: `noUncheckedIndexedAccess` altında
     * `wordmarks[0]` tipi `Element | undefined`'dır ve `contains()` yalnızca
     * `Node | null` kabul eder. İlk yazımda yoktu; vitest YEŞİL yandı ve
     * hatayı `tsc` yakaladı — birim testinin geçmesi tip denetiminin geçtiği
     * anlamına gelmez.
     */
    const wordmark = wordmarks[0] ?? null;

    expect(formCol?.contains(wordmark)).toBe(true);
    expect(panel?.contains(wordmark)).toBe(false);
    expect(screen.getByText('KobiWise')).toBeInTheDocument();
  });

  it('yedi sayfanın YEDİSİ de kendi ekran anahtarını deklare eder', () => {
    /*
     * Layout bir `pathname → ekran` haritası TUTMAZ (§5.1): kimliği sayfa
     * deklare eder. Bedeli, bir sayfanın `AuthScreen`i unutabilmesidir — o
     * zaman ekran panelsiz açılır ve hata SESSİZDİR. Bu test onu kapatır.
     */
    const authDir = join(SRC, 'app', '(auth)');

    for (const key of SCREENS) {
      const page = readFileSync(join(authDir, key, 'page.tsx'), 'utf8');

      expect(page, `${key}/page.tsx AuthScreen kullanmıyor`).toContain(`screen="${key}"`);
    }
  });
});

describe('ADR-0052 · scrim metnin PEŞİNDEN gider', () => {
  /*
   * ⚠️ BU TESTİN SEBEBİ YAŞANMIŞ BİR RİSKTİR. Slogan panelin altından üstüne
   * alındı (Product Owner, 2026-08-31). Scrim olduğu yerde bırakılsaydı metin
   * panelin EN AÇIK bölgesine — gün batımı gökyüzü, `--mars-glow`/`--mars-haze`
   * radyallerinin toplandığı yere — KORUMASIZ düşerdi.
   *
   * Ve hata SESSİZ olurdu: ekran çalışır, düzen doğrudur, hiçbir test kırmızı
   * yanmaz; yalnızca beyaz metin açık turuncunun üzerinde okunmaz.
   *
   * Bu yüzden ikisi TEK BİR KARARDIR ve test onları birbirine bağlar:
   * metin `justify-start` (üstte) ise scrim de `to bottom` (üstte yoğun)
   * olmak ZORUNDADIR.
   */
  const CSS = readFileSync(join(SRC, 'app', 'auth-surface.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('metin panelin ÜSTÜNDE hizalanır', () => {
    const { container } = render(
      <AuthScreen screen="login">
        <span />
      </AuthScreen>,
    );

    expect(container.querySelector('.auth-panel')?.className).toContain('justify-start');
  });

  it('scrim ÜSTTE yoğundur (`to bottom`) — metinle aynı yönde', () => {
    expect(CSS).toContain('to bottom');
    expect(CSS).not.toContain('to top');
  });

  it('Kademe B için AYRI bir scrim YOKTUR — tek kural, iki kademe', () => {
    /*
     * Metin alttayken Kademe B'nin ayrı hafif bir scrim'i vardı (orada gradyanın
     * alt ucu zaten koyuydu). Metin üste alınınca o gerekçe TERSİNE döndü ve
     * istisna silindi. Geri gelmesi, Kademe B'yi tam olarak korumasız bırakacağı
     * yerde zayıflatırdı.
     */
    expect(CSS).not.toContain(':not([data-scene])::after');
  });
});

describe('ADR-0052 · varlık bütçesi', () => {
  /*
   * Bütçe ≤120 KB/sahne (§5.3). Ölçüm bir kez yapıldı diye korunmaz: yarın
   * biri sahneyi daha yüksek kaliteyle yeniden üretirse bütçe SESSİZCE aşılır
   * ve bedeli en yavaş bağlantıdaki kullanıcı öder.
   */
  const BRAND = join(SRC, '..', 'public', 'brand');
  const BUDGET = 120 * 1024;

  const SCENES = SCREENS.map((key) => AUTH_PANELS[key]).flatMap((panel) =>
    'scene' in panel ? [panel.scene] : [],
  );

  it('dört sahne de üretilmiş (Kademe A + C)', () => {
    expect(new Set(SCENES).size).toBe(4);
  });

  it.each(SCENES)('mascot-scene-%s — AVIF ve WebP bütçe içinde', (scene) => {
    for (const ext of ['avif', 'webp']) {
      const { size } = statSync(join(BRAND, `mascot-scene-${scene}.${ext}`));

      expect(size, `${scene}.${ext} = ${String(Math.round(size / 1024))} KB`).toBeLessThanOrEqual(
        BUDGET,
      );
    }
  });
});
