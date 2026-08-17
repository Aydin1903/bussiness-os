'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { KobiWiseMark, KobiWiseWordmark } from '@/components/brand';
import { MenuIcon } from '@/components/icons';
import { Rail } from '@/components/room/rail';
import { bootstrapSession } from '@/lib/session/bootstrap';
import { clearSessionHint } from '@/lib/session/session-hint';
import { getAccessToken } from '@/lib/session/session-store';

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
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * Koridor genişliği — VARSAYILAN GENİŞ (ADR-0038 §2, PO 2026-08-17).
   *
   * ⚠️ Başlangıç `false` ve tercih efektte okunuyor: `useState(() =>
   * localStorage…)` sunucuda ve istemcide farklı değer üretip hidrasyon
   * uyuşmazlığı verirdi. Görsel bedeli bir karelik genişlik animasyonudur ve
   * `transition-[width]` onu zaten yumuşatıyor.
   */
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    try {
      setRailCollapsed(window.localStorage.getItem('bo_rail') === 'collapsed');
    } catch {
      // Depolama kapalıysa varsayılan geniş kalır; gezinme çalışmaya devam eder.
    }
  }, []);

  const toggleRail = useCallback(() => {
    setRailCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem('bo_rail', next ? 'collapsed' : 'wide');
      } catch {
        // Yazılamadıysa seçim bu oturumda geçerli olur, kalıcı olmaz.
      }
      return next;
    });
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
    /*
     * ⚠️ AÇILIŞ EKRANI — kullanıcının gördüğü İLK kare.
     *
     * Eskiden burada çıplak bir `Yükleniyor…` yazısı vardı. Oturum kurulumu
     * (`bootstrapSession`) bir ağ turu sürer ve o süre boyunca ekranda tek bir
     * gri kelime duruyordu: ürünün ilk izlenimi bir hata sayfası gibiydi.
     *
     * Yerine markanın kendisi kondu. Metin YOK ve bu bilinçli — "Yükleniyor"
     * yazmak kullanıcıya zaten gördüğü şeyi söylemektir; işaretin sakin nabzı
     * aynı bilgiyi gürültüsüz verir.
     *
     * `role="status"` + `aria-label`: görsel olmayan kullanıcı da durumu bilir.
     */
    return (
      <div
        role="status"
        aria-label="Oturum hazırlanıyor"
        className="flex min-h-dvh items-center justify-center"
      >
        <KobiWiseMark height={34} className="pulse-ring rounded-[6px] text-fg-3" />
      </div>
    );
  }
  if (phase === 'redirect') {
    return null;
  }

  return (
    /*
     * ODA KABUĞU — ADR-0038.
     *
     * ============================================================================
     * KABUK ARTIK BİR ÇERÇEVE DEĞİL, KORİDOR + ODA
     * ============================================================================
     * Eski kabuk içeriği yüzen bir panele koyuyordu: kendi köşesi, kenarlığı ve
     * gölgesi olan bir kart. Oda sisteminde bu YANLIŞ olurdu — odanın rengi
     * ekranın ZEMİNİ olmalı, bir kartın içine hapsedilmiş bir yüzey değil.
     * Panel kaldırıldı; oda kenardan kenara uzanır ve koridor onun solunda durur.
     *
     * `md:p-3` ve `md:rounded-panel` bu yüzden GİTTİ. Yuvarlatılmış köşe
     * korunsaydı odanın tuvali ile ekranın zemini arasında ince bir krem şerit
     * kalırdı — tam olarak terk edilen görünüm.
     */
    <div className="flex h-dvh overflow-hidden">
      {/* KORİDOR — masaüstünde daima görünür, genişliği kullanıcı seçer. */}
      <aside
        className={`hidden shrink-0 border-r border-border bg-sunken/40 transition-[width] duration-300 ease-rise md:block ${
          railCollapsed ? 'w-[62px]' : 'w-[216px]'
        }`}
      >
        <Rail collapsed={railCollapsed} onToggle={toggleRail} />
      </aside>

      {/* Mobil çekmece — `md` altında tek gezinme yolu. */}
      {mobileOpen ? (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
            onClick={closeMobile}
            aria-hidden="true"
          />
          {/* Mobilde daima GENİŞ: çekmece zaten örtü olarak açılıyor ve orada
              yer kazanmanın bir anlamı yok — etiketler okunur olsun. */}
          <aside className="fixed inset-y-0 left-0 z-40 w-[240px] border-r border-border bg-bg shadow-lift">
            <Rail collapsed={false} onNavigate={closeMobile} />
          </aside>
        </div>
      ) : null}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/*
          MOBİL BAŞLIK ŞERİDİ — yalnızca `md` altında.
          ============================================================================
          ⚠️ Şerit MARKAYI da taşır. Mobilde koridor bir çekmecede gizli olduğu
          için, açılışta ekranda ürünün adını söyleyen hiçbir şey kalmıyordu —
          kullanıcı hangi uygulamada olduğunu yalnızca sekme başlığından
          anlayabiliyordu.

          ⚠️ Dokunma hedefi 44 px (`h-11 w-11`). Eskiden 36 px'ti (`h-9 w-9`) ve
          bu, mobil erişilebilirlik eşiğinin ALTINDA: parmak ucu ortalama 45 px
          civarındadır, daha küçük hedefler ıskalanır. İkon 18 px kaldı —
          büyüyen şey hedef, çizim değil.
        */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:hidden">
          <button
            type="button"
            onClick={openMobile}
            aria-label="Menüyü aç"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-fg-2 transition-colors hover:bg-fill hover:text-fg"
          >
            <MenuIcon width={18} height={18} />
          </button>
          <KobiWiseWordmark size={17} />
        </div>

        {/* Dolgu YOK: her sayfa kendi düzenini kurar ve panelin kenarına
            kadar uzanır. Dolgu isteyen sayfa kendi verir. */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
