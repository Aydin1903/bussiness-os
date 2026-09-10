import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LandingLayout from '@/app/(landing)/layout';
import BlogPage from '@/app/(landing)/blog/page';
import HakkindaPage from '@/app/(landing)/hakkinda/page';
import ModulesPage from '@/app/(landing)/moduller/page';
import LandingPage from '@/app/(landing)/page';
import QuestionsPage from '@/app/(landing)/sorular/page';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

import {
  BLOG_YAZILARI,
  YAZILAR_YENIDEN_ESKIYE,
  makaleSemasi,
  sonDegisiklik,
  yaziBul,
} from './blog-posts';
import { DOORS } from './corridor';
import { Makale } from './makale';
import { LANDING_MODULES, moduleNo } from './modules';
import { SITE_URL } from './site-url';
import { SLOGAN_BAS, SLOGAN_SON } from './slogan';

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

  it('⚠️ blog kartları GERÇEK bir yazıya bağlanır — ölü kart yok', () => {
    /*
     * ⚠️ TERSİNE ÇEVRİLDİ, SİLİNMEDİ (2026-09-10) — bu testin eski hâli
     * _"kartlar BAĞLANTI DEĞİLDİR, detay sayfası henüz yok"_ diyordu ve kendi
     * yorumu bugünü öngörmüştü: _"Detay sayfası yazıldığı gün bu test TERSİNE
     * ÇEVRİLİR."_ Detay sayfası yazıldı.
     *
     * Korunan niyet aynı: "yarısı yapıldı" hâli sessizce yaşamasın. Eskiden
     * bu, bağlantının VAR OLMAMASI demekti; bugün her bağlantının VAR OLAN bir
     * yazıya gitmesi demek. Kart sayısı yazı sayısına eşittir — var olmayan
     * bir yazının kartı (eski yedi yer tutucu gibi) listeye giremez.
     */
    const { container } = render(
      <LandingLayout>
        <BlogPage />
      </LandingLayout>,
    );

    const kartlar = [...container.querySelectorAll('.yazi')];
    const sluglar = new Set(BLOG_YAZILARI.map((yazi) => `/blog/${yazi.slug}`));

    expect(kartlar).toHaveLength(BLOG_YAZILARI.length);
    for (const kart of kartlar) {
      expect(kart.tagName).toBe('A');
      expect(
        sluglar.has(kart.getAttribute('href') ?? ''),
        'kart var olmayan bir yaziya gidiyor',
      ).toBe(true);
    }
  });

  it('⚠️ yazılmamış yasal metinler BAĞLANTI DEĞİLDİR', () => {
    const { container } = render(
      <LandingLayout>
        <span />
      </LandingLayout>,
    );

    expect(container.querySelectorAll('.foot .yok')).toHaveLength(3);
    /*
     * ⚠️ ASIL İDDİA SAYI DEĞİL, `<a>` OLMAMASIDIR. `href="#"` tıklandığında
     * sayfayı başa atar ve kullanıcı bunu bir arıza olarak okur; bu satırın
     * koruduğu şey o davranıştır, metnin kendisi değil.
     */
    for (const yok of container.querySelectorAll('.foot .yok')) {
      expect(yok.tagName).toBe('SPAN');
      expect(yok.querySelector('a')).toBeNull();
    }
  });

  /**
   * ⚠️ `[yazılacak]` → `Yakında` (Product Owner, 2026-09-09).
   *
   * Eski test `[yazılacak]` metnini kilitliyordu. ⚠️ Köşeli parantez bir
   * GELİŞTİRİCİ NOTUDUR ve canlı bir pazarlama sayfasında müşterinin gözünde
   * duruyordu — söylediği şey "eksik" değil "yarım bırakılmış"tı.
   *
   * ⚠️ Bu test köşeli parantezin GERİ GELMEMESİNİ de iddia eder: yalnızca
   * "Yakında"yı saymak, birinin yanına tekrar bir `[…]` eklemesini
   * yakalamazdı.
   */
  it('⚠️ yasal satırlar "Yakında" der — köşeli parantez GERİ GELMEZ', () => {
    const { container } = render(
      <LandingLayout>
        <span />
      </LandingLayout>,
    );

    expect(screen.getAllByText('Yakında')).toHaveLength(3);
    expect(container.querySelector('.foot')?.textContent).not.toContain('[');
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

/**
 * ============================================================================
 * ⚠️ 8. SLOGAN — MARKANIN İMZASI, TEK KAYNAKTAN (Product Owner, 2026-09-09)
 * ============================================================================
 * Slogan iki yüzeyde birden görünür: hero'da büyük, üst çubukta logonun
 * altında küçük. ⚠️ Bu testlerin koruduğu şey sloganın METNİ değil, **tek
 * kaynaktan geldiğidir**.
 *
 * Sebep bu projede ölçülerek yaşandı: yazılı logonun auth'ta metin,
 * landing'de görsel olan iki uygulaması ADR-0054'te _"bugün kabul edilen,
 * ölçülmüş bir borç"_ diye kayda geçti — iki kopya, biri değişince öteki
 * sessizce eskiyor. Slogan için aynı borç açılmadı ve bu testler onu kapalı
 * tutar.
 */
describe('ADR-0054 · 8. slogan tek kaynaktan gelir', () => {
  const SRC_DIR = join(process.cwd(), 'src');

  it('hero başlığı sloganın İKİ YARIMINI da çizer', () => {
    render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    const h1 = screen.getByRole('heading', { level: 1 });

    expect(h1.textContent).toContain(SLOGAN_BAS);
    expect(h1.textContent).toContain(SLOGAN_SON);
  });

  /**
   * ⚠️ ÜST ÇUBUKTA SLOGAN YOKTUR — denendi ve GERİ ALINDI (PO, 2026-09-09).
   *
   * Kısa süreliğine logonun altına sloganın imzası konmuştu. Bu test onun
   * GERİ GELMEMESİNİ kilitler: yazılı logo zaten kendi alt satırını görselin
   * içinde taşıyor ve üçüncü bir satır marka kilitlenmesini kalabalıklaştırdı.
   */
  it('⚠️ üst çubukta logonun altında slogan YOKTUR', () => {
    const { container } = render(
      <LandingLayout>
        <span />
      </LandingLayout>,
    );

    expect(container.querySelector('.ust-slogan')).toBeNull();
    expect(container.querySelector('.ust-logo')?.textContent.trim()).toBe('');
  });

  /**
   * ⚠️ EN ÖNEMLİ TEST: slogan metni HİÇBİR YERE ELLE YAZILMAZ.
   *
   * `slogan.ts` dışında bir dosyada aynı cümle geçiyorsa, orada bir KOPYA
   * var demektir ve o kopya bir gün sessizce eskir. Test kaynağı tarar —
   * bir iddiayı tekrarlanabilir kılmanın tek yolu budur (ADR-0043 Slice 1b'nin
   * cümlesi).
   */
  it('⚠️ slogan metni `slogan.ts` DIŞINDA hiçbir dosyada elle yazılmamış', () => {
    const kopyalar: string[] = [];

    for (const dosya of walk(SRC_DIR)) {
      if (dosya.endsWith(join('landing', 'slogan.ts')) || dosya.endsWith('landing.spec.tsx')) {
        continue;
      }
      /*
       * ⚠️ YORUMLAR ELENİR — VE BU BİR GEVŞETME DEĞİL, İDDİANIN DOĞRU
       * EKSENE OTURTULMASIDIR.
       *
       * İlk yazımda ham metin taranıyordu ve test `site-header.tsx`i
       * yakaladı: orada slogan bir KOD DEĞİL, `aria-hidden` kararını
       * anlatan bir yorumun içindeydi. ⚠️ Yani test doğru çalıştı ama
       * yanlış şeyi ölçtü — korumak istediğimiz şey "slogan metni ikinci
       * kez RENDER EDİLMESİN", "hiçbir yerde ANILMASIN" değil.
       *
       * (Yorumdaki alıntı yine de kaldırıldı: bir yorum da eskir.)
       */
      const kod = readFileSync(dosya, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      if (kod.includes(SLOGAN_BAS)) {
        kopyalar.push(dosya.slice(SRC_DIR.length + 1));
      }
    }

    expect(kopyalar, `slogan kopyasi: ${kopyalar.join(', ')}`).toEqual([]);
  });
});

/**
 * ============================================================================
 * ⚠️ 9. İSTATİSTİK ŞERİDİ — JARGON GERİ GELMEZ (Product Owner, 2026-09-09)
 * ============================================================================
 * Şeritten iki kalem kaldırıldı: _"13 şemada satır bazlı izolasyon"_ ve
 * _"0 sağlayıcı kilidi"_. İkisi de DOĞRU cümlelerdi ama muhatapları bir
 * MÜHENDİSTİ; bir KOBİ sahibi o kelimelerden bir fayda çıkaramaz.
 *
 * ⚠️ Test metni değil, **jargonun geri gelmemesini** kilitler.
 */
describe('ADR-0054 · 9. istatistik şeridi KOBİ dilinde ve ÖLÇÜM BLOĞU', () => {
  function serit(): HTMLElement | null {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    return container.querySelector('.serit');
  }

  /**
   * ⚠️ ÜÇTEN DÖRDE ÇIKTI (2026-09-09, ikinci tur): şerit tek satırlık çıplak
   * bir metinken dört bloklu bir ölçüm paneline dönüştü ve dördüncü ölçüm
   * (dil) eklendi. ⚠️ ÜST SINIR DA İDDİANIN PARÇASIDIR: Product Owner
   * "dörtten fazla ekleme, şerit kalabalıklaşmasın" dedi — beşinci bir blok
   * eklendiği gün bu test kırmızı yanar.
   */
  it('şerit TAM DÖRT ölçüm bloğu taşır', () => {
    expect(serit()?.querySelectorAll('.olcum')).toHaveLength(4);
  });

  /**
   * ⚠️ HER BLOK BİR DEĞER VE BİR ETİKET TAŞIR — "stat card" düzeninin kendisi
   * budur. Biri eksik kalırsa ekran çalışır, blok yalnızca yarım görünür.
   */
  it('her blokta bir değer ve bir etiket vardır', () => {
    const bloklar = [...(serit()?.querySelectorAll('.olcum') ?? [])];

    expect(bloklar).toHaveLength(4);

    for (const blok of bloklar) {
      // `textContent` burada `string`tir; ikinci bir `?.` lint HATASI olur
      // (`no-unnecessary-condition` — 9. ve 11. blokların aynı dersi).
      expect(blok.querySelector('.deger')?.textContent.trim()).toBeTruthy();
      expect(blok.querySelector('.ad')?.textContent.trim()).toBeTruthy();
    }
  });

  it('⚠️ teknik jargon GERİ GELMEZ', () => {
    const metin = (serit()?.textContent ?? '').toLocaleUpperCase('tr-TR');

    expect(metin.length).toBeGreaterThan(20);
    expect(metin).not.toContain('ŞEMA');
    expect(metin).not.toContain('İZOLASYON');
    expect(metin).not.toContain('SAĞLAYICI KİLİDİ');
  });

  /**
   * ⚠️ ÜÇÜNCÜ VE DÖRDÜNCÜ BLOKTA UYDURULMUŞ BİR RAKAM YOKTUR. İlk ikisi
   * gerçek sayımdır (on iki modül, on sekiz kaynak); yanlarına "%100" gibi
   * ölçülmemiş bir yüzde koymak ikisini de zayıflatırdı.
   *
   * ⚠️ İDDİA METNİN KENDİSİNİ DE KİLİTLER ve bunun sebebi şudur: bu cümle
   * "13 şemada satır bazlı izolasyon"un KOBİ dilindeki karşılığıdır — yani
   * bir süsleme değil, bir GÜVENCENİN taşıyıcısı. Blok ikiye bölündü ama
   * cümle bölünmedi: yukarıdan aşağı okunduğunda hâlâ aynı cümledir.
   */
  it('⚠️ son blok SAHTE bir rakam taşımaz ve güvence AYNEN durur', () => {
    const sonuncu = [...(serit()?.querySelectorAll('.olcum') ?? [])].at(-1);
    const deger = sonuncu?.querySelector('.deger')?.textContent ?? '';
    const ad = sonuncu?.querySelector('.ad')?.textContent ?? '';

    expect(`${deger} ${ad}`).toBe('VERİLERİNİZ YALNIZCA SİZİN');
    expect(sonuncu?.textContent).not.toMatch(/\d|%/u);
  });

  /**
   * ⚠️ RENK TEK BAŞINA BİLGİ TAŞIMAZ (FRONTEND §4.8) — ama şeridin rakamları
   * artık renklidir ve o rengin dosyanın KENDİ token'ından gelmesi gerekir.
   * ⚠️ `--mars-*` paleti yalnızca `auth-surface.css`te yaşar ve `--mars-ink`
   * **#fff6ef**tir: beyaz zeminde kullanılsaydı rakamlar GÖRÜNMEZ olurdu ve
   * hata sessiz kalırdı — markup doğru, metin yerinde, ekran boş.
   */
  /**
   * ⚠️ HİZA METİN UZUNLUĞUNA BAĞLI OLAMAZ — VE BU KUSUR İKİ KEZ YAŞANDI.
   *
   * İlk çözüm `.deger`e bir `min-height` koymaktı ve tek satırlık değerlerde
   * çalışıyordu. Sonra değerin METNİ değişti ("TÜRKÇE" → "KENDİ DİLİNİZDE")
   * ve kusur geri geldi: gerçek tarayıcıda 780 px'in altında — henüz DÖRT
   * sütunken — uzun değer iki satıra sarıyor, kutusu 38 → 44 px büyüyor ve o
   * bloğun etiketi tek başına aşağı kayıyordu.
   *
   * ⚠️ Tetikleyici bir KOD değişikliği değil, BİR KELİME değişikliğidir —
   * yani bu testin koruduğu şey tam olarak "birinin metni uzatması"dır.
   * `subgrid` düşerse hiza sessizce metne bağımlı hale geri döner.
   */
  it('⚠️ hiza `subgrid` ile kurulur, `min-height` ile DEĞİL', () => {
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const kural = /\.serit \.olcum\s*\{[^}]*\}/gu;
    const govdeler = [...css.matchAll(kural)].map((m) => m[0]).join('\n');

    expect(govdeler, 'olcum kurali bulunamadi').not.toBe('');
    expect(govdeler).toMatch(/grid-template-rows:\s*subgrid/u);
    expect(govdeler).toMatch(/grid-row:\s*span 2/u);
  });

  it('⚠️ şerit rakamları landing’in kendi token’ından boyanır', () => {
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const kural = /\.serit \.deger\s*\{[^}]*\}/u.exec(css);

    expect(kural, 'serit deger kurali bulunamadi').not.toBeNull();
    expect(kural?.[0]).toMatch(/color:\s*var\(--lp-toprak\)/u);
    expect(kural?.[0]).not.toMatch(/--mars-/u);
  });
});

/**
 * ============================================================================
 * ⚠️ 10. ŞAPKALI "â" KULLANILMAZ (Product Owner, 2026-09-09)
 * ============================================================================
 * Marka dilinde düzeltme işareti taşıyan "â" kullanılmaz — "yapay zekâ" değil
 * **"yapay zeka"**. Kural yazımsaldır ve tek bir yerde unutulunca ürün aynı
 * kelimeyi iki türlü yazar; hata SESSİZDİR çünkü hiçbir şey kırılmaz.
 *
 * ⚠️ Test RENDER EDİLEN metni tarar, kaynağı değil: kod yorumlarındaki "hâlâ"
 * gibi kelimeler kullanıcıya ULAŞMAZ ve bu kuralın konusu değildir. Sınırı
 * doğru yere koymak, testin kapsam dışı dosyaları zorlamasını da engeller.
 */
describe('ADR-0054 · 10. şapkalı "â" ekranda GEÇMEZ', () => {
  it.each(SAYFALAR)('%s sayfasında düzeltme işareti yok', (_yol, Sayfa) => {
    const { container } = render(
      <LandingLayout>
        <Sayfa />
      </LandingLayout>,
    );

    const metin = container.textContent;

    expect(metin.length).toBeGreaterThan(100);
    expect(metin).not.toMatch(/[âÂ]/u);
  });
});

/**
 * ============================================================================
 * ⚠️ 11. BENTO KARTLARI DA KOBİ DİLİNDE (Product Owner, 2026-09-09)
 * ============================================================================
 * Şeritte yapılan iş (9. blok) bento'ya da uygulandı. ⚠️ Fark şudur: şeritten
 * iki kalem KALDIRILMIŞTI, bentodan hiçbiri kaldırılmadı — bento bir liste
 * değil bir DÜZENDİR, bir kartı çıkarmak ızgarayı bozardı. O yüzden burada
 * iddia "yok" değil, "başka dilde var"dır.
 */
describe('ADR-0054 · 11. bento kartları KOBİ dilinde', () => {
  /** ⚠️ Türkçe küçültme: `toLowerCase()` "İ"yi "i̇" yapar, "i" değil. */
  function kucuk(metin: string): string {
    return metin.toLocaleLowerCase('tr-TR');
  }

  function bento(): string {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    return container.querySelector('.bento')?.textContent ?? '';
  }

  it('⚠️ mühendis sözlüğü bentoya GERİ GELMEZ', () => {
    const metin = kucuk(bento());

    expect(metin.length).toBeGreaterThan(100);

    for (const jargon of ['şema', 'izolasyon', 'sağlayıcı', 'anlatısal', 'yapısal', 'sorgu']) {
      expect(metin, `bentoda jargon: ${jargon}`).not.toContain(jargon);
    }
  });

  /**
   * ⚠️ ÇEVİRİ RAKAMA DOKUNAMAZ. Bentonun dört sayısı da GERÇEK SAYIMLARDIR
   * (on iki modül · on sekiz kaynak · on üç iş şeması · sıfır sağlayıcı
   * bağımlılığı). Bir cümleyi sadeleştirirken sayıyı düşürmek ya da
   * "yuvarlamak" en sessiz hata olurdu: metin doğru okunur, iddia yanlışlaşır.
   */
  it('⚠️ dört gerçek sayım da yerinde duruyor', () => {
    /*
     * ⚠️ İDDİA `textContent` ÜZERİNDE DEĞİL `.rakam` ÖĞELERİ ÜZERİNDEDİR — ve
     * bu bir üslup tercihi değil, ölçülmüş bir zorunluluk: `textContent`
     * boşluk KOYMADAN birleştirir ("12Müşteriden…"), yani sayıyı bir kelime
     * sınırıyla aramak SESSİZCE başarısız olurdu — bu test tam olarak öyle
     * yazıldı ve öyle kırmızı yandı. Ayrıca kahraman rakamın YERİ de iddianın
     * parçasıdır: sayfa metninin ortasında geçen bir "13" bu testi
     * geçirmemelidir.
     */
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    // `??` YAZILMAZ: `textContent` burada `string`tir ve lint gereksiz koşulu
    // HATA sayar (`no-unnecessary-condition` — 9. bloğun aynı dersi).
    const rakamlar = [...container.querySelectorAll('.bento .rakam')].map((el) => el.textContent);

    expect(rakamlar).toEqual(['12', '18', '13', '0']);
  });
});

/**
 * ============================================================================
 * ⚠️ 12. KART HAREKETİ ERİŞİLEBİLİRLİK KAPISININ İÇİNDE KALIR
 * ============================================================================
 * Kartlar imleç üzerindeyken hafifçe eğilir ve büyür. ⚠️ `prefers-reduced-
 * motion` açık bir kullanıcıda bu hareket HİÇ OLMAMALIDIR — geriye yalnızca
 * gölge gibi hareketsiz bir hover durumu kalır.
 *
 * ⚠️ TEST DERECEYİ DEĞİL, HAREKETİN NEREDE TANIMLANDIĞINI kilitler. Derece bir
 * TASARIM tercihidir ve gerçek tarayıcıda ayarlanır; kapının içinde olup
 * olmaması ise bir ERİŞİLEBİLİRLİK sınırıdır ve sessizce delinebilir: kapının
 * dışına yazılan tek bir `transform` hiçbir şeyi kırmaz, hiçbir lint uyarmaz
 * ve yalnızca o tercihi açmış kullanıcıda görünür — yani bizim hiç
 * bakmadığımız yerde.
 */
describe('ADR-0054 · 12. kart hareketi `prefers-reduced-motion` kapısında', () => {
  const CSS = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  /** `@media (…) {` başlangıcından süslü parantez sayarak blok gövdesini çıkarır. */
  function blok(basSirasi: RegExp): string {
    const eslesme = basSirasi.exec(CSS);

    expect(eslesme, 'hareket medya sorgusu bulunamadi').not.toBeNull();

    const govdeBas = (eslesme?.index ?? 0) + (eslesme?.[0].length ?? 0);
    let derinlik = 1;
    let i = govdeBas;

    while (i < CSS.length && derinlik > 0) {
      if (CSS[i] === '{') derinlik += 1;
      if (CSS[i] === '}') derinlik -= 1;
      i += 1;
    }

    return CSS.slice(govdeBas, i - 1);
  }

  const KAPI = /@media \(prefers-reduced-motion: no-preference\)[^{]*\{/u;

  it('⚠️ hover eğimlerinin TAMAMI kapının içindedir', () => {
    const icerisi = blok(KAPI);
    const tumu = [...CSS.matchAll(/transform:\s*rotate\([^;]*;/gu)].map((m) => m[0]);
    const kapali = [...icerisi.matchAll(/transform:\s*rotate\([^;]*;/gu)].map((m) => m[0]);

    expect(tumu.length).toBeGreaterThan(0);
    expect(kapali.length, 'kapi disinda kalan egim var').toBe(tumu.length);
  });

  /**
   * ⚠️ Dokunmatik ekranda `:hover` bir dokunuştan sonra ÜZERİNDE KALIR — kart
   * eğik donardı ve kullanıcı onu düzeltemezdi.
   */
  it('⚠️ kapı dokunmatik cihazları da dışarıda bırakır', () => {
    expect(CSS).toMatch(/no-preference\) and \(hover: hover\) and \(pointer: fine\)/u);
  });

  /**
   * ⚠️ HAREKETSİZ HÂL KAPININ DIŞINDADIR — ve olmak zorundadır: hareket
   * azaltma tercihi açık kullanıcıda hover'dan geriye kalan TEK ŞEY odur.
   * İçeri alınsaydı o kullanıcı için kartlar hiçbir tepki vermezdi.
   */
  it('⚠️ gölgeli hover durumu kapının DIŞINDA tanımlıdır', () => {
    const icerisi = blok(KAPI);

    expect(CSS).toMatch(/box-shadow:\s*var\(--lp-kalk\)/u);
    expect(icerisi).not.toMatch(/box-shadow:\s*var\(--lp-kalk\)/u);
  });
});

/**
 * ============================================================================
 * ⚠️ 13. SATIR YÜKSEKLİĞİ TEK BİR SABİT DEĞİLDİR (ölçüldü, 2026-09-09)
 * ============================================================================
 * Ölçüm: sayfadaki on bir başlığın on birinde de `line-height / font-size`
 * oranı tam **1.060** çıkıyordu — 58.9 px'lik hero başlığında da, 20.5 px'lik
 * adım başlığında da. Punto büyütüldükçe (44.8 → 58.9 px) satırlar birbirine
 * yapıştı.
 *
 * ⚠️ Bu testler DEĞERİ değil, KUSUR SINIFINI kilitler. İkisi de yalnızca
 * İKİ SATIRA SARAN başlıkta görünen, tek satırlıkta hiç fark edilmeyen
 * sessiz bir bozulmayı kapatır.
 */
describe('ADR-0054 · 13. başlık satır yüksekliği', () => {
  const CSS = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('⚠️ ortak başlık kuralı 1.10’un altına inmez', () => {
    const kural = /h1,\s*h2,\s*h3\s*\{[^}]*\}/u.exec(CSS);

    expect(kural, 'ortak baslik kurali bulunamadi').not.toBeNull();

    const lh = /line-height:\s*([\d.]+)/u.exec(kural?.[0] ?? '');

    expect(lh, 'ortak baslik kuralinda line-height yok').not.toBeNull();
    expect(Number(lh?.[1])).toBeGreaterThanOrEqual(1.1);
  });

  /**
   * ⚠️ `em` BİR ÜSLUP TERCİHİ DEĞİL: hero başlığı `clamp` ile 34 → 62 px
   * arasında ölçekleniyor. Buraya sabit bir px yazılırsa boşluk küçük ekranda
   * kocaman, büyük ekranda yetersiz kalır — yani düzeltilen kusurun ta
   * kendisi geri gelir, üstelik SESSİZCE: masaüstünde doğru görünür.
   */
  it('⚠️ sloganın iki yarımı arasındaki boşluk PUNTOYA BAĞLIDIR (em)', () => {
    const kural = /\.hero-ic \.d1 i\s*\{[^}]*\}/u.exec(CSS);

    expect(kural, 'ikinci yarim kurali bulunamadi').not.toBeNull();

    const mt = /margin-top:\s*([\d.]+)(em|rem|px)/u.exec(kural?.[0] ?? '');

    expect(mt, 'iki yarim arasinda bosluk tanimli degil').not.toBeNull();
    expect(mt?.[2], 'sabit birim kullanilmis').toBe('em');
    expect(Number(mt?.[1])).toBeGreaterThan(0);
  });
});

/**
 * ============================================================================
 * ⚠️ 14. BENTO TEK IZGARA, TEK KALIP (Product Owner, 2026-09-10)
 * ============================================================================
 * Eski bento dört AYRI kalıptı ve dört kusuru gerçek tarayıcıda ölçüldü
 * (1280 px): yükseklikler 345/345/241/90 · "0" kartı iç içe bir ızgarada,
 * diğerleri 120'de başlarken o 375'te · fotoğraflı kartın metni görselin
 * ÜSTÜNDE mutlak konumlu bir kutu · "0" rakamı 38.4 px ve sağda, diğerleri
 * 58.9 px ve solda.
 *
 * ⚠️ Bu testler DÜZENİN KENDİSİNİ kilitler, çünkü dördü de sessiz kusurdu:
 * ekran çalışıyordu, lint susuyordu, hiçbir test kırmızı yanmıyordu.
 */
describe('ADR-0054 · 14. bento tek ızgara', () => {
  function bentoEl(): HTMLElement | null {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    return container.querySelector('.bento');
  }

  /**
   * ⚠️ "0" KARTININ KOPMASININ MEKANİK SEBEBİ BİR SARMALAYICIYDI (`.yigin`):
   * iç içe ızgaradaki kart, dış ızgaranın satır/sütun hesabına girmez. Dört
   * kart `.bento`nun DOĞRUDAN çocuğu olmalıdır.
   */
  it('⚠️ dört kart da ızgaranın DOĞRUDAN çocuğudur — sarmalayıcı yok', () => {
    const cocuklar = [...(bentoEl()?.children ?? [])];

    expect(cocuklar).toHaveLength(4);
    for (const kart of cocuklar) {
      expect(kart.classList.contains('kart')).toBe(true);
    }
  });

  /**
   * ⚠️ FOTOĞRAF METNİN ALTINDADIR — üstüne bindirilmiş bir kutu değil. DOM
   * sırası bunu söyler: rakam ve metin önce, görsel sonra. Eski düzende
   * metin görselin ÜZERİNE mutlak konumlu bir `.ic` kutusuyla yazılıyordu.
   */
  it('⚠️ fotoğraflı kartta metin görselin ÜSTÜNE yazılmaz', () => {
    const kart = bentoEl()?.querySelector('.kart-foto');

    expect(kart).not.toBeNull();
    expect(kart?.querySelector('.ic')).toBeNull();

    const sira = [...(kart?.children ?? [])].map((el) =>
      el.classList.contains('rakam')
        ? 'rakam'
        : el.classList.contains('foto')
          ? 'foto'
          : el.tagName,
    );

    expect(sira).toEqual(['rakam', 'P', 'foto']);
  });

  /**
   * ⚠️ DÖRT RAKAM TEK KURALDAN BOYANIR. Eski `.k-satir .rakam` istisnası
   * "0"ı 38.4 px'e düşürüyordu. Kaynakta `.kart .rakam` DIŞINDA bir rakam
   * boyu kuralı olursa dört rakam yeniden ayrışır.
   */
  it('⚠️ kart rakamlarının TEK bir boyut kuralı vardır', () => {
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    // ⚠️ Yalnızca BOYUT yazan kurallar sayılır: vurgu kartının rakamı
    // (`.kart-vurgu .rakam`) meşru olarak kendi RENGİNİ taşır — testin
    // konusu dört rakamın aynı BOYUTTA olmasıdır, aynı renkte değil.
    const kurallar = [...css.matchAll(/([^{}]*\.rakam)\s*\{([^}]*)\}/gu)]
      .filter((m) => (m[2] ?? '').includes('font-size'))
      .map((m) => (m[1] ?? '').trim())
      .filter((secici) => secici.includes('.kart') || secici.includes('.k-'));

    expect(kurallar).toEqual(['.kart .rakam']);
  });

  /**
   * ⚠️ 2×2 DÜZENDE İKİ SATIR DA AYNI BOY. Yalnızca `stretch` bir satırın
   * İÇİNİ eşitler; `grid-auto-rows: 1fr` olmadan üst ve alt satır farklı
   * boyda kalırdı ve "dört kart tutarlı yükseklikte" iddiası yalnızca geniş
   * ekranda doğru olurdu.
   */
  it('⚠️ iki sütunlu düzende satırlar eşit boy (`grid-auto-rows: 1fr`)', () => {
    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8');

    expect(css).toMatch(/\.bento\s*\{[^}]*grid-auto-rows:\s*1fr/u);
  });

  /**
   * ⚠️ TAM OLARAK BİR VURGU KARTI — hiyerarşinin kendisi budur. İki vurgu
   * kartı olsaydı hiyerarşi yine düzleşirdi ("hepsi eşit" yerine "ikisi
   * eşit"). ⚠️ Toprak ZEMİNDE değil RAKAMDA durur: düz toprak zemin gövde
   * metni için AA'yı iki yönde de kaçırıyor (ölçüldü: 4.32 ve 4.30 < 4.5).
   */
  it('⚠️ tek vurgu kartı: mürekkep zemin, toprak rakam', () => {
    expect(bentoEl()?.querySelectorAll('.kart-vurgu')).toHaveLength(1);

    const css = readFileSync(join(SRC, 'app', 'landing-surface.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    expect(css).toMatch(/\.kart-vurgu\s*\{[^}]*background:\s*var\(--lp-ink\)/u);
    expect(css).toMatch(/\.kart-vurgu \.rakam\s*\{[^}]*color:\s*var\(--lp-toprak\)/u);
    expect(css).not.toMatch(/\.kart-vurgu\s*\{[^}]*background:\s*var\(--lp-toprak\)/u);
  });
});

/**
 * ============================================================================
 * ⚠️ 15. /hakkinda — "DEĞİŞMEYEN DÖRT KARAR" KOBİ DİLİNDE (PO, 2026-09-10)
 * ============================================================================
 * Bölüm bir mühendise yazılmıştı ("port", "adaptör", "izolasyon", "şema",
 * "merge") ve hikâye anlatan sayfanın ortasında aniden ton kırıyordu. Dört
 * kural artık faydasıyla anlatılıyor — ana sayfadaki şeridin ve bentonun
 * jargon temizliğiyle AYNI mantık, aynı kilit.
 */
describe('ADR-0054 · 15. hakkında sayfası KOBİ dilinde', () => {
  function ilkeler(): HTMLElement | null {
    const { container } = render(
      <LandingLayout>
        <HakkindaPage />
      </LandingLayout>,
    );
    const baslik = [...container.querySelectorAll('h2')].find((h) =>
      h.textContent.includes('Değişmeyen dört karar'),
    );

    return baslik?.closest('section') ?? null;
  }

  it('⚠️ mühendis sözlüğü ilkeler bölümüne GERİ GELMEZ', () => {
    const bolum = ilkeler();

    expect(bolum, 'ilkeler bolumu bulunamadi').not.toBeNull();

    const metin = (bolum?.textContent ?? '').toLocaleLowerCase('tr-TR');

    expect(metin.length).toBeGreaterThan(200);
    for (const jargon of ['port ', 'adaptör', 'izolasyon', 'şema', 'merge', 'sorgu', 'kapsam']) {
      expect(metin, `ilkelerde jargon: ${jargon}`).not.toContain(jargon);
    }
  });

  /**
   * ⚠️ DÖRT KARAR DÖRT KALIR — çeviri bir kuralı düşürmemeli. Kartlar
   * `CLAUDE.md`nin Mutlak Kurallarından türer (dosya yorumu); biri sessizce
   * silinirse sayfa artık o kuralları anlatmaz ama kimse fark etmez.
   */
  it('dört karar da yerinde', () => {
    expect(ilkeler()?.querySelectorAll('.tas')).toHaveLength(4);
  });

  /**
   * ⚠️ KÖPRÜ: bölümün giriş cümlesi önceki bölüme ("Üç soru, üç yıl") GERİ
   * bakmak zorundadır. Yoksa okur "üç soru sorduk" ile "dört karar aldık"
   * arasında boşlukta kalır — PO'nun bildirdiği kusurun kendisi.
   */
  it('⚠️ giriş cümlesi üç soruya köprü kurar', () => {
    const giris = (ilkeler()?.querySelector('.alt')?.textContent ?? '').toLocaleLowerCase('tr-TR');

    expect(giris).toContain('üç soru');
  });
});

/**
 * ============================================================================
 * ⚠️ 16. /hakkinda — DÖRT YENİ BÖLÜM VE DÜRÜSTLÜK KİLİTLERİ (PO, 2026-09-10)
 * ============================================================================
 * Sayfa "daha detaylı" hale getirildi; bölüm listesi PO ile tek tek
 * onaylandı. Bu sayfa şirket adına KAMUYA AÇIK bir metindir — aşağıdaki
 * testler görünüşü değil, sayfanın söz verdiği ve vermediği şeyleri kilitler.
 */
describe('ADR-0054 · 16. hakkında sayfasının yeni bölümleri', () => {
  function sayfa(): HTMLElement {
    const { container } = render(
      <LandingLayout>
        <HakkindaPage />
      </LandingLayout>,
    );

    return container;
  }

  function bolum(baslik: string): HTMLElement | null {
    const h2 = [...sayfa().querySelectorAll('h2')].find((h) => h.textContent.includes(baslik));

    return h2?.closest('section') ?? null;
  }

  /**
   * Son başlık sayfanın değil KORİDORUN başlığıdır (`corridor.tsx`, her oda
   * sayfasında ortak) — altı hikâye bölümünden SONRA gelmesi de iddianın
   * parçasıdır: yeni bir bölüm koridorun altına eklenirse sıra bozulur.
   */
  it('altı bölüm hikâye sırasıyla durur, koridor en sonda', () => {
    const basliklar = [...sayfa().querySelectorAll('h2')].map((h) => h.textContent);

    expect(basliklar).toEqual([
      'Üç soru, üç yıl',
      'Değişmeyen dört karar',
      'Bir soru sorduğunuzda ne olur',
      'Neden bir program daha değil',
      'Kimin için yaptık',
      'Sırada ne var',
      'Diğer odalar',
    ]);
  });

  /**
   * ⚠️ JARGON SAYFANIN HİÇBİR YERİNE DÖNMEZ — 15. blok yalnızca ilkeler
   * bölümünü tarıyordu; yeni bölümler de aynı kurala tabidir.
   */
  it('⚠️ mühendis sözlüğü sayfanın hiçbir yerinde yok', () => {
    const metin = sayfa().textContent.toLocaleLowerCase('tr-TR');

    for (const jargon of ['port ', 'adaptör', 'izolasyon', 'şema', 'merge', 'sorgu', 'kapsam']) {
      expect(metin, `sayfada jargon: ${jargon}`).not.toContain(jargon);
    }
  });

  /**
   * ⚠️ YOL HARİTASINDA TARİH YOK — ve bu bölümün kendi cümlesidir ("tarih
   * vermiyoruz — bir tarih bir sözdür"). Bir yıl, bir ay ya da bir çeyrek
   * yazıldığı an ürün o tarihe borçlanır ve sayfa kendi sözünü çiğner.
   */
  it('⚠️ "Sırada ne var" hiçbir tarih vermez', () => {
    const metin = (bolum('Sırada ne var')?.textContent ?? '').toLocaleLowerCase('tr-TR');

    expect(metin.length).toBeGreaterThan(100);
    expect(metin).not.toMatch(/\b20\d\d\b/u);
    expect(metin).not.toMatch(/\bq[1-4]\b|çeyrek/u);
    for (const ay of [
      'ocak',
      'şubat',
      'mart',
      'nisan',
      'mayıs',
      'haziran',
      'temmuz',
      'ağustos',
      'eylül',
      'ekim',
      'kasım',
      'aralık',
    ]) {
      expect(metin, `yol haritasinda ay adi: ${ay}`).not.toContain(ay);
    }
  });

  /**
   * ⚠️ KARŞILAŞTIRMA MADDE MADDE KARŞILIKLIDIR: soldaki N. madde sağdaki N.
   * maddenin cevabıdır. Bir tarafa madde eklenip öteki unutulursa satırlar
   * kayar ve karşılaştırma bir karşılaştırma olmaktan çıkar — sessizce.
   *
   * ⚠️ Eski "Neyi bilerek yapmıyoruz" bölümü PO kararıyla kaldırıldı
   * (2026-09-10). E-fatura uyarısı bu sayfadan çıktı ama ÜRÜNDE duruyor:
   * faturanın kendisinde ve uygulama ekranında yazılı (ADR-0041 §1).
   */
  it('⚠️ karşılaştırmanın iki tarafı aynı uzunlukta', () => {
    const fark = bolum('Neden bir program daha değil');

    expect(fark, 'fark bolumu bulunamadi').not.toBeNull();

    const sol = fark?.querySelectorAll('.hayir li').length ?? 0;
    const sag = fark?.querySelectorAll('.evet li').length ?? 0;

    expect(sol).toBeGreaterThan(2);
    expect(sag).toBe(sol);
  });

  /**
   * ⚠️ HİÇBİR RAKİP İSİMLE ANILMAZ. Kamuya açık bir sayfada belirli bir firmayı
   * olumsuz anmak haksız rekabet ve karşılaştırmalı reklam kurallarına
   * takılır. Karşılaştırma bir YÖNTEMLE yapılır ("her iş için ayrı program"),
   * bir firmayla değil. Liste eksiksiz olamaz — ama en olası isimlerin bir
   * gün "etkili olur" diye eklenmesini yakalar.
   */
  it('⚠️ sayfada hiçbir rakip markası geçmez', () => {
    const metin = sayfa().textContent.toLocaleLowerCase('tr-TR');
    const markalar = [
      'logo yazılım',
      'mikro yazılım',
      'paraşüt',
      'netsis',
      'hubspot',
      'salesforce',
      'zoho',
      'bitrix',
      'chatgpt',
      'microsoft dynamics',
    ];

    for (const marka of markalar) {
      expect(metin, `rakip markasi: ${marka}`).not.toContain(marka);
    }
    expect(metin).not.toMatch(/\bsap\b/u);
  });
});

/**
 * ============================================================================
 * ⚠️ 17. BLOG YAZILARI · SITEMAP · ROBOTS (Product Owner, 2026-09-10)
 * ============================================================================
 * Üç yazı `/blog/[slug]` altında yayında. ⚠️ `robots.txt` ve `sitemap.xml`
 * BU İŞTE İLK KEZ yazıldı: görev "önceki işte kurulan altyapı" diyordu, ama
 * ölçüldüğünde ikisi de prod'da 404'tü ve git geçmişinde hiç yoktu.
 *
 * Testler görünüşü değil, arama motoruna ve okura verilen SÖZLERİ kilitler:
 * tek H1, giriş birebir, şema alanları, her yazının sitemap'te olması ve
 * robots'un blogu kapatmaması.
 */
describe('ADR-0054 · 17. blog yazıları, sitemap ve robots', () => {
  const HER_YAZI = BLOG_YAZILARI.map((yazi) => [yazi.slug, yazi] as const);

  function ciz(yazi: (typeof BLOG_YAZILARI)[number]): HTMLElement {
    const { container } = render(
      <LandingLayout>
        <Makale yazi={yazi} nonce="test-nonce" />
      </LandingLayout>,
    );

    return container;
  }

  it('altı yazı var', () => {
    expect(BLOG_YAZILARI).toHaveLength(6);
  });

  /**
   * ⚠️ LİSTE YENİDEN ESKİYE SIRALANIR ve öne çıkan kart EN YENİ yazıdır. Dizi
   * sırasına güvenilseydi yazılar eklendikçe "öne çıkan" sessizce eski bir
   * yazıya dönüşürdü.
   */
  it('⚠️ blog listesi yeniden eskiye, öne çıkan en yeni yazı', () => {
    const { container } = render(
      <LandingLayout>
        <BlogPage />
      </LandingLayout>,
    );
    const hrefler = [...container.querySelectorAll('.yazi')].map((k) => k.getAttribute('href'));
    const tarihler = YAZILAR_YENIDEN_ESKIYE.map((y) => y.tarih);

    expect(hrefler).toEqual(YAZILAR_YENIDEN_ESKIYE.map((y) => `/blog/${y.slug}`));
    expect(tarihler).toEqual([...tarihler].sort().reverse());
    expect(container.querySelector('.yazi-one')?.getAttribute('href')).toBe(hrefler[0]);
  });

  /**
   * ⚠️ Bazı yayın tarihleri editoryaldir (PO kararı, `blog-posts.ts`); gerçek
   * tarih `guncelleme`de durur. Bir değişiklik yayından ÖNCE olamaz — tersi,
   * şemada ve sitemap'te kendi kendisiyle çelişen bir tarih çifti olurdu.
   */
  it.each(HER_YAZI)('%s — son değişiklik yayın tarihinden önce değil', (_slug, yazi) => {
    expect(sonDegisiklik(yazi) >= yazi.tarih).toBe(true);
  });

  /**
   * ⚠️ Slug bir URL'dir: Türkçe karakter ("ş", "ı") ya da büyük harf taşısaydı
   * tarayıcı onu yüzde kodlamasıyla (`%C5%9F`) gösterir, paylaşılan bağlantı
   * okunmaz olurdu.
   */
  it.each(HER_YAZI)('%s — slug yalnızca küçük ASCII harf, rakam ve tire', (slug) => {
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  });

  /** Kart özeti girişin KISALTILMIŞIDIR (PO talimatı) — ayrı bir metin değil. */
  it.each(HER_YAZI)('%s — özet girişin önekidir', (_slug, yazi) => {
    expect(yazi.giris.startsWith(yazi.ozet)).toBe(true);
    expect(yazi.ozet.length).toBeLessThan(yazi.giris.length);
  });

  it.each(HER_YAZI)('%s — tek H1 = başlık, makalenin H2leri = bölümler', (_slug, yazi) => {
    const kap = ciz(yazi);
    const h1 = [...kap.querySelectorAll('h1')];

    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toBe(yazi.baslik);
    expect([...kap.querySelectorAll('article h2')].map((h) => h.textContent)).toEqual(
      yazi.bolumler.map((bolum) => bolum.baslik),
    );
  });

  /** ⚠️ PO: giriş paragrafı "değiştirme". Karakterine kadar kilitli. */
  it.each(HER_YAZI)('%s — giriş paragrafı BİREBİR görünür', (_slug, yazi) => {
    expect(ciz(yazi).querySelector('.oda-bas .alt')?.textContent).toBe(yazi.giris);
  });

  it.each(HER_YAZI)('%s — "Ücretsiz Başla" kayda gider, şapkalı "â" yok', (_slug, yazi) => {
    const kap = ciz(yazi);

    expect(kap.querySelector('.kapanis a[href="/register"]')).not.toBeNull();
    expect(kap.textContent).not.toMatch(/[âÂ]/u);
  });

  /**
   * ⚠️ Article şeması — Google'ın Article rich result alanları. Görsel adresi
   * MUTLAK olmalıdır: göreli yazılsaydı doğrulayıcı hata vermez, görsel
   * sessizce yok sayılırdı.
   */
  it.each(HER_YAZI)('%s — Article JSON-LD eksiksiz ve nonce taşıyor', (_slug, yazi) => {
    const betik = ciz(yazi).querySelector('script[type="application/ld+json"]');

    expect(betik, 'JSON-LD etiketi yok').not.toBeNull();
    expect(betik?.getAttribute('nonce')).toBe('test-nonce');

    // ⚠️ Tip onayı (`as`) bu projede yasak — yapı `toMatchObject` ile denetlenir.
    const sema: unknown = JSON.parse(betik?.textContent ?? '{}');

    expect(sema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: yazi.baslik,
      datePublished: yazi.tarih,
      dateModified: sonDegisiklik(yazi),
      author: { '@type': 'Organization', name: 'KobiWise' },
      image: [`${SITE_URL}${yazi.gorsel.src}`],
      mainEntityOfPage: { '@id': `${SITE_URL}/blog/${yazi.slug}` },
    });
  });

  /**
   * ⚠️ JSON bir `<script>` etiketinin içine yazılır; metinde "</script>" geçerse
   * etiket orada kapanırdı. Kaçırma bugünkü metinler için gereksiz görünür —
   * bu test, veri değiştiği gün kaçırmanın hâlâ orada olduğunu kanıtlar.
   */
  it('⚠️ JSON-LD metnine `</script>` sızamaz', () => {
    const ilk = BLOG_YAZILARI[0];

    expect(ilk).toBeDefined();
    if (ilk === undefined) return;

    const kotu = { ...ilk, baslik: 'Kapanış </script><b>sızıntı</b>' };
    const betik = ciz(kotu).querySelector('script[type="application/ld+json"]');

    expect(betik?.innerHTML).not.toContain('</script>');
    expect(JSON.parse(betik?.textContent ?? '{}')).toMatchObject({ headline: kotu.baslik });
    expect(makaleSemasi(kotu).headline).toBe(kotu.baslik);
  });

  /** Görsel mevcut dört maskot sahnesinden biri ve dosya GERÇEKTEN var. */
  it.each(HER_YAZI)('%s — görsel bir maskot sahnesi ve dosyası var', (_slug, yazi) => {
    expect(yazi.gorsel.src).toMatch(/^\/brand\/mascot-scene-(path|stage|orbit|walk)\.webp$/u);
    expect(existsSync(join(SRC, '..', 'public', yazi.gorsel.src))).toBe(true);
  });

  it('var olmayan bir slug için yazı yoktur (sayfa 404 döner)', () => {
    expect(yaziBul('boyle-bir-yazi-yok')).toBeUndefined();
  });

  /**
   * ⚠️ META AÇIKLAMA GOOGLE'IN KESME SINIRININ İÇİNDE (≤ 155) — ve girişten
   * AYRI bir metin. İlk yazımda giriş kullanılıyordu (~210–250 karakter) ve
   * arama sonucunda cümle ortasında kesiliyordu. Alt sınır (120), sınıra
   * sığsın diye anlamını yitirecek kadar kısaltılmış bir özeti yakalar.
   */
  it.each(HER_YAZI)('%s — meta açıklama 120–155 karakter, girişten ayrı', (_slug, yazi) => {
    // Türkçe harflerin hepsi tek UTF-16 birimidir; `.length` karakter sayısıdır.
    const uzunluk = yazi.metaAciklama.length;

    expect(uzunluk).toBeGreaterThanOrEqual(120);
    expect(uzunluk).toBeLessThanOrEqual(155);
    expect(yazi.metaAciklama).not.toBe(yazi.giris);
    expect(yazi.metaAciklama).not.toMatch(/[âÂ]/u);
  });

  /**
   * ⚠️ BÜLTEN VAADİ GERİ GELMEZ (PO, 2026-09-10). "Ayda iki yazı. Abone
   * olanlara e-postayla gider" ve "ABONE OL" kaldırıldı: gerçek bir bülten
   * sistemi yok. Bir gün bülten gerçekten kurulursa bu test o işle birlikte
   * — bilinçli olarak — değişir.
   */
  it('⚠️ blog sayfası var olmayan bir bülten vaat etmez', () => {
    const { container } = render(
      <LandingLayout>
        <BlogPage />
      </LandingLayout>,
    );
    const metin = container.textContent.toLocaleLowerCase('tr-TR');

    for (const vaat of [
      'abone',
      'bülten',
      'e-postayla gider',
      'ayda iki yazı',
      'haber veriyoruz',
    ]) {
      expect(metin, `vaat geri geldi: ${vaat}`).not.toContain(vaat);
    }
  });

  /**
   * ⚠️ SITEMAP ELLE YAZILMAZ: odalar koridordan, yazılar `BLOG_YAZILARI`ndan
   * türer. Bu test ikisinin de TAMAMININ sitemap'te olduğunu kilitler.
   */
  it('sitemap her odayı ve her yazıyı mutlak adresle içerir', () => {
    const girdiler = sitemap();
    const adresler = girdiler.map((girdi) => girdi.url);

    for (const kapi of DOORS) {
      expect(adresler).toContain(`${SITE_URL}${kapi.href}`);
    }
    for (const yazi of BLOG_YAZILARI) {
      const girdi = girdiler.find((g) => g.url === `${SITE_URL}/blog/${yazi.slug}`);

      expect(girdi, `sitemapte yok: ${yazi.slug}`).toBeDefined();
      // ⚠️ Yayın tarihi değil GERÇEK son değişiklik — bazı yayın tarihleri editoryal.
      expect(girdi?.lastModified).toBe(sonDegisiklik(yazi));
    }
    expect(adresler.every((adres) => adres.startsWith(SITE_URL))).toBe(true);
    expect(new Set(adresler).size).toBe(adresler.length);
  });

  /**
   * ⚠️ robots.txt kuralları ÖNEKTİR: "/b" gibi masum görünen bir satır blogun
   * tamamını kapatırdı. Her yayın adresi her `Disallow` satırına karşı
   * önek eşleşmesiyle denetlenir.
   */
  it('⚠️ robots hiçbir yayın sayfasını kapatmaz, /app kapalı, sitemap bildirilir', () => {
    const kural = robots();
    const kurallar = Array.isArray(kural.rules) ? kural.rules : [kural.rules];
    const kapali = kurallar.flatMap((k) =>
      k.disallow === undefined ? [] : Array.isArray(k.disallow) ? k.disallow : [k.disallow],
    );
    const yayinda = [
      ...DOORS.map((kapi) => kapi.href),
      ...BLOG_YAZILARI.map((yazi) => `/blog/${yazi.slug}`),
      '/login',
      '/register',
    ];

    for (const yol of yayinda) {
      for (const onek of kapali) {
        expect(yol.startsWith(onek), `"${onek}" kurali "${yol}" sayfasini kapatiyor`).toBe(false);
      }
    }
    expect(kapali).toContain('/app');
    expect(kural.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
