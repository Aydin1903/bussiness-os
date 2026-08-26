import type { Campaign } from '@business-os/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateRange, GapMark, StatusBadge } from './chrome';

/**
 * Kampanya odasının gösterim kuralları (ADR-0047 §9).
 *
 * ⚠️ İki davranış burada KİLİTLENİR ve ikisi de ADR'nin kararının doğrudan
 * arayüz karşılığıdır:
 *   1. BOŞLUK GÖSTERGESİ — `campaign-gap` katkıcısının gördüğü kümeyi gösterir
 *   2. `null` bitiş "süresiz"dir, EKSİK VERİ DEĞİL
 */

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: '01994800-0000-7000-8000-000000000001',
    tenantId: '01994800-0000-7000-8000-000000000002',
    name: 'Sonbahar indirimi',
    channel: 'Instagram',
    startsOn: '2026-08-01',
    endsOn: '2026-08-15',
    status: 'done',
    resultNote: null,
    crmCompanyId: null,
    companyName: null,
    createdByUserId: '01994800-0000-7000-8000-000000000003',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    // ⚠️ SUNUCUDAN gelen türetilmiş bayrak — ekran onu HESAPLAMAZ.
    resultGap: true,
    ...overrides,
  };
}

describe('GapMark', () => {
  it('boşluk varsa GÖRÜNÜR ve sınırı AÇIKÇA söyler', () => {
    render(<GapMark campaign={campaign()} />);

    expect(screen.getByText('Sonucu yazılmadı')).toBeInTheDocument();
    // ⚠️ Modülün kendi sınırı: bu kayıt asistanın aramasına GİRMEZ.
    expect(screen.getByTitle(/asistanın aramasına girmez/)).toBeInTheDocument();
  });

  it('boşluk yoksa HİÇ RENDER EDİLMEZ', () => {
    const { container } = render(<GapMark campaign={campaign({ resultGap: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('⚠️ YALNIZCA sunucunun bayrağına bakar — kendi hesabını YAPMAZ', () => {
    // ⚠️ BU TEST TEK KAYNAK KARARINI KİLİTLER. Alanlar "boşluk" gibi görünüyor
    // (`done` + `resultNote: null`) ama sunucu `resultGap: false` demiş.
    // Ekran KENDİ hesabını yapsaydı rozeti gösterirdi; yapmıyor.
    //
    // Tanım tek yerdedir: sunucudaki `resultGapExpression` — `campaign-gap`
    // katkıcısı ve duvarın `missingResultCount`u ile AYNI ifade.
    const { container } = render(
      <GapMark campaign={campaign({ status: 'done', resultNote: null, resultGap: false })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('⚠️ tersi de doğru: alanlar "boşluk değil" derken bile bayrak KAZANIR', () => {
    render(<GapMark campaign={campaign({ status: 'draft', resultGap: true })} />);

    expect(screen.getByText('Sonucu yazılmadı')).toBeInTheDocument();
  });
});

describe('DateRange', () => {
  it('⚠️ `null` bitiş "süresiz" yazar — boş ya da tire DEĞİL', () => {
    // Boş bırakmak kullanıcıya "tarih girilmemiş" dedirtirdi; süresiz bir
    // kampanya GERÇEK BİR DURUMDUR (§1.5).
    render(<DateRange startsOn="2026-08-01" endsOn={null} />);

    expect(screen.getByText('süresiz')).toBeInTheDocument();
  });

  it('⚠️ gün SAAT DİLİMİ ÇEVRİMİNE UĞRAMAZ', () => {
    // `new Date('2026-08-01')` UTC gece yarısıdır; negatif ofsetli bir saat
    // diliminde `toLocaleDateString` 31 Temmuz basardı. Kampanyanın saati
    // olmadığı için çevrilecek bir şey de yoktur.
    render(<DateRange startsOn="2026-08-01" endsOn="2026-08-15" />);

    expect(screen.getByText(/01\.08\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/15\.08\.2026/)).toBeInTheDocument();
  });
});

describe('StatusBadge — ⚠️ durum bir ETİKETTİR, bir kilit değil', () => {
  it('her durum METİN taşır — renk TEK ayırt edici değildir', () => {
    const { rerender } = render(<StatusBadge value="draft" />);
    expect(screen.getByText('Taslak')).toBeInTheDocument();

    rerender(<StatusBadge value="active" />);
    expect(screen.getByText('Yayında')).toBeInTheDocument();

    rerender(<StatusBadge value="done" />);
    expect(screen.getByText('Bitti')).toBeInTheDocument();
  });

  it('⚠️ `done` rozeti bir KİLİT İŞARETİ TAŞIMAZ', () => {
    // Teklif/Fatura'da gönderilmiş belge kilitlidir; burada değildir ve
    // ikisi karıştırılmamalıdır (§2.2).
    render(<StatusBadge value="done" />);

    expect(screen.queryByText(/kilit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/düzenlenemez/i)).not.toBeInTheDocument();
  });
});
