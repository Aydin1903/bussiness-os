import type { CashflowCategoryTotal } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryBars } from './category-bars';

/**
 * Kategori kırılımı çubukları (FRONTEND §4.10).
 *
 * ============================================================================
 * TEST EDİLEN ŞEY: HİÇBİR SATIRIN ELENMEMESİ VE PAYDANIN DOĞRU OLMASI
 * ============================================================================
 * Bu bileşenin görsel çıktısı jsdom'da ölçülemez (düzen hesaplanmaz), ama iki
 * şey ölçülebilir ve ikisi de ADR-0034'ün kararlarıdır:
 *
 * 1. Kırılımdaki HER satır çizilir — "Kategorisiz" ve sıfır tutarlı olanlar
 *    dahil. Elenirse kırılım toplamı özet toplamını tutmaz ve fark SESSİZ olur.
 * 2. Çubuk genişliği GRUBUN İLAN EDİLMİŞ toplamına göre hesaplanır, kategori
 *    toplamına göre değil — kırılım eksikse bu GÖRÜNÜR kalsın diye.
 *
 * Genişlik `style` üzerinden okunabilir, o yüzden ikisi de gerçek iddialardır;
 * sınıf varlığı kontrolü değil.
 */
/**
 * ⚠️ Her satır AYRI bir `categoryId` alır ve bu fikstürün keyfi bir detayı
 * değil, sunucunun garantisidir: kırılım `(currency, categoryId, name,
 * direction)` üzerinden gruplanır, yani bir para biriminde aynı `(direction,
 * categoryId)` iki kez GELMEZ. Bileşenin React anahtarı tam olarak bu çifti
 * kullanıyor; fikstür id'yi tekrarlarsa gerçekte olamayacak bir çakışma
 * uydurup React'i uyarıya sokar.
 */
let seq = 0;

function row(over: Partial<CashflowCategoryTotal> = {}): CashflowCategoryTotal {
  seq += 1;
  return {
    categoryId: `019ff1ee-1835-7d3c-8fa1-f21c0700000${String(seq)}`,
    categoryName: 'Danışmanlık',
    direction: 'income',
    total: '100.00',
    ...over,
  };
}

/** Çubuk `aria-hidden` olduğu için rol ile değil, yapı ile bulunur. */
function barWidths(): string[] {
  return [...document.querySelectorAll('li span[aria-hidden] > span')].map((el) =>
    el instanceof HTMLElement ? el.style.width : '',
  );
}

describe('CategoryBars — hiçbir satır ELENMEZ', () => {
  it('⚠️ "Kategorisiz" satırı çizilir ve adıyla yazılır (ADR-0034 §3d)', () => {
    // Elenirse kırılım toplamı para birimi toplamını tutmaz ve fark sessiz olur.
    render(
      <CategoryBars
        categories={[
          row({ total: '80.00' }),
          row({ categoryId: null, categoryName: null, total: '20.00' }),
        ]}
        income="100.00"
        expense="0.00"
      />,
    );

    expect(screen.getByText('Kategorisiz')).toBeInTheDocument();
    expect(screen.getByText('Danışmanlık')).toBeInTheDocument();
  });

  it('⚠️ SIFIR tutarlı satır çizilir ama çubuğu boş kalır', () => {
    // Satırı gizlemek toplamı bozardı; çubuğa sliver vermek ise sıfırı sıfır
    // olmayan gibi gösterirdi. İkisi ayrı karar.
    render(
      <CategoryBars
        categories={[row({ total: '100.00' }), row({ categoryName: 'Bağış', total: '0.00' })]}
        income="100.00"
        expense="0.00"
      />,
    );

    expect(screen.getByText('Bağış')).toBeInTheDocument();
    expect(barWidths()).toEqual(['100%', '0%']);
  });

  it('gelir ve gider AYRI gruplanır, başlıkları yazıyla ayrışır', () => {
    // Renk tek ayırt edici olamaz (FRONTEND §4.8) — ayrımı başlık taşır.
    render(
      <CategoryBars
        categories={[
          row({ total: '100.00' }),
          row({ categoryName: 'Kira', direction: 'expense', total: '40.00' }),
        ]}
        income="100.00"
        expense="40.00"
      />,
    );

    expect(screen.getByText('Gelir')).toBeInTheDocument();
    expect(screen.getByText('Gider')).toBeInTheDocument();
  });

  it('boş grup BAŞLIĞIYLA çizilmez — yarım kalmış bölüm görünmez', () => {
    render(<CategoryBars categories={[row({ total: '100.00' })]} income="100.00" expense="0.00" />);

    expect(screen.getByText('Gelir')).toBeInTheDocument();
    expect(screen.queryByText('Gider')).not.toBeInTheDocument();
  });

  it('kırılım tamamen boşsa hiç çizilmez', () => {
    const { container } = render(<CategoryBars categories={[]} income="0.00" expense="0.00" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('CategoryBars — payda GRUBUN İLAN EDİLMİŞ toplamıdır', () => {
  it('tek kategori tam dolu çubuk verir — "tek dilim" garipliği yok', () => {
    render(<CategoryBars categories={[row({ total: '250.00' })]} income="250.00" expense="0.00" />);

    expect(barWidths()).toEqual(['100%']);
  });

  it('paylar ilan edilen toplama göre hesaplanır', () => {
    render(
      <CategoryBars
        categories={[
          row({ total: '200.00' }),
          row({ categoryId: null, categoryName: null, total: '50.00' }),
        ]}
        income="250.00"
        expense="0.00"
      />,
    );

    expect(barWidths()).toEqual(['80%', '20%']);
  });

  it('⚠️ kırılım EKSİKSE çubuklar %100e VARMAZ — sessizce yeniden ölçeklenmez', () => {
    // Kategori toplamına bölmek kusursuz görünen bir grafik üretirdi ve eksiği
    // saklardı. ADR-0034 §3d "Kategorisiz"i tam olarak toplam tutsun diye
    // tutuyor; bu payda o garantiyi GÖRÜNÜR kılar.
    render(<CategoryBars categories={[row({ total: '60.00' })]} income="100.00" expense="0.00" />);

    expect(barWidths()).toEqual(['60%']);
  });

  it('her grup KENDİ içinde normalize — gelir ile gider aynı ölçeğe konmaz', () => {
    // Ortak ölçek, ADR-0034 §5.1'in "toplanmıyor" ilkesinin görsel karşılığını
    // bozardı: iki grup birbirinin payı değildir.
    render(
      <CategoryBars
        categories={[
          row({ total: '1000.00' }),
          row({ categoryName: 'Kira', direction: 'expense', total: '50.00' }),
        ]}
        income="1000.00"
        expense="50.00"
      />,
    );

    // İkisi de kendi grubunun tamamı olduğu için ikisi de %100.
    expect(barWidths()).toEqual(['100%', '100%']);
  });

  it('ilan edilen toplam kullanılamazsa kategori toplamına düşer', () => {
    // Alternatif hiç çubuk çizmemekti; satırlar yine görünmek zorunda.
    render(
      <CategoryBars
        categories={[row({ total: '30.00' }), row({ categoryName: 'Diğer', total: '10.00' })]}
        income="0.00"
        expense="0.00"
      />,
    );

    expect(barWidths()).toEqual(['75%', '25%']);
  });

  it('bozuk tutar çubuğu sıfırlar, satırı DÜŞÜRMEZ', () => {
    render(
      <CategoryBars
        categories={[row({ categoryName: 'Bozuk', total: 'yok' })]}
        income="100.00"
        expense="0.00"
      />,
    );

    expect(screen.getByText('Bozuk')).toBeInTheDocument();
    expect(barWidths()).toEqual(['0%']);
  });

  it('ilan edilenden BÜYÜK kategori %100de kırpılır — taşma yok', () => {
    render(<CategoryBars categories={[row({ total: '500.00' })]} income="100.00" expense="0.00" />);

    expect(barWidths()).toEqual(['100%']);
  });
});

describe('CategoryBars — para KANONİK dize olarak yazılır', () => {
  it('sunucunun dizesi olduğu gibi görünür, yerel biçimlendirme YOK', () => {
    // `Number()` bu bileşende YALNIZCA genişlik için kullanılır; parse edilen
    // değer ekrana hiç yazılmaz (`marks.tsx`'in kuralı).
    render(
      <CategoryBars categories={[row({ total: '1500.50' })]} income="1500.50" expense="0.00" />,
    );

    expect(screen.getByText(/1500\.50/)).toBeInTheDocument();
    // Binlik ayracı EKLENMEZ — bilinen ve kabul edilmiş sınır.
    expect(screen.queryByText(/1\.500,50/)).not.toBeInTheDocument();
  });
});
