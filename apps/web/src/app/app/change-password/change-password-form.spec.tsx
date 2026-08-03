import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/problem';
import { ChangePasswordForm } from './change-password-form';

/**
 * Form davranışı — validasyon, başarı ve hata state'leri.
 *
 * `changePassword` MOCK'lanır: burada test edilen API sözleşmesi değil, formun
 * kullanıcıya ne gösterdiğidir (API katmanının kendi testleri `client.spec.ts`).
 */
const changePassword = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/auth', () => ({ changePassword }));

const CURRENT = 'eskiparola1';
const NEW = 'yeniparola9';

/** Backend'in RFC 7807 gövdesini taklit eder (`toApiError`'ın ürettiği biçim). */
function apiError(status: number, title: string, detail?: string): ApiError {
  return new ApiError(
    status,
    { type: 'https://api.businessos.com/errors/test', title, status, detail },
    title,
  );
}

function fill(values: { current?: string; next?: string; confirmation?: string }): void {
  if (values.current !== undefined) {
    fireEvent.change(screen.getByLabelText('Mevcut parola'), {
      target: { value: values.current },
    });
  }
  if (values.next !== undefined) {
    fireEvent.change(screen.getByLabelText('Yeni parola'), { target: { value: values.next } });
  }
  if (values.confirmation !== undefined) {
    fireEvent.change(screen.getByLabelText('Yeni parola (tekrar)'), {
      target: { value: values.confirmation },
    });
  }
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Parolayı değiştir' }));
}

beforeEach(() => {
  changePassword.mockReset();
  changePassword.mockResolvedValue({ message: 'Parola degistirildi.' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChangePasswordForm — istemci validasyonu', () => {
  it('yeni parolalar eşleşmiyorsa AĞA HİÇ ÇIKMAZ ve hata gösterir', async () => {
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: 'baskabirsey1' });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Yeni parolalar eşleşmiyor.');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('eşleşmeyen tekrar alanını aria-invalid ile işaretler', async () => {
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: 'baskabirsey1' });
    submit();

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('parola POLİTİKASINI istemcide tekrarlamaz — kısa parola sunucuya gider', async () => {
    render(<ChangePasswordForm />);

    // Tek doğruluk kaynağı sunucudur (ADR-0018); istemci 422'yi gösterir.
    fill({ current: CURRENT, next: 'kisa', confirmation: 'kisa' });
    submit();

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: CURRENT,
        newPassword: 'kisa',
      });
    });
  });
});

describe('ChangePasswordForm — başarı', () => {
  it('gövdeye YALNIZCA mevcut + yeni parolayı koyar (tekrar alanı GİTMEZ)', async () => {
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: NEW });
    submit();

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: CURRENT,
        newPassword: NEW,
      });
    });
  });

  it('net bir onay mesajı gösterir', async () => {
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: NEW });
    submit();

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Parolan değiştirildi.');
    // Bu oturumun ayakta kaldığı kullanıcıya AÇIKÇA söylenir (sıfırlamadan fark).
    expect(status).toHaveTextContent('bu cihazda oturumun açık kalmaya devam ediyor');
  });

  it('başarıdan sonra parola alanlarını temizler', async () => {
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: NEW });
    submit();

    await screen.findByRole('status');
    expect(screen.getByLabelText('Mevcut parola')).toHaveValue('');
    expect(screen.getByLabelText('Yeni parola')).toHaveValue('');
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveValue('');
  });
});

describe('ChangePasswordForm — sunucu hataları', () => {
  it('400 (mevcut parola doğrulanamadı) mesajını gösterir', async () => {
    changePassword.mockRejectedValue(apiError(400, 'Bad Request', 'Mevcut parola dogrulanamadi.'));
    render(<ChangePasswordForm />);

    fill({ current: 'yanlisparola1', next: NEW, confirmation: NEW });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Mevcut parola dogrulanamadi.');
  });

  it('422 (parola politikası) mesajını gösterir', async () => {
    changePassword.mockRejectedValue(
      apiError(422, 'Unprocessable', 'Parola politikasi ihlali: too-short'),
    );
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: 'kisa', confirmation: 'kisa' });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('too-short');
  });

  it('ağ hatasında genel mesaj gösterir', async () => {
    changePassword.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ChangePasswordForm />);

    fill({ current: CURRENT, next: NEW, confirmation: NEW });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
  });

  it('hatadan sonra buton tekrar kullanılabilir (loading takılı kalmaz)', async () => {
    changePassword.mockRejectedValue(apiError(400, 'Mevcut parola dogrulanamadi.'));
    render(<ChangePasswordForm />);

    fill({ current: 'yanlisparola1', next: NEW, confirmation: NEW });
    submit();

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toBeEnabled();
  });

  it('başarısız denemede onay mesajı GÖSTERMEZ', async () => {
    changePassword.mockRejectedValue(apiError(400, 'Mevcut parola dogrulanamadi.'));
    render(<ChangePasswordForm />);

    fill({ current: 'yanlisparola1', next: NEW, confirmation: NEW });
    submit();

    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
