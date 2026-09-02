'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/auth-screen';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { registerUser } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';

/**
 * `/register` — hesap oluşturma.
 *
 * Başarıda backend 202 döner (hesap oluştu ama HENÜZ kullanılamaz; e-posta
 * doğrulanmalı). Yanıt hesabın varlığından bağımsız SABİTTİR (P2) — bu yüzden
 * "e-posta zaten kayıtlı" gibi bir ayrım gösterilmez; her durumda doğrulama
 * sayfasına geçilir.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      await registerUser({ email, password });
      // Kod her durumda gönderilir; kullanıcı doğrulama adımına geçer.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (caught) {
      setError(errorMessage(caught, 'Kayıt tamamlanamadı.'));
      setLoading(false); // Başarıda sayfa değişir; yalnızca hatada geri al.
    }
  }

  return (
    <AuthScreen screen="register">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Hesap oluştur</h1>
          <p className="text-sm text-fg-muted">Başlamak için e-posta ve parola belirleyin.</p>
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

        <Field label="Parola" htmlFor="password">
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
          Hesap oluştur
        </Button>

        {/*
          ⚠️ AYNI UÇ, FARKLI METİN. Ayrı bir "kayıt" ucu YOKTUR: akış
          "bağla ya da aç"tır (ADR-0053 §11) — sunucu `(provider, sub)` bağlı
          değilse hesabı kendisi açar. Bu yüzden burada da `SocialSignIn`
          kullanılır, kopyası değil.

          ⚠️ `next` YOK: kayıt sonrası hedef her zaman akışın kendi devamıdır
          (ADR-0028'in yönlendirmesi), bir sayfa değil.
        */}
        <SocialSignIn />

        <p className="text-center text-sm text-fg-muted">
          Zaten hesabın var mı?{' '}
          <Link href="/login" className="font-medium text-fg underline-offset-2 hover:underline">
            Giriş yap
          </Link>
        </p>
      </form>
    </AuthScreen>
  );
}
