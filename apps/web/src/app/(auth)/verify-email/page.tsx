import Link from 'next/link';

import { VerifyEmailForm } from './verify-email-form';

/**
 * `/verify-email` — 6 haneli kodla e-posta doğrulama.
 *
 * E-posta, `/register`'dan `?email=` ile taşınır. Param okuma SUNUCUDA yapılır
 * (Next 15'te `searchParams` bir Promise'tir); form ise Client Component'tır.
 * Böylece `useSearchParams`'ın Suspense gereksiniminden kaçınılır.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const raw = (await searchParams).email;
  const email = typeof raw === 'string' ? raw : '';

  if (email === '') {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Doğrulama</h1>
        <p className="text-sm text-fg-muted">
          E-posta bilgisi eksik. Lütfen önce{' '}
          <Link href="/register" className="font-medium text-fg underline-offset-2 hover:underline">
            kayıt olun
          </Link>
          .
        </p>
      </div>
    );
  }

  return <VerifyEmailForm email={email} />;
}
