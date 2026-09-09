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
describe('ADR-0054 · 9. istatistik şeridi KOBİ dilinde', () => {
  it('şerit üç kalem taşır', () => {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    expect(container.querySelectorAll('.serit span')).toHaveLength(3);
  });

  it('⚠️ teknik jargon GERİ GELMEZ', () => {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    const serit = container.querySelector('.serit')?.textContent ?? '';

    expect(serit).not.toContain('ŞEMA');
    expect(serit).not.toContain('İZOLASYON');
    expect(serit).not.toContain('SAĞLAYICI KİLİDİ');
  });

  /**
   * ⚠️ ÜÇÜNCÜ KALEMDE UYDURULMUŞ BİR RAKAM YOKTUR. Diğer iki sayı gerçek
   * sayımlardır (on iki modül, on sekiz kaynak); yanlarına "%100" gibi
   * ölçülmemiş bir yüzde koymak ikisini de zayıflatırdı.
   */
  it('⚠️ fayda cümlesi SAHTE bir rakam taşımaz', () => {
    const { container } = render(
      <LandingLayout>
        <LandingPage />
      </LandingLayout>,
    );

    // ⚠️ `?? []` YAZILMAZ: `querySelectorAll` hiçbir zaman `null` dönmez ve
    // lint gereksiz koşulu HATA sayar (`no-unnecessary-condition`).
    const sonuncu = [...container.querySelectorAll('.serit span')].at(-1);

    expect(sonuncu?.textContent).toBe('VERİLERİNİZ YALNIZCA SİZİN');
    expect(sonuncu?.textContent).not.toMatch(/\d|%/u);
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
