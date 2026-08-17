import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MARK_PATHS } from './brand';

/**
 * İŞARETİN ÜÇ KOPYASI AYRIŞAMAZ.
 *
 * ============================================================================
 * NEDEN BU TEST VAR
 * ============================================================================
 * K işaretinin geometrisi üç yerde yaşıyor:
 *
 *   1. `components/brand.tsx › MARK_PATHS`  — uygulama içindeki bileşen
 *   2. `app/icon.svg`                       — tarayıcı sekmesi (favicon)
 *   3. `app/apple-icon.svg`                 — mobil ana ekran ikonu
 *
 * İkinci ve üçüncüsü **statik dosyalardır ve TSX'ten import edemezler**.
 * Next.js bu dosyaları dosya adına göre bulur; bir React bileşeninden
 * üretmenin yolu `next/og` ile çalışma zamanı görsel üretimidir ve yalnızca
 * bir ikon için o bağımlılığı almak orantısız olurdu.
 *
 * Bedeli ikizleşmedir ve hata SESSİZDİR: işaret güncellenip favicon
 * unutulursa uygulama yeni işareti, sekme eski işareti gösterir. Kimse iki
 * yeri yan yana koymaz — bu test onları yan yana koyar.
 */

const ICON_DIR = join(__dirname, '..', 'app');

function read(name: string): string {
  return readFileSync(join(ICON_DIR, name), 'utf8');
}

/**
 * Yorumsuz işaretleme.
 *
 * ⚠️ İlk yazımda bu yoktu ve test kendi kurduğu tuzağa düştü: `icon.svg`'nin
 * yorumu "currentColor bir favicon'da çalışmaz" cümlesini içeriyor, dolayısıyla
 * `not.toContain('currentColor')` iddiası YORUM yüzünden kırmızı yandı.
 *
 * Ders küçük ama gerçek: bir dosyanın DAVRANIŞINI test ederken açıklamalarını
 * değil, yalnızca çalışan kısmını okumak gerekir.
 */
function markup(name: string): string {
  return read(name).replace(/<!--[\s\S]*?-->/g, '');
}

describe('marka varlıkları — işaret geometrisi', () => {
  it('üç yol da tanımlı (test kendini kandırmasın)', () => {
    // Boş bir dizi aşağıdaki `every` kontrollerini SESSİZCE geçerdi.
    expect(MARK_PATHS).toHaveLength(3);
  });

  it.each(['icon.svg', 'apple-icon.svg'])('%s bileşenle AYNI yolları taşır', (file) => {
    const svg = read(file);

    for (const d of MARK_PATHS) {
      expect(svg, `${file} içinde eksik yol: ${d}`).toContain(d);
    }
  });

  it('favicon kendi zeminini taşır — `currentColor` favicon’da çalışmaz', () => {
    /*
     * Sekme çubuğu açık ya da koyu olabilir ve bir favicon sayfanın metin
     * rengini miras almaz. Zemin kaldırılırsa ikon koyu sekmede kaybolur —
     * ekran çalışmaya devam eder, yalnızca sekme boş görünür.
     */
    const svg = markup('icon.svg');

    expect(svg).toContain('<rect');
    expect(svg).not.toContain('currentColor');
  });

  it('mobil ikonun köşesi YUVARLATILMAZ — iOS kendi maskesini uygular', () => {
    // Yuvarlatılırsa ana ekranda iç içe iki yuvarlak köşe görünür.
    const svg = markup('apple-icon.svg');

    expect(svg).toContain('<rect width="180" height="180"');
    expect(svg).not.toMatch(/<rect[^>]*\srx=/);
  });
});
