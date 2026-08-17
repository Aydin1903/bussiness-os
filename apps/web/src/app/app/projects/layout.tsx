import type { ReactNode } from 'react';

/**
 * Projeler'in renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `projects`, `projeler` DEĞİL
 * ============================================================================
 * On iki modülün hepsi `module-colors.css`'te İNGİLİZCE anahtar taşır; Türkçe
 * olan yalnızca ETİKETTİR ("Projeler"). Anahtar yanlış yazılırsa hata
 * SESSİZDİR: eşleşmeyen bir `[data-module]` seçicisi hiçbir şey ezmez, ekran
 * çalışmaya devam eder ve yalnızca terracotta kalır.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * `data-module` kabuğa (`app-shell.tsx`) konsaydı orada merkezî bir
 * `pathname → modül` haritası tutmak gerekirdi ve her yeni modül o haritaya bir
 * satır eklerdi. ADR-0025 (permission registry) ve ADR-0031
 * (`RetrievalContributor`) ile aynı disiplin: **platform mekanizmayı
 * sahiplenir, modül kimliğini DEKLARE eder.**
 *
 * ⚠️ BU MODÜL O KURALIN İKİNCİ SINAVIDIR. CRM tek örnekti; mekanizmanın
 * gerçekten genelleştiği ancak ikinci modülde görülür. Somut beklenti:
 * `/app/projects` altındaki her şey ZEYTİN, kabuk (KobiWise işareti ve şirket
 * seçici) modülün rengini ALMAZ — çünkü onlar marka, modül değil.
 *
 * ⚠️ İşaret artık terracotta da değildir, hiç renk taşımaz (ADR-0038 §7.1).
 *
 * ============================================================================
 * AI'IN SESİ
 * ============================================================================
 * Bu div AI'ın sesine DOKUNMAZ. Projeler'de v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0033 §10) — yani CRM'in müşteri özeti gibi bir örnek burada bulunmuyor.
 * Eklendiği gün `bg-ai-accent` / `text-ai-ink` kullanmak ZORUNDADIR.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil. Normal bir `div` olsaydı `app-shell` → `ModuleBody`
 * `flex`/`min-h-0` zinciri araya giren blok yüzünden kırılırdı.
 */
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="projects" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
