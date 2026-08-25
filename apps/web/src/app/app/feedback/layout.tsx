import type { ReactNode } from 'react';

/**
 * Müşteri Geri Bildirimi'nin renk kapsamı — modülün imza rengi BURADA deklare
 * edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `feedback` — şema, modül ve `data-module` ÜÇÜ DE aynı kelime
 * ============================================================================
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Geri bildirim"). Anahtar yanlış yazılırsa hata SESSİZDİR:
 * eşleşmeyen bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya
 * devam eder ve yalnızca terracotta kalır — ne lint ne tip denetimi yakalar.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#56793e` / ink `#45672d` · koyu `#8cb274` / ink `#9dc385`
 *
 * ============================================================================
 * ⚠️ DÖRDÜNCÜ KOMŞU-HUE KÜMESİ — VE SETİN EN KALABALIĞI: YEŞİL BANTTA DÖRT KAPI
 * ============================================================================
 * `projects` (#717325 zeytin) · `finance` (#307d54 yeşil) · `invoicing`
 * (#257c6c yeşil-teal) · **`feedback` (#56793e adaçayı)**. Önceki kümeler çift
 * (CRM/Tedarikçi, Finans/Teklif) ya da üçlü (İK/Kampanya/Sadakat) idi; bu
 * DÖRTLÜ.
 *
 * ⚠️ `module-colors.css`in bağlayıcı kuralı bu yüzden burada EN ÇOK geçerli:
 * **renk hiçbir yerde TEK ayırt edici olmaz.** Dört kapı farklı ikon, farklı
 * etiket ve aktifken `aria-current` taşır. Renk körü bir kullanıcı için bu
 * dörtlü, koridorun EN RİSKLİ bölgesidir.
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
 * hiçbiri onları KULLANMAZ: Geri Bildirim'de v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0045 §7 — `LLM_PORT` bile sağlanmıyor). Müşteri yorumları yalnızca
 * merkezî `POST /ask` üzerinden asistana besleniyor; arka planda gömülüyor
 * olması onu ekranda AI çıktısı yapmaz.
 *
 * ⚠️ Bir "memnuniyet özeti" (ADR-0032'nin müşteri özeti karşılığı) eklendiği
 * gün `--ai-accent` / `--ai-ink` kullanmak ZORUNDADIR ve ADR-0045 §7'nin
 * `CompletionFailedError` kararı — bugün ölü kod olan o satır — canlanır.
 *
 * ⚠️ DUVARIN ORTALAMASI BİR AI ÇIKTISI DEĞİLDİR: SQL'de toplanmış deterministik
 * bir sayıdır ve terracotta ile boyanmaz. Boyansaydı "burada asistan
 * konuşuyor" işareti anlamını yitirirdi.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function FeedbackLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="feedback" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
