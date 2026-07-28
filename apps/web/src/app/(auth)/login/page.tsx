import { LoginForm } from './login-form';

/**
 * `/login` — giriş.
 *
 * `?next=` (middleware yönlendirmesinden) ve `?verified=1` (doğrulama sonrası)
 * SUNUCUDA okunur; form Client Component'tır. Böylece `useSearchParams`'ın
 * Suspense gereksiniminden kaçınılır.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    verified?: string | string[];
    reset?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;
  const justVerified = params.verified === '1';
  const justReset = params.reset === '1';

  return <LoginForm next={next} justVerified={justVerified} justReset={justReset} />;
}
