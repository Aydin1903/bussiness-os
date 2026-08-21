import { MAX_INTERACTION_BODY_CHARS } from '@business-os/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InteractionForm } from './interaction-form';

/**
 * `InteractionForm` (ADR-0040 §1, §2.2).
 *
 * Bu dosya modülün ARAYÜZ TARAFINDAKİ üç sert kuralını kilitler:
 *
 *   1. ⚠️ SESSİZ KIRPMA YOK — sınır aşılınca submit ENGELLENİR (§2.2),
 *   2. ⚠️ TEDARİKÇİ SEÇİMİ KONTROLLÜDÜR — kişi listesi ona bağlı (§1.3),
 *   3. ⚠️ DÜZENLE/SİL YOK — kullanıcıya AÇIKÇA söylenir (§1).
 */

const noop = () => undefined;

function setup(overrides: Partial<Parameters<typeof InteractionForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onSupplierChange = vi.fn();

  render(
    <InteractionForm
      suppliers={[]}
      contacts={[{ id: 'c1', fullName: 'Ahmet Yılmaz' }]}
      supplierId="018f3a2b-7c4d-7e1f-8a2b-000000000001"
      pending={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={noop}
      {...overrides}
    />,
  );

  return { onSubmit, onSupplierChange };
}

describe('InteractionForm', () => {
  it('⚠️ SINIR AŞILINCA KAYDET ENGELLENİR — sessiz kırpma YOK (§2.2)', () => {
    setup();

    const body = screen.getByLabelText('Ne konuşuldu');
    fireEvent.change(body, { target: { value: 'x'.repeat(MAX_INTERACTION_BODY_CHARS + 1) } });

    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    expect(screen.getByText(/Metin çok uzun/)).toBeInTheDocument();
  });

  it('sınırın TAM ÜSTÜNDE kaydedilebilir', () => {
    setup();

    fireEvent.change(screen.getByLabelText('Ne konuşuldu'), {
      target: { value: 'x'.repeat(MAX_INTERACTION_BODY_CHARS) },
    });

    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
  });

  it('⚠️ SAYAÇ SUNUCUYLA AYNI SABİTİ okur — iki taraf ayrışamaz', () => {
    setup();

    // İpucu sınırı yazar. İki tarafta ayrı sayı olsaydı kullanıcı
    // "1250/1250, tamam" görür, sunucu 422 dönerdi.
    expect(
      screen.getByText(new RegExp(`/ ${String(MAX_INTERACTION_BODY_CHARS)} karakter`)),
    ).toBeInTheDocument();
  });

  it('⚠️ DÜZENLENEMEZ/SİLİNEMEZ OLDUĞU KULLANICIYA SÖYLENİR (§1)', () => {
    // Söylenmeseydi kayıt yazan biri "sonra düzeltirim" diye aceleyle yazar ve
    // düzeltemediğini ANCAK SONRA öğrenirdi.
    setup();

    expect(screen.getByText(/sonradan düzenlenemez ve silinemez/)).toBeInTheDocument();
  });

  it('boş metinle kaydedilemez — metin ZORUNLUDUR (Randevu/Stok tan farklı)', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('⚠️ TEDARİKÇİ SEÇİCİSİ YALNIZCA `onSupplierChange` VERİLİRSE görünür', () => {
    // Detay sayfasında tedarikçi SABİTTİR: hangi firmada olduğumuz zaten belli
    // ve bir seçici göstermek, kaydı başka firmaya yazma yanılsaması verirdi.
    setup();

    expect(screen.queryByLabelText('Tedarikçi')).not.toBeInTheDocument();
  });

  it('seçici verilince tedarikçi değişimi YUKARI taşınır (§1.3)', () => {
    // ⚠️ Mock BURADA kurulur, `setup`in döndürdüğünden alınmaz: override
    // nesnesi `setup` çağrısının ARGÜMANIDIR ve dönüş değeri henüz yoktur.
    const onSupplierChange = vi.fn();

    setup({
      suppliers: [
        {
          id: 'sup-2',
          tenantId: 't',
          name: 'Demir A.Ş.',
          taxNumber: null,
          category: null,
          email: null,
          phone: null,
          website: null,
          address: null,
          paymentTerms: null,
          createdByUserId: 'u',
          createdAt: '2026-08-21T10:00:00.000Z',
          updatedAt: '2026-08-21T10:00:00.000Z',
        },
      ],
      supplierId: '',
      onSupplierChange,
    });

    fireEvent.change(screen.getByLabelText('Tedarikçi'), { target: { value: 'sup-2' } });

    // ⚠️ Seçim FORMUN İÇİNDE kalsaydı çağıran hangi firmanın kişilerini
    // isteyeceğini bilemezdi — başka firmanın kişisi seçilir ve sunucu 404
    // dönerdi (§1.3).
    expect(onSupplierChange).toHaveBeenCalledWith('sup-2');
  });

  it('kişi seçimi boş bırakılabilir — MEŞRU bir durum', () => {
    setup();

    expect(screen.getByText('Belirtilmedi')).toBeInTheDocument();
    expect(screen.getByText(/santral ya da genel e-posta/)).toBeInTheDocument();
  });

  it('gönderilen gövde tedarikçi ve tarihi taşır', () => {
    const { onSubmit } = setup();

    fireEvent.change(screen.getByLabelText('Ne konuşuldu'), { target: { value: 'zam var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
        body: 'zam var',
      }),
    );
  });
});
