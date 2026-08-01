'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { ChevronLeftIcon, MenuIcon } from '@/components/icons';
import { bootstrapSession } from '@/lib/session/bootstrap';
import { clearSessionHint } from '@/lib/session/session-hint';
import { getAccessToken } from '@/lib/session/session-store';
import { CompanySwitcher } from './company-switcher';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

type Phase = 'loading' | 'ready' | 'redirect';

/**
 * Authenticated uygulama kabuğu — sidebar + header + içerik.
 *
 * ============================================================================
 * SESSION BOOTSTRAP (§2 reload senaryosu)
 * ============================================================================
 * Memory'deki token'lar sayfa yenilemede kaybolur; refresh cookie ve
 * `bo_last_tenant` durur. Kabuk, çocukları (ve `/me/memberships` çağıran
 * switcher'ı) render ETMEDEN önce oturumu yeniden kurar — aksi halde switcher
 * tokensız 401 alırdı. Kurulamıyorsa (`bo_session_hint` temizlenip) login'e gidilir.
 *
 * Oturum-içi navigasyonda access token zaten memory'de → bootstrap atlanır
 * (senkron başlangıç 'ready'), yenileme çakması olmaz.
 * ============================================================================
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() =>
    getAccessToken() !== undefined ? 'ready' : 'loading',
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (phase !== 'loading') {
      return;
    }
    let active = true;
    void bootstrapSession().then((ok) => {
      if (!active) {
        return;
      }
      if (ok) {
        setPhase('ready');
      } else {
        setPhase('redirect');
        clearSessionHint();
        router.replace('/login');
      }
    });
    return () => {
      active = false;
    };
  }, [phase, router]);

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-fg-muted">Yükleniyor…</span>
      </div>
    );
  }
  if (phase === 'redirect') {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* Masaüstü sidebar — daraltılabilir */}
      <aside
        className={`hidden shrink-0 border-r border-border transition-[width] md:block ${collapsed ? 'w-16' : 'w-60'}`}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Mobil drawer */}
      {mobileOpen ? (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => {
              setMobileOpen(false);
            }}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-64 border-r border-border">
            <Sidebar
              collapsed={false}
              onNavigate={() => {
                setMobileOpen(false);
              }}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
          <div className="flex items-center gap-1">
            {/* Mobil: hamburger */}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(true);
              }}
              aria-label="Menüyü aç"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg md:hidden"
            >
              <MenuIcon width={18} height={18} />
            </button>
            {/* Masaüstü: daralt/genişlet */}
            <button
              type="button"
              onClick={() => {
                setCollapsed((value) => !value);
              }}
              aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg md:inline-flex"
            >
              <ChevronLeftIcon
                width={18}
                height={18}
                className={collapsed ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <CompanySwitcher />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
