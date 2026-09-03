import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LandingLayout from '@/app/(landing)/layout';
import BlogPage from '@/app/(landing)/blog/page';
import HakkindaPage from '@/app/(landing)/hakkinda/page';
import ModulesPage from '@/app/(landing)/moduller/page';
import LandingPage from '@/app/(landing)/page';
import QuestionsPage from '@/app/(landing)/sorular/page';

import { LANDING_MODULES, moduleNo } from './modules';

/**
 * ADR-0054'ÜN ZORUNLU TESTLERİ.
 *
 * ============================================================================
 * NEDEN BU TESTLER VAR
 * ============================================================================
 * Landing, projedeki ÜÇÜNCÜ tasarım yüzeyidir ve ADR-0052'nin auth için
 * kurduğu sınır disiplinini miras alır: **yazılı sınırlar sızar.** Aşağıdaki
 * her test, hata verdiğinde SESSİZ kalacak bir sızıntı yolunu kapatır:
 *
 *   1. `data-surface` unutulur → sayfa çalışır, tüm stil kaybolur.
 *   2. Bir modülün rengi değişir → uygulama yeni, pazarlama eski rengi gösterir.
 *   3. Landing token'ı `/app`e sızar → üç dil karışır.
 *   4. Kök rota sağlık verisi çizmeye geri döner → bilgi sızıntısı geri gelir.
 *   5. Ölü bir `href="#"` geri gelir → tıklayan kullanıcı sayfanın başına atılır.
 */

/*
 * ⚠️ `usePathname` TAKLİT EDİLİR: `SiteHeader` bir Client Component'tır ve
 * jsdom'da Next'in router bağlamı YOKTUR — taklit edilmezse her render
 * "invariant expected app router to be mounted" ile patlar ve hata testin
 * konusuyla hiç ilgisi olmayan bir yerden gelirdi.
 */
vi.mock('next/navigation', () => ({
  usePathname: (): string => '/',
}));

/*
 * ⚠️ `next/font/google` TAKLİT EDİLİR — VE SEBEBİ TEST DEĞİL, DERLEYİCİDİR.
 *
 * `Plus_Jakarta_Sans(...)` çalışma zamanında bir fonksiyon DEĞİLDİR: Next'in
 * SWC eklentisi onu derleme sırasında indirilmiş font dosyalarına ve bir sınıf
 * adına DÖNÜŞTÜRÜR. Vitest o eklentiyi çalıştırmaz, yani çağrı
 * `(0, Plus_Jakarta_Sans) is not a function` ile patlar.
 *
 * ⚠️ Taklit bir şeyi ZAYIFLATMIYOR: font seçimi zaten tarayıcıda ölçülen bir
 * şeydir, jsdom'da doğrulanamaz. Burada iddia edilen şey düzen ve bağlantılar;
 * fontun kendisi kapanış denetiminde gerçek tarayıcıda görüldü.
 */
vi.mock('next/font/google', () => ({
  Plus_Jakarta_Sans: () => ({ variable: 'font-jakarta-mock' }),
}));

/*
 * ⚠️ jsdom `matchMedia` UYGULAMAZ ve bu bir kod kusuru değil ORTAM sınırıdır
 * (`chat-screen.spec`in aynı notu). `Reveal` mount olur olmaz hareket
 * tercihini sorar; taklit edilmezse `TypeError` fırlatır ve landing'in
 * TAMAMI, konusu hiç hareket olmayan testler dahil, kırmızı yanar.
 *
 * ⚠️ `matches: false` seçilmesi bir tercihtir: "hareket azaltma KAPALI", yani
 * `Reveal` gerçek IntersectionObserver yoluna girer. `true` dönseydi test
 * kolay yolu (hepsini doğrudan aç) sınardı ve asıl kod yolu hiç koşmazdı.
 */
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

const SRC = join(__dirname, '..', '..');

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

const LANDING_DIR = join(SRC, 'app', '(landing)');

/** Beş rotanın sayfa bileşenleri — hepsi tek turda gezilir. */
const SAYFALAR = [
  ['/', LandingPage],
  ['/moduller', ModulesPage],
  ['/sorular', QuestionsPage],
  ['/hakkinda', HakkindaPage],
  ['/blog', BlogPage],
] as const;

describe('ADR-0054 · 1. kapsam — `data-surface="landing"`', () => {
  /*
   * ⚠️ Bu attribute `landing-surface.css`in TAMAMINI açan tek anahtardır.
   * Unutulursa hiçbir şey kırılmaz: HTML doğru, metinler yerinde, sayfa
   * Tailwind preflight'ının çıplak hâlinde çizilir ve `--accent` terracottaya
   * döner. `data-module`ün bilinen sınırının aynısı (FRONTEND §4.8).
   */
  it('landing layout kökü kapsamı deklare eder', () => {
    const { container } = render(<LandingLayout>{null}</LandingLayout>);

    expect(container.querySelector('[data-surface="landing"]')).not.toBeNull();
  });

  it('kapsam KÖKTEDİR — çocuklar onun içindedir', () => {
    const { container } = render(
      <LandingLayout>
        <span data-testid="cocuk" />
      </LandingLayout>,
    );

    const root = container.querySelector('[data-surface="landing"]');

    /*
     * ⚠️ Önce kökün varlığı iddia edilir. `root?.querySelector(...)` kök YOKKEN
     * `undefined` döner ve `expect(undefined).not.toBeNull()` GEÇER — yani test
     * korumayı kaldıran mutasyonda yeşil yanardı (`auth-surface.spec`in aynı
     * dersi).
     */
    expect(root).not.toBeNull();
    expect(root?.querySelector('[data-testid="cocuk"]')).not.toBeNull();
  });
});

describe('ADR-0054 · 2. modül renkleri `module-colors.css` ile AYRIŞAMAZ', () => {
  /*
   * ⚠️ EN ÖNEMLİ TEST BUDUR.
   *
   * On iki imza renginin SSOT'u `module-colors.css`tir. `modules.ts` onların
   * KOPYASINI tutar, çünkü bir Server Component CSS değişkenini çözemez ve
   * landing kartları `[data-module]` kapsamına giremez (girselerdi ADR-0038'in
   * mekanizması on iki kez iç içe kurulur ve her kart `--accent`i ezerdi).
   *
   * Sapma SESSİZ olurdu: bir modülün rengi değişir, uygulama yeni rengi
   * gösterir, pazarlama sayfası eskisini gösterir ve hiçbir şey kırmızı yanmaz.
   */
  const PALETTE = readFileSync(join(SRC, 'app', 'module-colors.css'), 'utf8');

  /** `[data-module='x'] { --mc-light: #hex }` çiftlerini okur. */
  function paletteColors(): ReadonlyMap<string, string> {
    const found = new Map<string, string>();
    const pattern = /\[data-module='([\w-]+)'\]\s*\{([^}]*)\}/g;

    for (const block of PALETTE.matchAll(pattern)) {
      const key = block[1];
      const body = block[2];
      const light = /--mc-light:\s*(#[0-9a-f]{6})/i.exec(body ?? '')?.[1];
      if (key !== undefined && light !== undefined) {
        found.set(key, light.toLowerCase());
      }
    }

    return found;
  }

  const PALET = paletteColors();

  it('ayrıştırıcı gerçekten renk buluyor (test kendini kandırmasın)', () => {
    // Boş bir harita aşağıdaki döngüyü SESSİZCE geçerdi.
    expect(PALET.size).toBe(12);
  });

  it('landing tablosu on iki modülün hepsini taşır', () => {
    expect(LANDING_MODULES).toHaveLength(12);
  });

  it.each(LANDING_MODULES.map((m) => [m.key, m.renk] as const))(
    '%s — landing rengi `--mc-light` ile birebir aynı',
    (key, renk) => {
      expect(PALET.get(key), `${key} paletle eşleşmiyor`).toBe(renk.toLowerCase());
    },
  );

  it('anahtar kümesi de aynı — modül eklenip landing unutulmasın', () => {
    expect(LANDING_MODULES.map((m) => m.key).sort()).toEqual([...PALET.keys()].sort());
  });

  it('sıra numarası TÜRETİLİR, kolonda tutulmaz', () => {
    expect(moduleNo(0)).toBe('01');
    expect(moduleNo(11)).toBe('12');
  });
});

describe('ADR-0054 · 3. sızıntı — üç tasarım dili karışmaz', () => {
  const APP_FILES = walk(join(SRC, 'app', 'app'));

  it('tarama gerçekten dosya buluyor (test kendini kandırmasın)', () => {
    expect(APP_FILES.length).toBeGreaterThan(20);
  });

  it.each([
    ['--lp-', 'landing token’ı'],
    ['--nane', 'landing vurgu rengi'],
    ["data-surface='landing'", 'landing kapsamı'],
    ['data-surface="landing"', 'landing kapsamı'],
  ])('`%s` uygulamanın (/app) içine SIZMAMIŞ — %s', (needle) => {
    const leaks = APP_FILES.filter((file) => readFileSync(file, 'utf8').includes(needle)).map(
      (file) => file.slice(SRC.length + 1),
    );

    expect(leaks, `sızıntı: ${leaks.join(', ')}`).toEqual([]);
  });

  it('modül paleti landing token’ı TANIMLAMAZ — ayrı dosya, ayrı kapsam', () => {
    const palette = readFileSync(join(SRC, 'app', 'module-colors.css'), 'utf8');

    expect(palette).not.toContain('--lp-');
    expect(palette).not.toContain('--nane');
  });

  it('landing kapsamı AI token’larını EZMEZ', () => {
    /*
     * Landing'de AI konuşmaz, yani `--ai-*`'ın tüketicisi yoktur; ezmek olmayan
     * bir sesi susturmak olurdu (ADR-0052'nin auth için verdiği aynı karar).
     */
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    expect(css).not.toMatch(/--ai-(accent|ink|tint)\s*:/);
  });

  it('⚠️ Mars/maskot paleti landing’e KOPYALANMADI — auth’a dokunulmadı', () => {
    /*
     * ⚠️ `--mars-*` yalnızca `auth-surface.css`te yaşar. Landing yalnızca
     * fotoğraf altı zemin rengini (`#b4653a`) kullanır ve o bir token değil düz
     * bir değerdir — Mars paletini ikinci bir dosyaya kopyalamak, ADR-0052
     * §3.2'nin "Mars YALNIZCA panelin içinde yaşar" kuralını gevşetirdi.
     */
    /*
     * ⚠️ YORUMLAR AYIKLANIR: bu dosyanın kendi gerekçesi `--bot-mint`i
     * AÇIKLAMAK için geçiriyor (auth ile arasındaki ölçüm ayrışmasını kayda
     * geçen not). Ham metinde aramak, gerekçeyi YAZMAYI cezalandıran bir test
     * olurdu — iddia KODA dair olmalı, anlatıya değil (`page.spec`in aynı
     * dersi).
     */
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    expect(css).not.toMatch(/--mars-[\w-]+\s*:/);
    expect(css).not.toMatch(/--bot-(mint|lilac)\s*:/);
  });
});

describe('ADR-0054 · 4. kök rota — YÖNLENDİRME KALKTI, SIZINTI KALKMADI', () => {
  /*
   * ⚠️ BU TEST BİR ÖNCEKİNİN TERSİDİR VE BU KAYDA DEĞER.
   *
   * `src/app/page.spec.tsx` bir zamanlar şunu kilitliyordu: _"kök rota
   * `/login`e yönlendirir ve sağlık verisi ÇİZMEZ"_. Yönlendirme bir GÜVENLİK
   * DÜZELTMESİYDİ (kök rota ortam/uptime/db gecikmesi yayınlıyordu) ve
   * GEÇİCİ olduğu için bilerek 307 seçilmişti.
   *
   * Landing page geldi; yönlendirme kalktı. Eski test silinmedi, ⚠️ İKİYE
   * BÖLÜNDÜ: yönlendirme iddiası düştü, **sızıntı iddiası DURUYOR**. İkisini
   * birlikte silmek, güvenlik düzeltmesinin kilidini de kaldırırdı.
   */
  const HOME = readFileSync(join(LANDING_DIR, 'page.tsx'), 'utf8');

  it('kök rota artık YÖNLENDİRMİYOR', () => {
    const code = HOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/\bredirect\s*\(/);
    expect(code).not.toMatch(/permanentRedirect/);
  });

  it('⚠️ SAĞLIK VERİSİ SIZDIRAN hiçbir alan geri gelmedi', () => {
    // Eski kart bu dört değeri kimliksiz yayınlıyordu.
    expect(HOME).not.toMatch(/uptimeSeconds|latencyMs|dependencies|fetchHealth/);
  });

  it('landing’in hiçbir sayfası API’ye istek atmaz — pazarlama STATİK içeriktir', () => {
    /*
     * ⚠️ Bir `fetch` eklendiği gün sayfa hem yavaşlar hem de API'nin çalışır
     * olmasına BAĞLANIR: API düşse pazarlama sayfası da düşerdi. Bugün beş
     * sayfanın beşi de yalnızca kendi metnini çizer.
     */
    for (const file of walk(LANDING_DIR)) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

      expect(code, `${file} istek atıyor`).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

describe('ADR-0054 · 5. bağlantılar', () => {
  it.each(SAYFALAR)('%s — ölü `href="#"` YOK', (_yol, Sayfa) => {
    /*
     * ⚠️ Prototipte GİRİŞ, ÜCRETSİZ BAŞLA, blog kartları ve üç yasal metin
     * `href="#"` taşıyordu (o dosyada hedef sayfalar yoktu). Ölü bir bağlantı
     * tıklandığında sayfayı BAŞA ATAR ve kullanıcı bunu bir arıza olarak okur.
     *
     * ⚠️ Sayfa içi çapalar (`#odalar`, `#nasil`) bunun DIŞINDADIR ve meşrudur:
     * onların gerçek bir hedefi vardır. İddia yalnızca BOŞ çapaya dairdir.
     */
    const { container } = render(
      <LandingLayout>
        <Sayfa />
      </LandingLayout>,
    );

    const olu = [...container.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '#');

    expect(olu).toHaveLength(0);
  });

  it('üst çubuktaki iki eylem GERÇEK rotalara gider', () => {
    const { container } = render(
      <LandingLayout>
        <span />
      </LandingLayout>,
    );

    const hedefler = [...container.querySelectorAll('.ust-act a')].map((a) =>
      a.getAttribute('href'),
    );

    expect(hedefler).toEqual(['/login', '/register']);
  });

  it('⚠️ blog kartları BAĞLANTI DEĞİLDİR — detay sayfası henüz yok', () => {
    /*
     * ⚠️ Bu test "yarısı yapıldı" hâlinin sessizce yaşamasını engeller: biri
     * kartları `<Link>`e çevirirse ve detay rotası hâlâ yoksa test kırmızı
     * yanar. Detay sayfası yazıldığı gün bu test TERSİNE ÇEVRİLİR — silinmez.
     */
    const { container } = render(
      <LandingLayout>
        <BlogPage />
      </LandingLayout>,
    );

    const kartlar = container.querySelectorAll('.yazi');

    expect(kartlar.length).toBeGreaterThan(0);
    for (const kart of kartlar) {
      expect(kart.tagName).toBe('ARTICLE');
    }
  });

  it('⚠️ yazılmamış yasal metinler BAĞLANTI DEĞİLDİR', () => {
    const { container } = render(
      <LandingLayout>
        <span />
      </LandingLayout>,
    );

    expect(container.querySelectorAll('.foot .yok')).toHaveLength(3);
    expect(screen.getAllByText('[yazılacak]')).toHaveLength(3);
  });
});

describe('ADR-0054 · 6. içerik gerçekten çiziliyor', () => {
  it('ana sayfa on iki odanın on ikisini de listeler', () => {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    expect(container.querySelectorAll('.odalar .oda')).toHaveLength(12);
  });

  it('modüller sayfası on iki satır çizer', () => {
    const { container } = render(
      <LandingLayout>
        <ModulesPage />
      </LandingLayout>,
    );

    expect(container.querySelectorAll('.satirlar .satir')).toHaveLength(12);
  });

  it('sorular sayfası JS’siz akordeon kullanır (`<details>`)', () => {
    /*
     * ⚠️ Elle yazılmış bir akordeon bu sayfayı Client Component'a çevirirdi ve
     * klavye + ekran okuyucu + Ctrl+F desteğini üç ayrı yerde üstlenmek zorunda
     * kalırdı. Kapalı bir `<details>`in içindeki metni tarayıcı BULUR ve paneli
     * kendisi AÇAR; `display: none` altındaki bir div'de bu çalışmaz.
     */
    const { container } = render(
      <LandingLayout>
        <QuestionsPage />
      </LandingLayout>,
    );

    const sss = container.querySelectorAll('details.sss');

    expect(sss.length).toBeGreaterThanOrEqual(6);
    for (const madde of sss) {
      expect(madde.querySelector('summary')).not.toBeNull();
    }
  });

  it('koridor her sayfada BEŞ kapı gösterir — bulunulan oda elenir', () => {
    /*
     * ⚠️ Beş, `landing-surface.css`in ızgarasının yazıldığı sayıdır (dört oda +
     * başla). Altıncı bir kapı ekleyip ızgarayı güncellememek, beşinciyi tek
     * başına alt satıra düşürürdü — CSS'in kendi yorumunun kaydettiği durum.
     */
    for (const [, Sayfa] of SAYFALAR.slice(1)) {
      const { container, unmount } = render(
        <LandingLayout>
          <Sayfa />
        </LandingLayout>,
      );

      expect(container.querySelectorAll('.koridor .kapi')).toHaveLength(5);
      unmount();
    }
  });

  it('her oda sayfası kendi kapısını koridorda GÖSTERMEZ', () => {
    const { container } = render(
      <LandingLayout>
        <ModulesPage />
      </LandingLayout>,
    );

    const hedefler = [...container.querySelectorAll('.koridor .kapi')].map((a) =>
      a.getAttribute('href'),
    );

    expect(hedefler).not.toContain('/moduller');
  });
});

describe('ADR-0054 · 7. varlıklar', () => {
  const BRAND = join(SRC, '..', 'public', 'brand');

  it('⚠️ HAM KAYNAK repoya girmedi — yalnızca üretilmiş çıktılar', () => {
    /*
     * ADR-0052 §5.5'in kuralı: üretilmiş AVIF/WebP çıktıları `public/brand/`
     * altına girer; ham JPEG'ler ve ham video GİRMEZ. Landing bu kuralı
     * genişletir değil, UYGULAR: maskot döngüsü repoya `webm` olarak girer
     * (330/585 KB), 1 MB'lık ham `mp4` girmez.
     */
    const files = readdirSync(BRAND);

    expect(files.filter((f) => /\.(jpe?g|mp4|mov|png)$/i.test(f))).toEqual([]);
  });

  it('landing’in kullandığı dört yeni varlık yerinde', () => {
    for (const file of [
      'wordmark.webp',
      'mascot-wave.webp',
      'mascot-loop-1x.webm',
      'mascot-loop-2x.webm',
    ]) {
      expect(statSync(join(BRAND, file)).size).toBeGreaterThan(0);
    }
  });

  it('⚠️ SAHNELER YENİDEN ÜRETİLMEDİ — auth ile AYNI dosyalar kullanılır', () => {
    /*
     * ⚠️ Prototipin sahne WebP'leri `public/brand/` altındakilerle BAYT BAYT
     * aynıydı (ölçüldü). İkinci bir kopya üretmek, aynı görselin iki ayrı
     * bütçeye ve iki ayrı önbelleğe düşmesi demekti; auth'ta sahne
     * değiştirildiği gün landing eskisini göstermeye devam ederdi.
     */
    for (const scene of ['path', 'walk', 'orbit', 'stage']) {
      expect(statSync(join(BRAND, `mascot-scene-${scene}.webp`)).size).toBeGreaterThan(0);
    }
  });

  it('durağan kare ve döngü bütçe içinde (1x ≤ 400 KB, 2x ≤ 700 KB)', () => {
    /*
     * ⚠️ Bütçe bir kez ölçüldü diye korunmaz: yarın biri döngüyü daha yüksek
     * kaliteyle yeniden üretirse bütçe SESSİZCE aşılır ve bedelini en yavaş
     * bağlantıdaki kullanıcı öder (ADR-0052 §5.3'ün aynı gerekçesi).
     *
     * ⚠️ Video sayfa açılışında TEK BAYT indirmez (`preload="none"` + kaynak
     * yalnızca imleç kutuya girince atanır), yani bu bütçe bir LCP bütçesi
     * değil, gönüllü bir etkileşimin bedelidir — bu yüzden sahnelerden (120 KB)
     * daha gevşektir.
     */
    expect(statSync(join(BRAND, 'mascot-loop-1x.webm')).size).toBeLessThanOrEqual(400 * 1024);
    expect(statSync(join(BRAND, 'mascot-loop-2x.webm')).size).toBeLessThanOrEqual(700 * 1024);
    expect(statSync(join(BRAND, 'mascot-wave.webp')).size).toBeLessThanOrEqual(120 * 1024);
    expect(statSync(join(BRAND, 'wordmark.webp')).size).toBeLessThanOrEqual(120 * 1024);
  });
});
