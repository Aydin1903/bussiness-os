import type { ReactNode } from 'react';

/**
 * Kampanya / Pazarlama'nın renk kapsamı — modülün imza rengi BURADA deklare
 * edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `marketing` — İZİN KAYNAĞI İSE `campaign`, VE BU AYRIŞMA KURALDIR
 * ============================================================================
 * ADR-0047 §1.1: şema · modül klasörü · rota · `data-module` ·
 * `module-colors.css` blogu **beşi de** `marketing`. İzin kaynağı ise
 * `campaign` — tıpkı `invoicing` modülünün `quote`/`invoice` izinleri gibi.
 * **Modül bir HAFIZA ALANIDIR, izin bir KAYNAK üzerindedir.**
 *
 * ⚠️ Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen bir `[data-module]`
 * seçicisi hiçbir şey ezmez, ekran çalışır ve yalnızca terracotta kalır — ne
 * lint ne tip denetimi yakalar. ADR-0035'in `booking` → `appointments` dersi
 * burada HİÇ DOĞMADI çünkü palet ilk günden doğru adla yazılmıştı.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#7665a6` / ink `#655493` · koyu `#ae9de2` / ink `#bfaef4`
 *
 * ============================================================================
 * ⚠️ MOR BANT — BUGÜN İKİ KAPI, YARIN ÜÇ
 * ============================================================================
 * `hr` (#896096) · **`marketing` (#7665a6)** · `loyalty` (#9a5a84, 12. modülle
 * gelecek). Yeşil bandın dörtlüsünden küçük ama kural aynen bağlayıcı:
 * ⚠️ **renk hiçbir yerde TEK ayırt edici olmaz.** Kapılar farklı ikon, farklı
 * etiket ("Ekip" / "Kampanyalar") ve aktifken `aria-current` taşır.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Kampanya'da v1'de modül içi AI yüzeyi YOKTUR
 * (`LLMPort` sağlanmıyor). Sonuç notları yalnızca merkezî `POST /ask` üzerinden
 * asistana besleniyor; arka planda gömülüyor olması onu ekranda AI çıktısı
 * yapmaz.
 *
 * ⚠️ DUVARIN SAYILARI BİR AI ÇIKTISI DEĞİLDİR: SQL'de toplanmış deterministik
 * sayılardır ve terracotta ile boyanmaz. Boyansaydı "burada asistan konuşuyor"
 * işareti anlamını yitirirdi.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="marketing" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
