import type { ReactNode } from 'react';

import { LogoutButton } from '@/components/logout-button';

/**
 * Authenticated uygulama kabuğu — sidebar + header İSKELETİ (§3.1).
 *
 * F1'de içi bilinçli olarak BOŞTUR: navigasyon öğeleri, tenant seçici, kullanıcı
 * menüsü ve gerçek içerik sonraki fazlarda gelir. Amaç, `/app/*` rotalarının
 * oturacağı düzeni ve middleware'in koruduğu segmenti şimdiden kurmaktır.
 *
 * Bu düzen bir güvenlik sınırı DEĞİLDİR; kimlik kontrolü middleware'de (UX) ve
 * gerçek yetki API'de yapılır (§3.2).
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — iskelet */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <div className="flex h-14 items-center px-5">
          <span className="text-sm font-semibold tracking-tight">Business OS</span>
        </div>
        <nav className="px-3 py-2" aria-label="Ana gezinme">
          {/* Navigasyon öğeleri sonraki fazda. */}
        </nav>
      </aside>

      {/* İçerik sütunu */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header — iskelet */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="text-sm text-fg-muted">{/* Breadcrumb / başlık — sonraki faz */}</div>
          <div className="flex items-center gap-2">
            {/* Tenant seçici + kullanıcı menüsü — sonraki faz */}
            <LogoutButton />
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
