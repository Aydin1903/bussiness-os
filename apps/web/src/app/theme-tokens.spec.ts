import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * KOYU TEMANIN İKİ TANIMI AYRIŞAMAZ.
 *
 * ============================================================================
 * NEDEN BU TEST VAR
 * ============================================================================
 * `globals.css` koyu temayı İKİ yerde tanımlar ve bu yapısal bir zorunluluktur
 * (dosyanın kendi açıklaması): biri `@media (prefers-color-scheme: dark)`
 * içinde `:root:not([data-theme='light'])`, diğeri `:root[data-theme='dark']`.
 * Üç durumlu tema (sistem · açık · koyu) CSS'te başka türlü kurulamıyor —
 * bir `@media` bloğu ile onun dışındaki bir seçici tek kural gövdesinde
 * birleştirilemez.
 *
 * Bedeli ikizlerin sapmasıdır ve hata SESSİZDİR: biri güncellenip diğeri
 * unutulursa ortaya İKİ AYRI KOYU TEMA çıkar — işletim sisteminden gelen koyu
 * tema ile tema ANAHTARINDAN gelen koyu tema farklı görünür. Ekran çalışır,
 * lint yakalamaz, tip denetimi yakalamaz, hiçbir bileşen testi kırmızı yanmaz.
 *
 * ⚠️ Tema anahtarı geldiğinden beri (ADR-0038 Dilim 1) `[data-theme='dark']`
 * bloğu ölü kod DEĞİL, kullanıcının seçtiği ASIL yoldur. Sapmanın maliyeti
 * bu yüzden arttı.
 *
 * Test, CSS'i kaynak metin olarak okur — derlenmiş çıktıyı değil. Sebebi:
 * sapma kaynakta doğar ve burada yakalanması gerekir; derlenmiş çıktıda iki
 * blok zaten ayrı ayrı doğrudur.
 */

const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8');

/**
 * Bir seçicinin kural gövdesini çıkarır — süslü parantezleri SAYARAK.
 *
 * Basit bir `indexOf('}')` yetmez: gövde ileride iç içe bir kural içerebilir
 * (ör. bir `@supports`) ve tarayıcı gibi saymayan bir ayrıştırıcı gövdeyi
 * erken keserdi. O durumda test, olmayan token'lar yüzünden yanlış yere
 * kırmızı yanar ve sebebi bulmak zor olurdu.
 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `seçici bulunamadı: ${selector}`).toBeGreaterThan(-1);

  const open = css.indexOf('{', start + selector.length);
  expect(open, `açılış parantezi yok: ${selector}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }

  throw new Error(`kapanış parantezi yok: ${selector}`);
}

/** `--token: value;` çiftlerini okur. Yorumlar önce temizlenir. */
function customProperties(body: string): ReadonlyMap<string, string> {
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Map<string, string>();

  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim().replace(/\s+/g, ' '));
    }
  }

  return found;
}

describe('koyu tema token ikizleri', () => {
  const fromSystem = customProperties(ruleBody(CSS, ":root:not([data-theme='light'])"));
  const fromSwitch = customProperties(ruleBody(CSS, ":root[data-theme='dark']"));

  it('ikisi de gerçekten token tanımlıyor (test kendini kandırmasın)', () => {
    // İki boş küme birbirine EŞİTTİR. Bu iddia olmadan, seçici adı değişip
    // ayrıştırıcı hiçbir şey bulamadığında test sessizce yeşil kalırdı.
    expect(fromSystem.size).toBeGreaterThan(15);
    expect(fromSwitch.size).toBeGreaterThan(15);
  });

  it('aynı token kümesini tanımlıyor', () => {
    expect([...fromSwitch.keys()].sort()).toEqual([...fromSystem.keys()].sort());
  });

  it('her token için aynı değeri veriyor', () => {
    for (const [name, value] of fromSystem) {
      expect(fromSwitch.get(name), `${name} iki blokta farklı`).toBe(value);
    }
  });

  it('açık temanın nötr ekseni SOĞUK — logo ile aynı ailede (ADR-0038 §7.2)', () => {
    // Kök blok açık temadır. Sıcak kahve-siyaha (`#1e1811`: R > G > B) geri
    // dönüş, logoyu kirli gösterir ve oda tuvalinin nötr taban koşulunu bozar.
    const light = customProperties(ruleBody(CSS, ':root'));
    const fg = light.get('--fg');
    expect(fg).toBeDefined();

    const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(fg ?? '') ?? [];
    expect(r, `--fg hex değil: ${fg ?? 'tanımsız'}`).toBeDefined();

    // Soğuk = mavi bileşen kırmızıdan KÜÇÜK DEĞİL.
    expect(parseInt(b ?? '0', 16)).toBeGreaterThanOrEqual(parseInt(r ?? '0', 16));
    expect(parseInt(g ?? '0', 16)).toBeGreaterThanOrEqual(parseInt(r ?? '0', 16));
  });
});
