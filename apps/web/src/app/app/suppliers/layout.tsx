import type { ReactNode } from 'react';

/**
 * Tedarikçi Yönetimi'nin renk kapsamı — modülün imza rengi BURADA deklare
 * edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `suppliers` — şema, modül ve `data-module` ÜÇÜ DE aynı kelime
 * ============================================================================
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Tedarikçi"). Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen
 * bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya devam eder ve
 * yalnızca terracotta kalır — ne lint ne tip denetimi yakalar.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#5c6cab` / ink `#4c5b98` · koyu `#92a5e8` / ink `#a3b6fa`
 *
 * ⚠️ Bu mor-mavi bir tercih DEĞİL, dosyanın kendi seçim kuralının sonucudur:
 * _"AKRABA MODÜLLER KOMŞU HUE ALIR. Tedarikçi, CRM'in yanında (ROADMAP §3.5:
 * 'CRM deseninin ucuz tekrarı')."_ Yani renk, ROADMAP'in konumlandırmasını
 * GÖRSEL OLARAK söylüyor.
 *
 * ⚠️ KOMŞU HUE OLMASININ BİR BEDELİ VAR: CRM'in çivit mavisiyle (#3173af)
 * yakınlaşır. `module-colors.css`in bağlayıcı kuralı bu yüzden burada
 * ÖZELLİKLE geçerlidir — renk hiçbir yerde TEK ayırt edici olmamalı. Aktif
 * kapı ayrıca kalın yazı ve `aria-current` taşır; sekmeler de öyle.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * ADR-0025 / ADR-0031 disiplini: **platform mekanizmayı sahiplenir, modül
 * kimliğini DEKLARE eder.** ⚠️ BU MODÜL O KURALIN YEDİNCİ SINAVIDIR ve
 * `app-shell.tsx`'e YİNE DOKUNULMADI.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Tedarikçi'de v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0040 §7 — `LLM_PORT` bile sağlanmıyor). Görüşme metni yalnızca merkezî
 * `POST /ask` üzerinden asistana besleniyor; arka planda gömülüyor olması onu
 * ekranda AI çıktısı yapmaz.
 *
 * ⚠️ Bir "tedarikçi özeti" (ADR-0032'nin müşteri özeti karşılığı) eklendiği
 * gün `--ai-accent` / `--ai-ink` kullanmak ZORUNDADIR ve ADR-0040 §7'nin
 * `CompletionFailedError` kararı — bugün ölü kod olan o satır — canlanır.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function SuppliersLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="suppliers" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
