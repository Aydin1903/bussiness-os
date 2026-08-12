import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDelete } from './confirm-delete';

/**
 * İki adımlı silme.
 *
 * Test edilen şey görünüm değil, bir GÜVENLİK ÖZELLİĞİDİR: CRM'de silme geri
 * alınamaz ve şirkette cascade'dir (kişiler + görüşmeler, yani AI hafızası).
 * Tek tıkla silen bir düğme, yanlış karta basmayı kalıcı veri kaybına
 * çevirirdi.
 */
describe('ConfirmDelete', () => {
  const QUESTION = '"Kuzey Mimarlık" ve ona bağlı tüm kişiler silinecek.';

  it('ilk tıklama SİLMEZ — yalnızca onayı açar', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete question={QUESTION} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });

  it('onay metni NE silineceğini söyler — "emin misiniz" tek başına bilgi taşımaz', () => {
    render(<ConfirmDelete question={QUESTION} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    // Rol `alert`: ekran okuyucu yıkıcı eylemi duyurur.
    expect(screen.getByRole('alert')).toHaveTextContent(QUESTION);
  });

  it('ikinci tıklama siler', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete question={QUESTION} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('vazgeçince onay kapanır ve silme çağrılmaz', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete question={QUESTION} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sil' })).toBeInTheDocument();
  });

  it('silme sürerken düğmeler kilitlenir — çift gönderim yok', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete question={QUESTION} pending onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    const confirm = screen.getByRole('button', { name: 'Siliniyor…' });
    expect(confirm).toBeDisabled();

    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  /**
   * ==========================================================================
   * TAŞMA — jsdom ÖLÇEMEZ, o yüzden SINIF kilitlenir
   * ==========================================================================
   * Gerçek iddia şudur: onay paneli kartı taşırmaz. jsdom düzen hesaplamaz
   * (`getBoundingClientRect` her yerde sıfır döner), yani taşmanın kendisi
   * burada ölçülemez — ölçüm tarayıcıda yapılır.
   *
   * Test edilebilen doğru şey, taşmayı önleyen İKİ sınıfın yerinde olmasıdır.
   * Değersiz bir test değil: ikisi de "gereksiz görünen" sınıflardır ve bir
   * temizlik turunda silinmeleri çok olası — silindiğinde hata SESSİZDİR,
   * yalnızca dar ekranda düğmeler kırpılır.
   */
  it('⚠️ soru sarabilir (`min-w-0`) ve panel kaba sığar (`max-w-full`)', () => {
    render(<ConfirmDelete question={QUESTION} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    // `min-w-0` olmadan flex öğesinin varsayılan `min-width: auto` değeri
    // cümlenin sarmasını engeller ve satır kabı taşırır.
    expect(screen.getByText(QUESTION).className).toContain('min-w-0');
    expect(screen.getByRole('alert').className).toContain('max-w-full');
  });
});
