import { ChangePasswordForm } from './change-password-form';

/**
 * `/app/change-password` — giriş yapmış kullanıcının parola değişimi.
 *
 * `(auth)` grubunda DEĞİL `/app/*` altında: kimliksiz akışlar (kayıt, giriş,
 * kurtarma) orada yaşar; bu ise app shell'in içinde, kimliği kanıtlanmış bir
 * kullanıcının kendi ayarıdır. Böylece middleware kapısından ve `AppShell`
 * session bootstrap'ından geçer — form render edildiğinde access token
 * memory'dedir.
 *
 * Sayfa Server Component kalır; form Client Component (reset-password deseni).
 */
export default function ChangePasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <ChangePasswordForm />
    </div>
  );
}
