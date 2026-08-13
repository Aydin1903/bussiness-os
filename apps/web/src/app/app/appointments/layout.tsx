import type { ReactNode } from 'react';

/**
 * Randevu'nun renk kapsamı — modülün imza rengi BURADA deklare edilir.
 *
 * ============================================================================
 * ⚠️ ANAHTAR `appointments`, `booking` DEĞİL — ve `randevu` da DEĞİL
 * ============================================================================
 * Palet `module-colors.css`'te bir dönem `[data-module='booking']` altında
 * duruyordu; ADR-0035 §1.1 onu `appointments` yaptı. Şemanın adı, modülün adı
 * ve bu anahtar ÜÇÜ DE aynı kelimedir.
 *
 * On iki modülün hepsi İNGİLİZCE anahtar taşır; Türkçe olan yalnızca
 * ETİKETTİR ("Randevular"). Anahtar yanlış yazılırsa hata SESSİZDİR:
 * eşleşmeyen bir `[data-module]` seçicisi hiçbir şey ezmez, ekran çalışmaya
 * devam eder ve yalnızca terracotta kalır.
 *
 * Renk `module-colors.css`'te ZATEN AYRILMIŞTIR ve burada ÜRETİLMEZ:
 *   açık `#057a89` / ink `#006a77` · koyu `#51b5c5` / ink `#64c6d7`
 *
 * ============================================================================
 * NEDEN KABUKTA DEĞİL, MODÜLÜN KENDİ LAYOUT'UNDA
 * ============================================================================
 * `data-module` kabuğa (`app-shell.tsx`) konsaydı orada merkezî bir
 * `pathname → modül` haritası tutmak gerekirdi. ADR-0025 / ADR-0031 ile aynı
 * disiplin: **platform mekanizmayı sahiplenir, modül kimliğini DEKLARE eder.**
 *
 * ⚠️ BU MODÜL O KURALIN DÖRDÜNCÜ SINAVIDIR ve `app-shell.tsx`'e YİNE
 * DOKUNULMADI.
 *
 * ============================================================================
 * AI'IN SESİ — BU MODÜLDE HİÇ GÖRÜNMÜYOR
 * ============================================================================
 * Bu div `--ai-accent` / `--ai-ink` token'larına DOKUNMAZ ve bu ekranların
 * hiçbiri onları KULLANMAZ: Randevu'da v1'de modül içi AI yüzeyi YOKTUR
 * (ADR-0035 §7). Servis notu KULLANICININ yazdığı metindir, asistanın ürettiği
 * değil — arka planda gömülüyor olması onu AI çıktısı yapmaz.
 *
 * ⚠️ Bir "randevu özeti" (ADR-0032'nin müşteri özetinin karşılığı) eklendiği
 * gün `--ai-accent` / `--ai-ink` kullanmak ZORUNDADIR ve bu madde yeniden
 * bağlayıcı olur.
 *
 * `display: contents` ZORUNLU: bu sarmalayıcı yalnızca bir kapsam işaretidir,
 * bir düzen kutusu değil. Normal bir `div` olsaydı `app-shell` → `ModuleBody`
 * `flex`/`min-h-0` zinciri araya giren blok yüzünden kırılırdı.
 */
export default function AppointmentsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-module="appointments" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
