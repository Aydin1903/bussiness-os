import type { ReactNode } from 'react';

/**
 * Belge'nin renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `documents` — şema, modül ve `data-module` ÜÇÜ DE aynı kelime
 * ============================================================================
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Belgeler"). Anahtar yanlış yazılırsa hata SESSİZDİR: eşleşmeyen
 * bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya devam eder ve
 * yalnızca terracotta kalır.
 *
 * ⚠️ Randevu'da bu bir DÜZELTME işiydi (palet `booking` adıyla ayrılmıştı,
 * ADR-0035 §1.1'de yeniden adlandırıldı). Burada gerekmedi: `module-colors
 * .css` paleti ilk günden `documents` anahtarıyla yazmış.
 *
 * Renk ÜRETİLMEZ, `module-colors.css`'te ZATEN ÖLÇÜLMÜŞTÜR:
 *   açık `#557380` / ink `#45626e` · koyu `#8dacba` / ink `#9dbdcb`
 *
 * ⚠️ Bu renk setin EN SÖNÜĞÜ ve tek düşük doygunluklu rengidir — bilinçli:
 * _"Sözleşme ekranı dikkat çekmek için değil OKUMAK için vardır."_ Nötr olduğu
 * için Randevu'nun petroline hue olarak yakın olması sorun değildir; göz onu
 * "gri" okur.
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * ADR-0025 / ADR-0031 disiplini: **platform mekanizmayı sahiplenir, modül
 * kimliğini DEKLARE eder.** ⚠️ BU MODÜL O KURALIN BEŞİNCİ SINAVIDIR ve
 * `app-shell.tsx`'e YİNE DOKUNULMADI.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Belge'de v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0037 §8, §12 — "belgeyi özetle" v2 listesinde). Belgenin içeriği
 * yalnızca merkezî `POST /ask` üzerinden asistana besleniyor; arka planda
 * gömülüyor olması onu ekranda AI çıktısı yapmaz.
 *
 * ⚠️ Bir "belge özeti" eklendiği gün `--ai-accent` / `--ai-ink` kullanmak
 * ZORUNDADIR ve ADR-0037 §9'un `CompletionFailedError` kararı yeniden okunur.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil.
 */
export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="documents" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
