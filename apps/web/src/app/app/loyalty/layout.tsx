import type { ReactNode } from 'react';

/**
 * Sadakat Programı'nın renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `loyalty` — İZİN KAYNAKLARI İSE `loyalty_account`/`loyalty_point`
 * ============================================================================
 * ADR-0051 §1.1: şema · modül klasörü · rota · `data-module` ·
 * `module-colors.css` bloğu **beşi de** `loyalty`. İzin kaynakları ise
 * NİTELENMİŞ — ve gerekçe bir ÖNGÖRÜDÜR: ⚠️ **Faz 6 FATURALAMA'dır** ve
 * çıplak `account` orada kaçınılmaz olarak çakışırdı (ADR-0039'un `stock_item`
 * kararının aynısı).
 *
 * ⚠️ Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen bir `[data-module]`
 * seçicisi hiçbir şey ezmez, ekran çalışır ve yalnızca terracotta kalır — ne
 * lint ne tip denetimi yakalar. ADR-0035'in `booking` → `appointments` dersi
 * burada HİÇ DOĞMADI: palet ilk günden `loyalty` adıyla yazılmıştı.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#9a5a84` / ink `#874972` · koyu `#d792be` / ink `#e9a3d0`
 *
 * ============================================================================
 * ⚠️ MOR BANT ARTIK ÜÇ KAPI — VE SETİN EN KALABALIK İKİNCİ BANDI
 * ============================================================================
 * `hr` (#896096) · `marketing` (#7665a6) · **`loyalty` (#9a5a84)**. Kural
 * aynen bağlayıcı: ⚠️ **renk hiçbir yerde TEK ayırt edici olmaz.** Üçü de
 * farklı ikon, farklı etiket ("Ekip" / "Kampanyalar" / "Sadakat") ve aktifken
 * `aria-current` taşır.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR, VE SEBEBİ ÖZELDİR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ. ⚠️ Kampanya'da sebep "modül içi AI yüzeyi yok"tu
 * (veri yine de `POST /ask` havuzuna giriyordu). Burada sebep daha keskin:
 * ⚠️ **bu modülün `POST /ask` havuzuna SIFIR katkısı vardır** (ADR-0051 §3) —
 * yani sadakat verisi asistanın hafızasına HİÇ girmez.
 *
 * ⚠️ DUVARIN SAYILARI BİR AI ÇIKTISI DEĞİLDİR: SQL'de toplanmış deterministik
 * sayılardır ve terracotta ile boyanmaz. Boyansaydı "burada asistan konuşuyor"
 * işareti anlamını yitirirdi.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function LoyaltyLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="loyalty" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
