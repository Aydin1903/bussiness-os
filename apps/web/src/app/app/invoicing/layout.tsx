import type { ReactNode } from 'react';

/**
 * Teklif / Fatura'nın renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `invoicing` — şema, modül ve `data-module` ÜÇÜ DE aynı kelime
 * ============================================================================
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Teklif / Fatura"). Anahtar yanlış yazılırsa hata SESSİZDİR:
 * eşleşmeyen bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya
 * devam eder ve yalnızca terracotta kalır — ne lint ne tip denetimi yakalar.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#257c6c` / ink `#076b5b` · koyu `#64b6a4` / ink `#75c7b5`
 *
 * ⚠️ Bu yeşil-teal bir tercih DEĞİL, dosyanın kendi seçim kuralının sonucudur:
 * _"AKRABA MODÜLLER KOMŞU HUE ALIR. Teklif/Fatura, Finans'ın yanında
 * ('Finans uzantısı')."_ Yani renk, ROADMAP §3.5'in konumlandırmasını GÖRSEL
 * OLARAK söylüyor.
 *
 * ⚠️ KOMŞU HUE OLMASININ BEDELİ VAR VE BU ÇİFT, KORİDORDAKİ İKİNCİ ÇİFTTİR:
 * Finans (#307d54) ile Teklif/Fatura (#257c6c) birbirine, CRM/Tedarikçi
 * çiftinden DAHA YAKINDIR. `module-colors.css`in bağlayıcı kuralı bu yüzden
 * burada ÖZELLİKLE geçerlidir — renk hiçbir yerde TEK ayırt edici olmamalı.
 * Aktif kapı ayrıca kalın yazı, farklı ikon, farklı etiket ve `aria-current`
 * taşır; sekmeler de öyle.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * ADR-0025 / ADR-0031 disiplini: **platform mekanizmayı sahiplenir, modül
 * kimliğini DEKLARE eder.** ⚠️ BU MODÜL O KURALIN SEKİZİNCİ SINAVIDIR ve
 * `app-shell.tsx`'e YİNE DOKUNULMADI.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Teklif/Fatura'da modül içi AI yüzeyi YOKTUR
 * (ADR-0041 §5 — modül embedding bile üretmez). Belgeler asistana yalnızca
 * merkezî `POST /ask` üzerinden, YAPISAL bir katkıyla besleniyor.
 *
 * ⚠️ Bir "teklif metnini yaz" özelliği eklendiği gün `--ai-accent` /
 * `--ai-ink` kullanmak ZORUNDADIR ve ADR-0041 §10'un bugün ölü kod olan üç AI
 * hata tipi satırı canlanır.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function InvoicingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="invoicing" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
