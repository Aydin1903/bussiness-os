import { MAX_SERVICE_NOTE_CHARS } from '@business-os/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppointmentForm } from './appointment-form';

/**
 * `AppointmentForm` — canlı karakter sayacı ve submit engeli (ADR-0035 §3d).
 *
 * ⚠️ TESTLERİN AĞIRLIK MERKEZİ TEK BİR ÜRÜN İDDİASIDIR:
 * **kullanıcı 422'yi HİÇ görmemeli.** Sunucu sınırı zaten zorluyor (o bir
 * güvenlik ağı); buradaki iş, kullanıcının o duvara HİÇ çarpmamasıdır.
 */

function renderForm(overrides: { onSubmit?: () => void } = {}) {
  const onSubmit = vi.fn();
  render(
    <AppointmentForm
      initial={null}
      onSubmit={overrides.onSubmit ?? onSubmit}
      onCancel={() => undefined}
      pending={false}
      error={null}
    />,
  );
  return { onSubmit };
}

function noteField(): HTMLTextAreaElement {
  const field = screen.getByLabelText('Servis notu');
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new TypeError('Servis notu alanı bir textarea olmalı.');
  }
  return field;
}

function saveButton(): HTMLButtonElement {
  const button = screen.getByRole('button', { name: 'Kaydet' });
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError('Kaydet bir button olmalı.');
  }
  return button;
}

describe('AppointmentForm — karakter sayacı', () => {
  it('sayaç SINIRI `contracts`tan okur — formda sayı YAZILMAZ', () => {
    // ⚠️ Sınır iki tarafta ayrı yazılsaydı sessizce ayrışırdı: kullanıcı
    // formda "tamam" görür, sunucu 422 döner ve nedenini anlayamazdı.
    renderForm();

    expect(screen.getByText(new RegExp(`0 / ${String(MAX_SERVICE_NOTE_CHARS)}`))).toBeTruthy();
  });

  it('yazdıkça sayaç GÜNCELLENİR', () => {
    renderForm();

    fireEvent.change(noteField(), { target: { value: 'Dis temizligi' } });

    expect(screen.getByText(new RegExp(`13 / ${String(MAX_SERVICE_NOTE_CHARS)}`))).toBeTruthy();
  });

  it('⚠️ SINIRA YAKLAŞINCA uyarı belirir', () => {
    // Son %10'a girildiğinde kullanıcı UYARILIR — duvara çarpmadan önce.
    renderForm();

    fireEvent.change(noteField(), {
      target: { value: 'a'.repeat(Math.ceil(MAX_SERVICE_NOTE_CHARS * 0.95)) },
    });

    expect(screen.getByText(/sınıra yaklaşıyorsunuz/)).toBeTruthy();
  });

  it('sınırın UZAĞINDA uyarı YOKTUR — gereksiz gürültü olurdu', () => {
    renderForm();

    fireEvent.change(noteField(), { target: { value: 'kısa not' } });

    expect(screen.queryByText(/sınıra yaklaşıyorsunuz/)).toBeNull();
  });
});

describe('⚠️ AppointmentForm — SINIRI AŞAN METİN SUBMIT EDİLEMEZ', () => {
  it('sınır aşılınca KAYDET devre dışı kalır', () => {
    // ⚠️ KABUL ÖLÇÜTÜ. Düğme açık kalsaydı istek gider ve kullanıcı 422 görürdü
    // — form onu ZATEN engelleyebiliyorken.
    renderForm();

    fireEvent.change(noteField(), {
      target: { value: 'a'.repeat(MAX_SERVICE_NOTE_CHARS + 1) },
    });

    expect(saveButton().disabled).toBe(true);
  });

  it('sınır aşılınca AÇIK bir hata metni gösterilir', () => {
    // Renk TEK bilgi taşıyıcısı değildir: sayının yanında ne yapılacağını
    // söyleyen bir cümle de vardır.
    renderForm();

    fireEvent.change(noteField(), {
      target: { value: 'a'.repeat(MAX_SERVICE_NOTE_CHARS + 1) },
    });

    expect(screen.getByText(/Not çok uzun/)).toBeTruthy();
  });

  it('sınırın TAM ÜZERİNDEKİ metin KABUL edilir', () => {
    // Sınır DAHİLDİR; "en fazla N karakter" cümlesi N'i içerir ve sunucu da
    // öyle davranır. Bir karakter erken kesmek, iki tarafı ayrıştırırdı.
    renderForm();

    fireEvent.change(noteField(), {
      target: { value: 'a'.repeat(MAX_SERVICE_NOTE_CHARS) },
    });

    expect(saveButton().disabled).toBe(false);
  });

  it('sınır aşılıp DÜZELTİLİNCE düğme geri açılır', () => {
    renderForm();

    fireEvent.change(noteField(), {
      target: { value: 'a'.repeat(MAX_SERVICE_NOTE_CHARS + 50) },
    });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(noteField(), { target: { value: 'kısaltıldı' } });
    expect(saveButton().disabled).toBe(false);
  });

  it('GEÇERSİZ süre de submit i engeller', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Süre (dakika)'), { target: { value: '0' } });

    expect(saveButton().disabled).toBe(true);
  });

  it('geçerli girdiyle onSubmit ÇAĞRILIR', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(noteField(), { target: { value: 'Dis temizligi' } });
    fireEvent.click(saveButton());

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ serviceNote: 'Dis temizligi', durationMinutes: 30 }),
    );
  });
});
