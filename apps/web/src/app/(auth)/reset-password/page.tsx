import Link from 'next/link';

import { AuthScreen } from '@/components/auth/auth-screen';

import { ResetPasswordForm } from './reset-password-form';

/**
 * `/reset-password` — kod + yeni parola ile sıfırlama.
 *
 * E-posta `/forgot-password`'dan `?email=` ile taşınır. Param okuma SUNUCUDA
 * (Next 15 `searchParams` Promise); form Client Component (verify-email deseni).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const raw = (await searchParams).email;
  const email = typeof raw === 'string' ? raw : '';

  /* Hata dalı da paneli taşır — `verify-email` ile aynı gerekçe. */
  if (email === '') {
    return (
      <AuthScreen screen="reset-password">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold">Parola sıfırlama</h1>
          <p className="text-sm text-fg-muted">
            E-posta bilgisi eksik. Lütfen önce{' '}
            <Link
              href="/forgot-password"
              className="font-medium text-fg underline-offset-2 hover:underline"
            >
              sıfırlama kodu isteyin
            </Link>
            .
          </p>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen screen="reset-password">
      <ResetPasswordForm email={email} />
    </AuthScreen>
  );
}
