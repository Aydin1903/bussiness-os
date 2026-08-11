import type { ReactNode } from 'react';

/**
 * Finans'ın renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `finance`, `finans` DEĞİL
 * ============================================================================
 * On iki modülün hepsi `module-colors.css`'te İNGİLİZCE anahtar taşır; Türkçe
 * olan yalnızca ETİKETTİR ("Finans"). Anahtar yanlış yazılırsa hata SESSİZDİR:
 * eşleşmeyen bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya
 * devam eder ve yalnızca terracotta kalır.
 *
 * Renk `module-colors.css`'te ZATEN AYRILMIŞTIR ve burada ÜRETİLMEZ:
 *   açık `#307d54` / ink `#1a6b43` · koyu `#6cb78b` / ink `#7dc89b`
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
 * ⚠️ BU MODÜL O KURALIN ÜÇÜNCÜ SINAVIDIR ve `app-shell.tsx`'e YİNE
 * DOKUNULMADI — mekanizmanın genelleştiğinin ölçüsü tam olarak budur.
 *
 * ============================================================================
 * AI'IN SESİ
 * ============================================================================
 * Bu div AI'ın sesine DOKUNMAZ. Finans'ta v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0034 §10) — nakit akışı ekranındaki yorumlar KULLANICININ yazdığı
 * metindir, asistanın ürettiği değil. Bir "dönem özeti" eklendiği gün
 * `--ai-accent` / `--ai-ink` kullanmak ZORUNDADIR.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil. Normal bir `div` olsaydı `app-shell` → `ModuleBody`
 * `flex`/`min-h-0` zinciri araya giren blok yüzünden kırılırdı.
 */
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="finance" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
