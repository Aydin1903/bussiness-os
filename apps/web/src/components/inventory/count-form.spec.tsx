import type { CountResult } from '@business-os/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CountForm } from './count-form';

/**
 * FİZİKSEL SAYIM EKRANI — ADR-0039 §3.2'nin ARAYÜZ SINAVI.
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN ASIL İŞİ BİR ŞEYİN YOKLUĞUNU KORUMAKTIR
 * ============================================================================
 * Delta (fark) istemcide HİÇBİR YERDE hesaplanmaz ve gösterilmez. Bu, kapanış
 * denetiminin ayrı bir maddesidir ve buradaki testler onu kilitler.
 *
 * Gerekçe: istemcinin okuduğu miktar ile isteğin sunucuya vardığı an arasında
 * başka bir hareket yazılabilir. Ekranda gösterilen fark ile sunucunun yazdığı
 * düzeltme AYRIŞIR — ve kullanıcı ekrandakine inanır. Hata SESSİZDİR.
 */

const MOVEMENT = {
  id: '018f3a2b-7c4d-7e1f-8a2b-000000000002',
  tenantId: '018f3a2b-7c4d-7e1f-8a2b-0000000000c1',
  itemId: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
  direction: 'out' as const,
  quantity: '3.000',
  isCorrection: true,
  occurredAt: '2026-08-19T10:00:00.000Z',
  note: null,
  createdByUserId: 'u1',
  createdAt: '2026-08-19T10:00:00.000Z',
};

function renderForm(overrides: { result?: CountResult | null; onSubmit?: () => void } = {}) {
  const onSubmit = vi.fn();
  render(
    <CountForm
      itemName="Vida M8"
      unit="adet"
      pending={false}
      error={null}
      result={overrides.result ?? null}
      onSubmit={overrides.onSubmit ?? onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit };
}

describe('CountForm — delta İSTEMCİDE hesaplanmaz (ADR-0039 §3.2)', () => {
  it('⚠️ BİLEŞEN MEVCUT MİKTARI PROP OLARAK ALMAZ', () => {
    // ⚠️ BU TESTİN İŞİ BİR İMZAYI KORUMAKTIR. `currentQuantity` gibi bir prop
    // eklenseydi, ekranda "12 → 9 (−3)" önizlemesi göstermek BİR SATIR KOD
    // olurdu ve o satır sessiz bir yalan üretirdi.
    //
    // Prop listesi çalışma zamanında okunamaz; onun yerine bileşenin
    // kabul ettiği alanlar TİP seviyesinde sabitlenmiştir ve bu test
    // dokümantasyon + niyet kaydıdır: aşağıdaki render, mevcut miktar
    // OLMADAN çalışıyor.
    renderForm();

    expect(screen.getByLabelText(/Sayılan miktar/)).toBeInTheDocument();
  });

  it('kullanıcı SAYDIĞINI gönderir — fark DEĞİL', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    fireEvent.change(screen.getByLabelText(/Sayılan miktar/), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sayımı kaydet' }));

    // ⚠️ Gövdede `delta` YOK: yalnızca mutlak sayım.
    expect(onSubmit).toHaveBeenCalledWith({ countedQuantity: '9', note: '' });
  });

  it('⚠️ SONUÇ GELMEDEN EKRANDA HİÇBİR SONUÇ BLOĞU YOKTUR', () => {
    // Kullanıcı miktarı YAZDIKTAN SONRA bile bir önizleme belirmez: sonuç
    // ancak sunucu cevabıyla gelir.
    //
    // ⚠️ İddia "fark" kelimesinin yokluğu DEĞİL — o kelime açıklama metninde
    // geçiyor ve GEÇMELİ ("farkı değil, saydığınızı yazın"). İddia, sunucudan
    // sonuç dönmeden HİÇBİR sonuç cümlesinin kurulmadığıdır.
    renderForm({ result: null });

    fireEvent.change(screen.getByLabelText(/Sayılan miktar/), { target: { value: '9' } });

    expect(screen.queryByText(/Sayım tuttu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/olarak güncellendi/)).not.toBeInTheDocument();
    expect(screen.queryByText(/düzeltme hareketi yazıldı/)).not.toBeInTheDocument();
  });

  it('metin kullanıcıya FARK DEĞİL SAYIM istendiğini söyler', () => {
    renderForm();

    expect(screen.getByText(/saydığınız/i)).toBeInTheDocument();
    expect(screen.getByText(/farkı.*değil/i)).toBeInTheDocument();
  });
});

describe('CountForm — sonuç YALNIZCA sunucudan', () => {
  it('⚠️ `adjusted: false` bir HATA DEĞİLDİR ve açıkça söylenir', () => {
    // Söylenmezse kullanıcı işlemin başarısız olduğunu sanar ve tekrar tekrar
    // dener. Sayım tuttuysa sunucu hiçbir satır yazmaz (olmamış bir akışı
    // deftere yazmak yalan olurdu).
    renderForm({ result: { adjusted: false, quantity: '12.000', movement: null } });

    expect(screen.getByText(/Sayım tuttu/)).toBeInTheDocument();
    expect(screen.getByText(/bu bir hata değildir/i)).toBeInTheDocument();
  });

  it('düzeltme yazıldıysa SUNUCUNUN dönen miktarı gösterilir', () => {
    renderForm({ result: { adjusted: true, quantity: '9.000', movement: MOVEMENT } });

    // ⚠️ `9.000` sunucudan gelen `result.quantity`dir — istemcinin girdiğinden
    // türetilmedi.
    expect(screen.getByText(/stok 9\.000 adet olarak güncellendi/)).toBeInTheDocument();
    // ⚠️ `3.000` sunucunun YAZDIĞI hareketin miktarıdır; bir önizleme değil,
    // deftere geçmiş bir olgu.
    expect(screen.getByText(/çıkış yönünde 3\.000 adet/)).toBeInTheDocument();
  });

  it('düzeltmenin GERİ ALINAMAZ olduğu söylenir (§3.3)', () => {
    renderForm({ result: { adjusted: true, quantity: '9.000', movement: MOVEMENT } });

    expect(screen.getByText(/geri alınamaz ve düzenlenemez/)).toBeInTheDocument();
  });
});
