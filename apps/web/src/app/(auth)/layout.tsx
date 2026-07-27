import type { ReactNode } from 'react';

/**
 * Auth sayfaları için ortak düzen — ortalanmış tek kart (§3.1).
 *
 * `login` · `register` · `verify-email` · `forgot/reset-password` gibi kimliksiz
 * akışlar bu wrapper'ı paylaşır. Bunlar Client Component'tır (form state, doğrudan
 * API'ye POST); SSR faydası yoktur. İçerik F2'de gelir.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-lg font-semibold tracking-tight">Business OS</span>
        </div>
        <section className="rounded-card border border-border bg-surface p-8">{children}</section>
      </div>
    </main>
  );
}
