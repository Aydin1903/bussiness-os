'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { MenuIcon } from '@/components/icons';
import { bootstrapSession } from '@/lib/session/bootstrap';
import { clearSessionHint } from '@/lib/session/session-hint';
import { getAccessToken } from '@/lib/session/session-store';
import { Sidebar } from './sidebar';

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

  const toggleCollapse = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);
  const openMobile = useCallback(() => {
    setMobileOpen(true);
  }, []);
  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

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
    /*
     * ATÖLYE KABUĞU — kabuk zeminden AYRILIR, panel zeminden YÜKSELİR.
     *
     * Sol menü artık kendi zemini olan bir sütun değil; sıcak kağıdın üstünde
     * duran saydam bir katman. İçerik ise yüzen bir yüzey: kendi köşesi, kendi
     * gölgesi var. Derinlik böyle kurulur — çizgiyle değil, katmanla.
     *
     * MOBİLDE PANEL TAM KANAR: `md` altında dolgu ve köşe sıfırlanır. Küçük
     * ekranda kenar boşluğu lüks değil kayıptır; okunur genişlik zaten dar.
     */
    <div className="flex h-dvh overflow-hidden p-0 md:gap-3 md:p-3">
      {/* Masaüstü sol menü — saydam, zeminin üstünde durur. */}
      <aside
        className={`hidden shrink-0 transition-[width] duration-300 ease-rise md:block ${
          collapsed ? 'w-[68px]' : 'w-[236px]'
        }`}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* Mobil çekmece — `md` altında tek gezinme yolu. */}
      {mobileOpen ? (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
            onClick={closeMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-[264px] bg-bg p-3 shadow-lift">
            <Sidebar collapsed={false} onNavigate={closeMobile} />
          </aside>
        </div>
      ) : null}

      {/*
        Yüzen yüzey. `overflow-hidden` köşeleri korur: içerideki kaydırma
        alanı yuvarlatılmış kenarın dışına taşamaz.
      */}
      <main
        className={[
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface',
          'md:rounded-panel md:border md:border-border md:shadow-float',
        ].join(' ')}
      >
        {/*
          Mobil başlık şeridi — YALNIZCA `md` altında. Masaüstünde daraltma
          düğmesi sol menünün kendi başlığına taşındı; içerik alanının üstünde
          boş bir şerit tutmak, yüzen panelin ilk satırını harcıyordu.
        */}
        <div className="flex h-12 shrink-0 items-center border-b border-border px-2 md:hidden">
          <button
            type="button"
            onClick={openMobile}
            aria-label="Menüyü aç"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-fg-2 transition-colors hover:bg-fill hover:text-fg"
          >
            <MenuIcon width={18} height={18} />
          </button>
        </div>

        {/* Dolgu YOK: her sayfa kendi düzenini kurar ve panelin kenarına
            kadar uzanır. Dolgu isteyen sayfa kendi verir. */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
