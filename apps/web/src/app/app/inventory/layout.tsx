import type { ReactNode } from 'react';

/**
 * Stok / Envanter'in renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `inventory` — şema, modül ve `data-module` ÜÇÜ DE aynı kelime
 * ============================================================================
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Stok"). Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen bir
 * `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya devam eder ve
 * yalnızca terracotta kalır — ne lint ne tip denetimi yakalar.
 *
 * ⚠️ Randevu'da bu bir DÜZELTME işiydi (palet `booking` adıyla ayrılmıştı).
 * Burada gerekmedi: `module-colors.css` paleti ilk günden `inventory`
 * anahtarıyla yazmış.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#876b1c` / ink `#785c00` · koyu `#c2a45a` / ink `#d3b56b`
 *
 * ⚠️ Bu hardal, terracottanın ±35°'lik yasak koridoruna EN YAKIN komşudur ve
 * bilinçli olarak sarıya çekilmiştir (`module-colors.css` seçim kuralı 1).
 * Yaklaşmasının sebebi de yazılı: AI'ın sesi her modülde terracotta kalacaksa,
 * modülün rengi ondan BİR BAKIŞTA ayrılmalıdır.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * ADR-0025 / ADR-0031 disiplini: **platform mekanizmayı sahiplenir, modül
 * kimliğini DEKLARE eder.** ⚠️ BU MODÜL O KURALIN ALTINCI SINAVIDIR ve
 * `app-shell.tsx`'e YİNE DOKUNULMADI.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Stok'ta v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0039 §10 — `LLM_PORT` bile sağlanmıyor). Kalem notu yalnızca merkezî
 * `POST /ask` üzerinden asistana besleniyor; arka planda gömülüyor olması onu
 * ekranda AI çıktısı yapmaz.
 *
 * ⚠️ Bir "stok özeti" eklendiği gün `--ai-accent` / `--ai-ink` kullanmak
 * ZORUNDADIR ve ADR-0039 §10.1'in `CompletionFailedError` kararı — bugün ölü
 * kod olan o satır — canlanır.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="inventory" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
