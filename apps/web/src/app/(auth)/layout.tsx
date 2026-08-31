import type { ReactNode } from 'react';

/**
 * Auth sayfalarının ortak kökü — ADR-0052.
 *
 * ============================================================================
 * ⚠️ BU LAYOUT'UN TEK İŞİ KAPSAM AÇMAKTIR
 * ============================================================================
 * Düzeni (split-screen ızgara, panel, form sütunu) `AuthScreen` kurar ve hangi
 * panelin görüneceğini SAYFA deklare eder. Burada bir `pathname → ekran`
 * haritası TUTULMAZ: tutulsaydı sekizinci ekran geldiğinde bu dosya değişmek
 * zorunda kalırdı. ADR-0025 (permission registry), ADR-0031
 * (`RetrievalContributor`) ve ADR-0038'in (`data-module` modülün kendi
 * layout'unda) aynı disiplini — **platform mekanizmayı sahiplenir, yüzey
 * kimliğini deklare eder.**
 *
 * ============================================================================
 * ⚠️ `data-surface="auth"` UNUTULURSA HATA SESSİZDİR
 * ============================================================================
 * Ekran çalışmaya devam eder; yalnızca `--accent` kök değerine döner ve
 * terracotta geri gelir — yani ADR-0052 §3'ün "auth ekranında terracotta hiç
 * yoktur" garantisi kaybolur. Ne lint ne tip denetimi bunu yakalar
 * (`data-module`'ün bilinen sınırının aynısı, FRONTEND §4.8).
 *
 * Bu yüzden `auth-surface.spec.tsx` attribute'un varlığını ayrıca kilitler.
 *
 * ============================================================================
 * NEDEN BURADA BİR MARKA ÖĞESİ YOK
 * ============================================================================
 * Eskiden bu dosya yazılı logoyu ortalanmış kartın üstüne koyuyordu. Kuralın
 * GEREKÇESİ değişmedi (giriş ekranı kullanıcının henüz içeride olmadığı
 * yüzeydir, marka kendini orada tanıtır) ama KONUMU değişti: ≥768 px'te panel
 * zaten marka beyanıdır, <768 px'te logo formun üstüne döner. İkisi de
 * `AuthScreen`in içindedir — ADR-0052 §5.2.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  /*
   * `min-h-dvh`, `vh` DEĞİL: mobil tarayıcı çubuğu açılıp kapandığında `vh`
   * düzeni zıplatır (ADR-0052 §4.3).
   *
   * `bg-bg` burada AÇIKÇA yazılır ve gereklidir: `auth-surface.css` bu öğeye
   * `position: relative; z-index: 1` verip kendi yığın bağlamını kurar —
   * `body::before`in terracotta zemin ışığını ÖRTMEK için. Zemin rengi
   * yazılmasaydı öğe saydam kalır ve örtme işe yaramazdı.
   */
  return (
    <div data-surface="auth" className="min-h-dvh bg-bg">
      {children}
    </div>
  );
}
