import type { ReactNode } from 'react';

/**
 * İK / Personel'in renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `hr` — şema, modül, rota ve `data-module` DÖRDÜ DE aynı kelime
 * ============================================================================
 * Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen bir `[data-module]`
 * seçicisi hiçbir şey ezmez, ekran çalışmaya devam eder ve yalnızca terracotta
 * kalır — ne lint ne tip denetimi yakalar.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#896096` / ink `#784f84` · koyu `#c498d2` / ink `#d6a9e4`
 *
 * ⚠️ ÜÇÜNCÜ KOMŞU-HUE KÜMESİ VE İLKİ ÜÇ RENKLİ: `hr` (#896096),
 * `marketing` (#7665a6) ve `loyalty` (#9a5a84) mor bantta BİRLİKTE duruyor —
 * CRM/Tedarikçi ve Finans/Teklif çiftlerinden bir renk daha kalabalık. İkisi
 * henüz yazılmadı ama kural bugünden geçerlidir: renk hiçbir yerde TEK ayırt
 * edici olmaz. Kapı ayrıca farklı ikon, farklı etiket ve `aria-current` taşır.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR, VE BU EN GÜÇLÜ HÂLİ
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ. Diğer modüllerde bu "v1'de AI yüzeyi yok"
 * demekti; burada DAHA GÜÇLÜ bir şey demek: İK'nın `POST /ask` havuzunda
 * HİÇBİR KAYNAĞI YOKTUR (ADR-0043 §5) — ne anlamsal ne yapısal.
 *
 * ⚠️ Bir "ekip özeti" eklemek yalnızca bir bileşen eklemek değildir: önce
 * §5'in üç gerekçesini (anlatısal içerik yok · katalog olgu değil · katkıcı
 * yokluğu MAAŞ İZOLASYONUNUN ÜÇÜNCÜ KATMANIDIR) çürütmek gerekir.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir.
 */
export default function HrLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="hr" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
