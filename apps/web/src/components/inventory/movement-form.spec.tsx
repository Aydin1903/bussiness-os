import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MovementForm } from './movement-form';

/**
 * HAREKET FORMU — ADR-0039 §11.3'ün ARAYÜZ SINAVI.
 *
 * ⚠️ §11.3'ün uyarısı: _"'düzeltme' ile 'giriş/çıkış' aynı düğmeye bağlanırsa
 * kullanıcı sayım sonucunu bir çıkış olarak yazmaya çalışır ve FARK YERİNE
 * MUTLAK DEĞERİ girer — hata sessiz olur ve stoğu tamamen bozar."_
 *
 * Bu dosya üç şeyi kilitler: iki AYRI buton, POZİTİF miktar, ve formun sayım
 * akışını HİÇ İÇERMEDİĞİ.
 */

function renderForm() {
  const onSubmit = vi.fn();
  render(
    <MovementForm
      itemName="Vida M8"
      unit="adet"
      pending={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit };
}

describe('MovementForm — yön AYRI seçilir (ADR-0039 §11.3)', () => {
  it('⚠️ GİRİŞ ve ÇIKIŞ AYRI İKİ BUTONDUR', () => {
    // Tek düğme + açılır liste olsaydı, seçim varsayılan bir değerde kalabilir
    // ve kullanıcı yanlış yönde hareket yazabilirdi. İki buton, hangisine
    // bastığını ADIYLA söyler.
    renderForm();

    expect(screen.getByRole('button', { name: 'Giriş yaz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çıkış yaz' })).toBeInTheDocument();
  });

  it('Giriş butonu `direction: in` gönderir', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yaz' }));

    expect(onSubmit).toHaveBeenCalledWith({ direction: 'in', quantity: '5', note: '' });
  });

  it('Çıkış butonu `direction: out` ve YİNE POZİTİF miktar gönderir', () => {
    // ⚠️ Çıkışta bile miktar POZİTİFTİR: işaret `direction`dadır. Negatif bir
    // sayı yönle birlikte ÇİFT İŞARET üretir ve toplama sessizce ters çalışır
    // (ADR-0039 §3.1).
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Çıkış yaz' }));

    expect(onSubmit).toHaveBeenCalledWith({ direction: 'out', quantity: '5', note: '' });
  });

  it('ipucu kullanıcıya İŞARET YAZMAMASINI söyler', () => {
    renderForm();

    expect(screen.getByText(/POZİTİF girilir/)).toBeInTheDocument();
  });

  it('⚠️ BU FORMDA SAYIM YOKTUR — ayrı bir akıştır', () => {
    // Sayım burada olsaydı §11.3'ün uyardığı karışma tam olarak gerçekleşirdi:
    // aynı yüzeyde hem "akış" hem "ölçüm" istenirdi.
    renderForm();

    // ⚠️ İddia "sayım" kelimesinin yokluğu DEĞİL: form, negatif stoğun
    // düzeltme yolunun sayım olduğunu SÖYLEMEK zorunda. İddia, sayım
    // GİRDİSİNİN ve BUTONUNUN bu formda bulunmadığıdır.
    expect(screen.queryByLabelText(/Sayılan/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sayımı kaydet/ })).not.toBeInTheDocument();
  });

  it('miktar boşken iki buton da PASİFTİR', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Giriş yaz' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Çıkış yaz' })).toBeDisabled();
  });

  it('negatif stoğun ENGELLENMEDİĞİ önceden söylenir', () => {
    // ADR-0039 §Alternatifler: engellemek işletmeyi yalan söylemeye iterdi.
    // Kullanıcı bunu ÖNCEDEN bilmeli.
    renderForm();

    expect(screen.getByText(/Mevcuttan fazla çıkış yazılabilir/)).toBeInTheDocument();
  });
});
