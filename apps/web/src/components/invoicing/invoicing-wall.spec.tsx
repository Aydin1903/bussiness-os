import type { SalesDocument } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InvoicingWall } from './invoicing-wall';

/**
 * `InvoicingWall` (ADR-0041 §11.2).
 *
 * ⚠️ Bu dosyanın EN ÖNEMLİ testi bir şeyin YOKLUĞUNU korur: KAHRAMAN RAKAM BİR
 * TUTAR DEĞİLDİR. Birisi onu iyi niyetle "toplam teklif tutarı" yaparsa iki
 * seçenek kalır ve ikisi de kötüdür — ya para birimlerini toplayıp SESSİZCE
 * YANLIŞ bir rakam gösterir (kur çevrimi YOK, §1.4), ya da tek bir para
 * birimini seçip diğerlerini GİZLER. Hiçbir başka test kırmızı yanmaz.
 */

function document(overrides: Partial<SalesDocument> = {}): SalesDocument {
  return {
    id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
    tenantId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a1',
    kind: 'quote',
    status: 'draft',
    number: null,
    companyId: null,
    contactId: null,
    customerName: 'Yıldız Ltd.',
    issuedOn: '2026-08-22',
    validUntil: null,
    dueOn: null,
    currency: 'TRY',
    notes: null,
    convertedFromId: null,
    createdByUserId: '018f3a2b-7c4d-7e1f-9b3c-0000000000b1',
    sentAt: null,
    sentByUserId: null,
    decidedAt: null,
    decidedByUserId: null,
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('InvoicingWall', () => {
  it('kahraman rakam SUNUCUDAN gelen TOPLAM SAYIDIR', () => {
    render(<InvoicingWall total={12} items={[document()]} loading={false} />);

    expect(screen.getByText('Satış evrakı')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('⚠️ KAHRAMAN BİR TUTAR DEĞİLDİR — para birimleri TOPLANMAZ (§1.4)', () => {
    const { container } = render(
      <InvoicingWall
        total={2}
        items={[document({ currency: 'TRY' }), document({ id: 'b', currency: 'EUR' })]}
        loading={false}
      />,
    );

    // Duvarda hiçbir para birimi etiketi GEÇMEMELİ: geçseydi bir tutar
    // gösteriliyor demektir ve iki para birimi toplanmış olurdu.
    expect(container.textContent).not.toContain('TRY');
    expect(container.textContent).not.toContain('EUR');
  });

  it('"cevap bekliyor" uydusu GÖNDERİLMİŞ belgeleri sayar (§4.1 ile aynı soru)', () => {
    render(
      <InvoicingWall
        total={3}
        items={[
          document({ status: 'sent' }),
          document({ id: 'b', status: 'sent' }),
          document({ id: 'c', status: 'draft' }),
        ]}
        loading={false}
      />,
    );

    expect(screen.getByText('Cevap bekliyor')).toBeInTheDocument();
    expect(screen.getByText('2 belge cevap bekliyor')).toBeInTheDocument();
  });

  it('⚠️ "faturası kesilmedi" DEMEZ — bu sayfada sayılamayacak bir şeydir', () => {
    // Kabul edilmiş bir teklifin faturalanıp faturalanmadığı FATURALARIN
    // `convertedFromId`inde yazar; teklif listesinde o bilgi YOKTUR. Etiketi
    // "faturası kesilmedi" yapmak, sayamadığımız bir şeyi saymış gibi
    // göstermek olurdu — uydunun kendisini yalan yapardı.
    const { container } = render(
      <InvoicingWall total={1} items={[document({ status: 'accepted' })]} loading={false} />,
    );

    expect(screen.getByText('Kabul edildi')).toBeInTheDocument();
    expect(container.textContent).not.toContain('kesilmedi');
  });

  it('boş odada ne olacağını ANLATIR — kuru bir sıfır değil', () => {
    render(<InvoicingWall total={0} items={[]} loading={false} />);

    expect(screen.getByText(/asistanın gündemine girer/)).toBeInTheDocument();
  });

  it('yüklenirken iskelet gösterir — sayılar ZIPLAMAZ', () => {
    const { container } = render(<InvoicingWall total={0} items={[]} loading />);

    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });
});
