import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PROVIDER_MARKS } from './provider-marks';

/**
 * ============================================================================
 * ⚠️ MARKA İŞARETLERİ BİZİM TASARIM SİSTEMİMİZE AİT DEĞİLDİR
 * ============================================================================
 * ADR-0052 §6.2: _"Her sağlayıcının kendi marka kılavuzu; bizim tasarım
 * sistemimize uydurulmaz."_ Bu dosyanın koruduğu şey estetik değil **uyum**:
 * bir gün biri işaretleri "tutarlı olsun" diye ODA token'larına (`--accent`,
 * `--ai-accent`) ya da `currentColor`a bağlarsa, o **kılavuz ihlalidir** ve
 * burası kırmızı yanmalıdır.
 *
 * ⚠️ ADR-0053 §9.2'nin sapması (Microsoft ve LinkedIn'in yuvarlak yalnızca-ikon
 * düğmede kullanılması) **kabul edilmiş ve yazılmıştır**; ama sapmanın
 * genişlemesi kabul edilmemiştir — logonun kendisi değiştirilemez.
 * ============================================================================
 */

const KEYS = ['google', 'microsoft', 'linkedin', 'facebook'] as const;

/** İşaretin ürettiği SVG'yi ham metin olarak verir — renkler dahil. */
function markup(key: string): string {
  const mark = PROVIDER_MARKS[key];
  if (mark === undefined) {
    throw new Error(`sozlukte yok: ${key}`);
  }
  const { container } = render(<mark.Icon size={20} />);
  return container.innerHTML;
}

describe('PROVIDER_MARKS — dört sağlayıcı da çizilebilir', () => {
  /**
   * ⚠️ Sözlükte OLMAYAN bir anahtar `social-sign-in.tsx`te sessizce ATLANIR.
   * Yani eksik bir giriş, ekranı bozmaz — **düğmeyi yok eder**. Hata sessiz
   * olduğu için varlığı burada tek tek iddia edilir.
   */
  it.each(KEYS)('`%s` sözlükte VARDIR', (key) => {
    expect(PROVIDER_MARKS[key]).toBeDefined();
  });

  /**
   * ⚠️ ADR-0053 §9.2'nin BİRİNCİ hafifletmesi: yuvarlak ikon düğmede
   * sağlayıcının istediği **eylem ifadesi** görsel olarak yoktur; erişilebilirlik
   * ağacında ve ipucunda VARDIR. ⚠️ Bu bir hafifletmedir, **uyum değildir**.
   */
  it.each(KEYS)('`%s` erişilebilir adı bir EYLEM ifadesi taşır', (key) => {
    expect(PROVIDER_MARKS[key]?.label).toMatch(/ile giriş yap$/u);
  });

  /** Ekran okuyucu işareti değil, düğmenin adını okur. */
  it.each(KEYS)('`%s` işareti `aria-hidden` ve odaklanılamaz', (key) => {
    expect(markup(key)).toContain('aria-hidden="true"');
    expect(markup(key)).toContain('focusable="false"');
  });

  it.each(KEYS)('`%s` verilen boyutta çizilir (en-boy oranı korunur)', (key) => {
    const html = markup(key);
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
  });
});

describe('⚠️ PROVIDER_MARKS — resmi renkler SABİTTİR, temayla değişmez', () => {
  /**
   * ⚠️ EN ÖNEMLİ TEST. `currentColor` ya da bir CSS değişkeni, işareti
   * temaya bağlar — yani koyu temada logo **yeniden renklendirilmiş** olur.
   * Dört sağlayıcının dördü de bunu açıkça yasaklar (Google: _"logonun boyut
   * veya rengini değiştirmeyin"_; LinkedIn: _"modify the color or the shape"_;
   * Meta: _"eksiksiz ve değiştirilmemiş"_).
   */
  it.each(KEYS)('`%s` `currentColor` ya da CSS değişkeni KULLANMAZ', (key) => {
    const html = markup(key);

    expect(html).not.toContain('currentColor');
    expect(html).not.toContain('var(--');
  });

  it('Google dört resmi rengini taşır', () => {
    const html = markup('google');

    for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) {
      expect(html).toContain(color);
    }
  });

  it('Microsoft dört resmi karesini taşır', () => {
    const html = markup('microsoft');

    for (const color of ['#F25022', '#7FBA00', '#00A4EF', '#FFB900']) {
      expect(html).toContain(color);
    }
  });

  /** Kılavuzun tercih ettiği hâl: beyaz zeminde mavi. */
  it('LinkedIn resmi mavisini taşır', () => {
    expect(markup('linkedin')).toContain('#0A66C2');
  });

  /**
   * ⚠️ ÇIPLAK `f` YASAKTIR — Meta'nın kılavuzu logonun _"eksiksiz ve
   * değiştirilmemiş"_ kullanılmasını şart koşar. Bu yüzden işaret **dairesel
   * rozetin tamamıdır**: mavi daire + beyaz `f`, tek parça. Düğmenin kendi
   * kenarlığı dairenin yerini TUTMAZ.
   */
  it('⚠️ Facebook DAİRESEL ROZETİN TAMAMINI çizer — çıplak `f` değil', () => {
    const html = markup('facebook');

    expect(html).toContain('#1877F2');
    expect(html).toContain('<circle');
    expect(html).toContain('#FFFFFF');
  });
});
