import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KobiWiseMark, KobiWiseWordmark } from './brand';

/**
 * Marka bileşeni — ADR-0038 §7.
 *
 * Buradaki iddialar görsel değil SÖZLEŞMESELdir: bir SVG'nin "doğru göründüğü"
 * birim testiyle kanıtlanamaz, ama erişilebilir adının olup olmadığı ve
 * markanın modül rengi alıp almadığı kanıtlanabilir — ve ikisi de sessizce
 * bozulabilecek şeylerdir.
 */
describe('KobiWiseMark', () => {
  it('başlık verilince erişilebilir bir ad taşır', () => {
    render(<KobiWiseMark title="KobiWise" />);
    expect(screen.getByRole('img', { name: 'KobiWise' })).toBeInTheDocument();
  });

  it('başlık verilmeyince ekran okuyucudan gizlenir', () => {
    // Süs olarak kullanıldığı yerde (yanında zaten metin varsa) işaretin
    // ikinci kez okunması gürültüdür.
    const { container } = render(<KobiWiseMark />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('rengini currentColor ile alır — sabit bir renk GÖMMEZ', () => {
    /*
     * ⚠️ Bu testin asıl konusu marka kuralıdır (ADR-0038 §7.1): işaret hiçbir
     * hue'ya sahip değildir ve bulunduğu yerin metin rengini alır. İçine bir
     * hex gömülürse işaret koyu temada kaybolur ya da bir modül odasında
     * yanlış renge çakılır — ve hata SESSİZDİR, ekran çalışmaya devam eder.
     */
    const { container } = render(<KobiWiseMark />);
    const markup = container.innerHTML;

    expect(markup).toContain('currentColor');
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('oranı korunsun diye tek boyutla kullanılabilir', () => {
    const { container } = render(<KobiWiseMark height={20} />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.getAttribute('width')).toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('-2 -2 80 104');
  });
});

describe('KobiWiseWordmark', () => {
  it('markanın adını yazar', () => {
    render(<KobiWiseWordmark />);

    expect(screen.getByText('KobiWise')).toBeInTheDocument();
  });

  it('⚠️ İŞARET İÇERMEZ — ad zaten yazılıyken baş harfi tekrar olurdu', () => {
    /*
     * ============================================================================
     * MARKA SİSTEMİ İKİ VARLIKTIR, İKİSİ YAN YANA KULLANILMAZ
     * ============================================================================
     * Product Owner kuralı (2026-08-17): K işareti YALNIZCA yer olmayan
     * yüzeylerde (favicon, mobil ikon, daraltılmış koridor) ve yazının YERİNE
     * geçer — yanına değil.
     *
     * Bu test bir regresyonu kilitler: biri "logo daha tanınır olsun" diye
     * işareti yazının yanına geri koyarsa ekran ÇALIŞMAYA devam eder ve
     * hiçbir şey kırmızı yanmazdı.
     */
    const { container } = render(<KobiWiseWordmark />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('kalın ve sıkı dizilir — referans kilidin ağırlığı', () => {
    render(<KobiWiseWordmark />);

    expect(screen.getByText('KobiWise')).toHaveClass('font-bold');
  });

  it('takip OPTİKTİR — punto büyüdükçe sıkılaşır', () => {
    /*
     * Sabit bir `letter-spacing` her boyutta yanlıştır: aynı `em` değeri büyük
     * puntoda gevşek, küçük puntoda sıkı görünür. Aynı wordmark iki boyutta
     * aynı takiple dizilirse biri mutlaka yanlış görünür.
     */
    const small = render(<KobiWiseWordmark size={20} />);
    const smallTracking = small.getByText('KobiWise').style.letterSpacing;
    small.unmount();

    const large = render(<KobiWiseWordmark size={48} />);
    const largeTracking = large.getByText('KobiWise').style.letterSpacing;

    expect(parseFloat(largeTracking)).toBeLessThan(parseFloat(smallTracking));
  });

  it('⚠️ tanımlayıcı NOKTASIZ I ile dizilir — `lang="tr"` tuzağı', () => {
    /*
     * Belge `lang="tr"` taşıyor ve CSS `text-transform: uppercase` DİLE
     * DUYARLIDIR: Türkçe kurallarıyla `i` → `İ` olur. Metin `uppercase` sınıfıyla
     * dönüştürülseydi ekranda "BUSİNESS OS" yazardı — tarayıcıda görüldü.
     *
     * Hata sessizdir: İngilizce bilmeyen bir gözden kaçar, marka ise yanlış
     * yazılmış olur.
     */
    render(<KobiWiseWordmark descriptor />);

    const descriptor = screen.getByText('BUSINESS OS');
    expect(descriptor.className).not.toContain('uppercase');
    expect(descriptor.textContent).not.toContain('İ');
  });

  it('"BUSINESS OS" alt satırı YALNIZCA istendiğinde çizilir', () => {
    // Uygulamanın içinde ürünün ne olduğunu anlatmak gereksizdir: kullanıcı
    // zaten kullanıyor. Alt satır giriş/kayıt gibi dış yüzeylere aittir.
    const inside = render(<KobiWiseWordmark />);
    expect(inside.queryByText('BUSINESS OS')).not.toBeInTheDocument();
    inside.unmount();

    const outside = render(<KobiWiseWordmark descriptor />);
    expect(outside.getByText('BUSINESS OS')).toBeInTheDocument();
  });
});
