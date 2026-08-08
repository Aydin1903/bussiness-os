import type { ReactNode } from 'react';

/**
 * CRM'in renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * `data-module` kabuğa (`app-shell.tsx`) konsaydı, orada merkezî bir
 * `pathname → modül` haritası tutmak gerekirdi ve her yeni modül o haritaya
 * bir satır eklerdi. ADR-0025 (permission registry) ve ADR-0031
 * (`RetrievalContributor`) ile aynı disiplin: **platform mekanizmayı
 * sahiplenir, modül kimliğini DEKLARE eder.** 13. modül geldiğinde kabuk
 * dosyasına dokunulmaz.
 *
 * İkinci sonucu bilinçlidir: sidebar ve kabuk bu kapsamın DIŞINDA kalır, yani
 * "BO" rozeti ve şirket seçici terracotta kalmaya devam eder — onlar marka,
 * modül değil.
 *
 * ============================================================================
 * BU DIV NE YAPAR, NE YAPMAZ
 * ============================================================================
 * Yaptığı: alt ağaçtaki `--accent` / `--ink` / `--tint` / `--tint-2` /
 * `--glow` token'larını CRM'in çivit mavisine çevirir (`module-colors.css`).
 * Bileşenlerin hiçbiri değişmez — `bg-accent` aynı sınıftır, değeri farklıdır.
 *
 * YAPMADIĞI: AI'ın sesine dokunmaz. Müşteri özeti gibi AI'ın konuştuğu
 * yerler `bg-ai-accent` / `text-ai-ink` kullanır ve terracotta kalır.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil. Normal bir `div` olsaydı CRM ekranlarının
 * `flex`/`min-h-0` zinciri (`app-shell` → `CrmBody`'nin kaydırma alanı)
 * araya giren bir blok yüzünden kırılırdı.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="crm" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
