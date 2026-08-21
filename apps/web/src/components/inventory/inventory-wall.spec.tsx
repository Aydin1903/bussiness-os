import type { StockItemRow } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InventoryWall } from './inventory-wall';

/**
 * STOK ODASININ DUVARI — ADR-0038 §6.5 + ADR-0039 §4.1'in sınavı.
 *
 * ⚠️ EN ÖNEMLİ İDDİA BİR ŞEYİN YOKLUĞUDUR: kahraman rakam "toplam stok"
 * DEĞİLDİR. Miktarlar birimleri yüzünden toplanamaz (3 kg un + 12 adet vida
 * diye bir sayı yoktur) ve duvar hiçbir yerde iki kalemin miktarını toplamaz.
 */

function item(overrides: Partial<StockItemRow> = {}): StockItemRow {
  return {
    id: crypto.randomUUID(),
    tenantId: '018f3a2b-7c4d-7e1f-8a2b-0000000000c1',
    name: 'Vida M8',
    sku: 'VDA-M8',
    unit: 'adet',
    minQuantity: '20.000',
    quantity: '50.000',
    note: null,
    archivedAt: null,
    createdByUserId: 'u1',
    createdAt: '2026-08-19T10:00:00.000Z',
    updatedAt: '2026-08-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('InventoryWall — kahraman rakam EŞİK ALTI SAYISIDIR (ADR-0039 §4.1)', () => {
  it('eşik altındaki KALEM SAYISINI gösterir, miktar toplamını DEĞİL', () => {
    const items = [
      item({ quantity: '5.000', minQuantity: '20.000' }), // kritik
      item({ quantity: '3.000', minQuantity: '10.000' }), // kritik
      item({ quantity: '99.000', minQuantity: '10.000' }), // sağlıklı
    ];

    render(<InventoryWall total={3} items={items} loading={false} />);

    expect(screen.getByText('Eşik altında')).toBeInTheDocument();
    // ⚠️ `2` = KALEM SAYISI. Miktar toplamı olsaydı 107 olurdu — ve o sayı
    // anlamsızdı çünkü birimler farklı olabilir.
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('⚠️ NEGATİF miktar EŞİKSİZ de olsa kritiktir', () => {
    // Negatif stok fiziksel olarak imkansızdır: kaydın kendisi tutarsızdır
    // (ADR-0039 §6.1).
    render(
      <InventoryWall
        total={2}
        items={[
          item({ quantity: '-3.000', minQuantity: null }),
          item({ quantity: '99.000', minQuantity: null }),
        ]}
        loading={false}
      />,
    );

    // ⚠️ Kahraman `1` = negatif olan TEK kalem. `total` bilerek 2 verildi ki
    // iddia uydu sayacıyla karışmasın.
    expect(screen.getByText('Eşik altında').parentElement).toHaveTextContent('1');
  });

  it('⚠️ MİKTARLAR HİÇBİR YERDE TOPLANMAZ — farklı birimler yan yana', () => {
    const items = [
      item({ unit: 'kg', quantity: '3.000', minQuantity: null }),
      item({ unit: 'adet', quantity: '12.000', minQuantity: null }),
    ];

    render(<InventoryWall total={2} items={items} loading={false} />);

    // 3 + 12 = 15 diye bir sayı EKRANDA OLMAMALI: "toplam stok" yoktur.
    expect(screen.queryByText('15')).not.toBeInTheDocument();
    expect(screen.queryByText('15.000')).not.toBeInTheDocument();
  });

  it('"eşiksiz" kalemler VURGULANMAZ — bilinçli bir durum, uyarı değil', () => {
    render(<InventoryWall total={1} items={[item({ minQuantity: null })]} loading={false} />);

    // Etiket görünür ama bir alarm dili kullanılmaz.
    expect(screen.getByText('Eşiksiz')).toBeInTheDocument();
  });

  it('boş envanterde kullanıcıya miktarın TÜRETİLDİĞİ söylenir', () => {
    render(<InventoryWall total={0} items={[]} loading={false} />);

    expect(screen.getByText(/hareketlerden hesaplanır/)).toBeInTheDocument();
  });

  it('yükleniyorken iskelet gösterir — sayı ZIPLAMASIN', () => {
    const { container } = render(<InventoryWall total={0} items={[]} loading />);

    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
  });
});
