'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { resetPassword } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';

/**
 * 6 haneli kod + yeni parola.
 *
 * Tüm redler (yanlış/dolmuş/tükenmiş kod, hesap yok/pasif) backend'de AYNI 400
 * ve sabit metni üretir (P2). Parola politikası ihlali ise 422'dir. Başarıda
 * TÜM oturumlar sunucuda düşer (ADR-0024) → kullanıcı yeni parolayla giriş yapar.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      await resetPassword({ email, code, password });
      router.push('/login?reset=1');
    } catch (caught) {
      setError(errorMessage(caught, 'Parola sıfırlanamadı.'));
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Yeni parola belirle</h1>
        <p className="text-sm text-fg-muted">
          <span className="text-fg">{email}</span> adresine gönderilen kodu ve yeni parolanı gir.
        </p>
      </header>

      <FormError message={error} />

      <Field label="Sıfırlama kodu" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          className="text-center tracking-[0.4em]"
          required
        />
      </Field>

      <Field label="Yeni parola" htmlFor="password">
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
        />
      </Field>

      <Button type="submit" loading={loading}>
        Parolayı sıfırla
      </Button>
    </form>
  );
}
