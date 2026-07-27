'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { resendVerification, verifyEmail } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';

/**
 * 6 haneli kod girişi + "yeniden gönder".
 *
 * Tüm redler (yanlış/dolmuş/tükenmiş kod, zaten doğrulanmış) backend'de AYNI 400
 * ve sabit metni üretir (P2) — bu yüzden ekran hangi sebebin gerçekleştiğini
 * ayırt etmez, yalnızca gösterir.
 */
export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await verifyEmail({ email, code });
      // Doğrulandı; girişe geç (F2.1'de otomatik giriş yok).
      router.push('/login?verified=1');
    } catch (caught) {
      setError(errorMessage(caught, 'Kod doğrulanamadı.'));
      setLoading(false);
    }
  }

  async function onResend(): Promise<void> {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await resendVerification({ email });
      // Yanıt hesabın varlığından bağımsız aynıdır; her durumda aynı bilgi verilir.
      setNotice('Yeni bir kod gönderildi. E-postanızı kontrol edin.');
    } catch (caught) {
      setError(errorMessage(caught, 'Kod gönderilemedi.'));
    } finally {
      setResending(false);
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
        <h1 className="text-lg font-semibold">E-postanı doğrula</h1>
        <p className="text-sm text-fg-muted">
          <span className="text-fg">{email}</span> adresine gönderilen 6 haneli kodu girin.
        </p>
      </header>

      <FormError message={error} />
      {notice !== null ? <p className="text-sm text-fg-muted">{notice}</p> : null}

      <Field label="Doğrulama kodu" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            // Yalnızca rakam; kullanıcı boşluk/harf yapıştırsa da temizlenir.
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          className="text-center tracking-[0.4em]"
          required
        />
      </Field>

      <Button type="submit" loading={loading}>
        Doğrula
      </Button>

      <button
        type="button"
        onClick={() => {
          void onResend();
        }}
        disabled={resending}
        className="text-center text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline disabled:opacity-60"
      >
        {resending ? 'Gönderiliyor…' : 'Kodu yeniden gönder'}
      </button>
    </form>
  );
}
