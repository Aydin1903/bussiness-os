import type { SalesDocument } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ActorStamp,
  DocumentNumber,
  isEditable,
  Money,
  readOnlyReason,
  StatusPill,
} from './chrome';

/**
 * Teklif / Fatura odasının kendine özgü parçaları (ADR-0041).
 *
 * ⚠️ Bu dosyanın EN ÖNEMLİ testleri BİR ŞEYİN YOKLUĞUNU korur:
 *   1. taslakta belge numarası GÖSTERİLMEZ (§1.6) — sahte bir numara,
 *      verilmemiş bir numarayı verilmiş göstermek olurdu,
 *   2. taslakta AKTÖR DAMGASI gösterilmez (§8.2) — taslak düzenlemeleri
 *      izlenmez ve olmayan bir günlüğü var gibi göstermeyiz.
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

describe('DocumentNumber (§1.6)', () => {
  it('⚠️ TASLAKTA NUMARA GÖSTERMEZ — ne yapılacağını SÖYLER', () => {
    // Boşluk bir EKSİK değil, bir BİLGİDİR: numara belge dışarı çıktığı an
    // üretilir. Sessiz bırakmak, kullanıcının "numara alamadım galiba" diye
    // düşünmesine yol açardı.
    render(<DocumentNumber document={document()} />);

    expect(screen.getByText('Gönderilince numara atanacak')).toBeInTheDocument();
  });

  it('faturada ipucu KESİLİNCE der — tür başına doğru fiil', () => {
    render(<DocumentNumber document={document({ kind: 'invoice' })} />);

    expect(screen.getByText('Kesilince numara atanacak')).toBeInTheDocument();
  });

  it('⚠️ SAHTE BİR NUMARA (önizleme) GÖSTERMEZ', () => {
    const { container } = render(<DocumentNumber document={document()} />);

    // "TKF-" öneki taslakta HİÇ geçmemeli: henüz verilmemiş bir numarayı
    // verilmiş göstermek olurdu.
    expect(container.textContent).not.toContain('TKF-');
  });

  it('gönderilince numarayı olduğu gibi yazar', () => {
    render(<DocumentNumber document={document({ status: 'sent', number: 'TKF-000123' })} />);

    expect(screen.getByText('TKF-000123')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('durumu METİNLE söyler — renk TEK ayırt edici değildir', () => {
    render(<StatusPill status="accepted" />);

    expect(screen.getByText('Kabul edildi')).toBeInTheDocument();
  });

  it('her durumun bir Türkçe karşılığı vardır', () => {
    const { rerender } = render(<StatusPill status="draft" />);
    expect(screen.getByText('Taslak')).toBeInTheDocument();

    rerender(<StatusPill status="issued" />);
    expect(screen.getByText('Kesildi')).toBeInTheDocument();

    rerender(<StatusPill status="cancelled" />);
    expect(screen.getByText('İptal edildi')).toBeInTheDocument();
  });
});

describe('isEditable / readOnlyReason (§2)', () => {
  it('YALNIZCA taslak düzenlenebilir', () => {
    expect(isEditable(document({ status: 'draft' }))).toBe(true);
    expect(isEditable(document({ status: 'sent' }))).toBe(false);
    expect(isEditable(document({ status: 'accepted' }))).toBe(false);
    expect(isEditable(document({ kind: 'invoice', status: 'issued' }))).toBe(false);
  });

  it('⚠️ SEBEBİ SÖYLER ve DOĞRU YOLU gösterir — kullanıcı 409 a çarpmadan önce', () => {
    // "Yanlış bir belge düzeltilmez; doğrusu yeni bir belge olarak yazılır"
    // cümlesi sunucudaki `DocumentNotEditableError`in mesajıyla AYNI şeyi
    // söyler. Ayrışırlarsa kullanıcı iki farklı açıklama duyar.
    expect(readOnlyReason(document({ status: 'sent' }))).toContain('yeni bir teklif');
    expect(readOnlyReason(document({ kind: 'invoice', status: 'issued' }))).toContain(
      'yeni bir fatura',
    );
  });
});

describe('ActorStamp (§8.2)', () => {
  it('⚠️ TASLAKTA HİÇBİR ŞEY GÖSTERMEZ — taslak düzenlemeleri izlenmez', () => {
    const { container } = render(<ActorStamp action="Gönderildi" at={null} userId={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('kim ve ne zaman — ama bir ZAMAN ÇİZELGESİ değil', () => {
    render(
      <ActorStamp
        action="Gönderildi"
        at="2026-08-20T09:00:00.000Z"
        userId="018f3a2b-7c4d-7e1f-9b3c-0000000000b1"
      />,
    );

    // ⚠️ Kullanıcı ADI çözülmez (bugün bir dizin yok) — uydurmak yerine
    // kısaltılmış kimlik yazılır. Sahte bir ad, olmayan bir bilgiyi VAR gibi
    // gösterirdi.
    expect(screen.getByText(/kullanıcı 018f3a2b tarafından gönderildi/)).toBeInTheDocument();
  });
});

describe('Money (§1.4)', () => {
  it('⚠️ PARA BİRİMİNİ HER TUTARIN YANINA yazar — çıplak sayı toplanabilirlik ima ederdi', () => {
    render(<Money amount="7500.00" currency="TRY" />);

    expect(screen.getByText(/7500\.00/)).toBeInTheDocument();
    expect(screen.getByText('TRY')).toBeInTheDocument();
  });

  it('⚠️ BİNLİK AYRACI EKLEMEZ — sunucunun kanonik dizesi olduğu gibi yazılır', () => {
    // Biçimlendirmek `Number`a çevirmek demekti ve para bu projede hiçbir
    // noktada `number` olmuyor (ADR-0034'ten devralınan karar).
    render(<Money amount="1234567.89" currency="USD" />);

    expect(screen.getByText(/1234567\.89/)).toBeInTheDocument();
  });
});
