import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell/app-shell';

/**
 * Authenticated uygulama kabuğu (`/app/*`).
 *
 * Kabuk chrome'u (sidebar + header + session bootstrap) bir Client Component olan
 * `AppShell`'tedir; bu layout Server Component kalır ve yalnızca sarar. Kimlik
 * kontrolü bir güvenlik sınırı DEĞİLDİR (§3.2): middleware UX yönlendirmesi yapar,
 * gerçek yetki API'de verilir. AppShell reload sonrası oturumu refresh cookie'siyle
 * yeniden kurar (§2).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
