import type { Supplier } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuppliersWall } from './suppliers-wall';

/**
 * `SuppliersWall` (ADR-0040 §8.2).
 *
 * ⚠️ Bu dosyanın EN ÖNEMLİ testi bir şeyin YOKLUĞUNU korur: "durgun
 * tedarikçi" bir uydu DEĞİLDİR ve olmamalıdır (§3.2). Birisi onu iyi niyetle
 * eklerse, sunucuda REDDEDİLEN yapısal katkıcıyı arayüzden geri getirmiş olur
 * ve hiçbir başka test kırmızı yanmaz.
 */

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
    tenantId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a1',
    name: 'Yıldız Civata',
    taxNumber: '1234567890',
    category: 'hammadde',
    email: null,
    phone: null,
    website: null,
    address: null,
    paymentTerms: '60 gün vadeli',
    createdByUserId: '018f3a2b-7c4d-7e1f-9b3c-0000000000b1',
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    ...overrides,
  };
}

describe('SuppliersWall', () => {
  it('kahraman rakam TOPLAM TEDARİKÇİ SAYISIDIR', () => {
    render(<SuppliersWall total={12} items={[supplier()]} loading={false} />);

    expect(screen.getByText('Tedarikçi')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('⚠️ "DURGUN TEDARİKÇİ" DİYE BİR UYDU YOKTUR — §3.2 ile çelişirdi', () => {
    // ADR §3.2 "durgun tedarikçi"yi bir YAPISAL KATKICI adayı olarak
    // değerlendirip REDDETTİ: durgunluk bu modülde HABER DEĞİLDİR. Yılda bir
    // kez çalışılan bir tedarikçi 364 gün "durgun" görünür.
    //
    // ⚠️ Duvara koymak, AI'a "bu haber değil" derken kullanıcıya "bu haber"
    // demek olurdu. Bu satır o çelişkiyi kilitler.
    render(<SuppliersWall total={3} items={[supplier()]} loading={false} />);

    expect(screen.queryByText(/durgun/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/görüşülmedi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gündür/i)).not.toBeInTheDocument();
  });

  it('⚠️ BİR RİSK / ALARM RAKAMI DA YOKTUR', () => {
    // Tedarikçinin türetilebilir bir DURUMU yoktur (§2.1, §3.2). Stok'un
    // "eşik altı" kahramanının buradaki karşılığı YOK — ve olmaması bir
    // eksiklik değil, modülün tanımı.
    render(<SuppliersWall total={3} items={[supplier()]} loading={false} />);

    expect(screen.queryByText(/risk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gecik/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vade/i)).not.toBeInTheDocument();
  });

  it('vergi numarası olmayan kayıtları SAYAR — mükerrer kayıt kapısı (§1.1)', () => {
    render(
      <SuppliersWall
        total={2}
        items={[supplier({ taxNumber: null }), supplier({ id: 'b', taxNumber: '999' })]}
        loading={false}
      />,
    );

    expect(screen.getByText('Vergi no yok')).toBeInTheDocument();
    expect(screen.getByText('1 kayıtta vergi no yok')).toBeInTheDocument();
  });

  it('vergi numarası tamsa bunu SÖYLER', () => {
    render(<SuppliersWall total={1} items={[supplier()]} loading={false} />);

    expect(screen.getByText(/vergi numarası tam/)).toBeInTheDocument();
  });

  it('boş durumda ne yapılacağını anlatır', () => {
    render(<SuppliersWall total={0} items={[]} loading={false} />);

    // ⚠️ `getByText('0')` KULLANILMAZ: kahraman da uydular da 0 gösterir ve
    // sorgu "found multiple" ile patlar. Boş durumun asıl iddiası rakam değil,
    // kullanıcıya NE YAPACAĞININ söylenmesidir.
    expect(screen.getByText(/Henüz tedarikçi yok/)).toBeInTheDocument();
    expect(screen.getByText(/kurumsal hafızasına girer/)).toBeInTheDocument();
  });

  it('yüklenirken iskelet gösterir — sayı UYDURMAZ', () => {
    render(<SuppliersWall total={0} items={[]} loading={true} />);

    expect(screen.queryByText('Tedarikçi')).not.toBeInTheDocument();
  });
});
