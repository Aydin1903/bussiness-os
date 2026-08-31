'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';

/**
 * `/forgot-password` — parola sıfırlama kodu ister.
 *
 * Backend yanıtı hesabın varlığından BAĞIMSIZ aynıdır (P2): kayıtlı olsun
 * olmasın 202 döner. Bu yüzden ekran "hesap yok" gibi bir ayrım göstermez;
 * her durumda sıfırlama sayfasına geçer (register→verify deseni).
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      await forgotPassword({ email });
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (caught) {
      setError(errorMessage(caught, 'Kod gönderilemedi.'));
      setLoading(false);
    }
  }

  return (
    <AuthScreen screen="forgot-password">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Parolanı sıfırla</h1>
          <p className="text-sm text-fg-muted">
            E-posta adresini gir; kayıtlıysa bir sıfırlama kodu göndereceğiz.
          </p>
        </header>

        <FormError message={error} />

        <Field label="E-posta" htmlFor="email">
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            required
          />
        </Field>

        <Button type="submit" loading={loading}>
          Sıfırlama kodu gönder
        </Button>

        <p className="text-center text-sm text-fg-muted">
          <Link href="/login" className="font-medium text-fg underline-offset-2 hover:underline">
            Girişe dön
          </Link>
        </p>
      </form>
    </AuthScreen>
  );
}
