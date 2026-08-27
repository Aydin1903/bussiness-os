'use client';

import type { PointDirection } from '@business-os/contracts';

import { formatPoints } from '@/lib/config/loyalty';

/**
 * Sadakat odasının küçük işaretleri (ADR-0051 §9).
 *
 * ⚠️ Bu dosya `marketing/chrome.tsx` ile aynı sınıftadır: modüle ÖZGÜ
 * işaretler burada yaşar, genel olanlar `module-kit/`te. Bir işaretin
 * `module-kit`e taşınması, İKİNCİ bir modül onu isteyince değerlendirilir
 * (ADR-0033 Slice 5a'nın dersi: "ikinci modül bir şeyin genel olup olmadığını
 * öğrendiğimiz yerdir").
 */

/**
 * Bir defter satırının yönü — ⚠️ İŞARET METİNDE, RENKTE DEĞİL.
 *
 * ============================================================================
 * ⚠️ RENK HİÇBİR YERDE TEK AYIRT EDİCİ OLMAZ (FRONTEND §4.8)
 * ============================================================================
 * "Kazanım yeşil, kullanım kırmızı" sezgisel görünür ama renk körlüğü altında
 * İKİSİ AYNI görünür — ve bu, bir bakiye hareketinde kabul edilemez bir
 * belirsizliktir. Bu yüzden yön ÜÇ AYRI kanaldan okunur:
 *
 *   1. İŞARET  — `+` / `−` (metin, her koşulda okunur)
 *   2. ETİKET  — "Kazanım" / "Kullanım"
 *   3. Ekran okuyucu için `aria-label` (sembol tek başına okunmaz)
 *
 * ⚠️ Modülün imza rengi burada KULLANILMAZ. Odanın rengi vurgu içindir; bir
 * defter satırı vurgu değil, KAYITTIR.
 */
export function DirectionMark({
  direction,
  points,
}: {
  readonly direction: PointDirection;
  readonly points: number;
}) {
  const earned = direction === 'earn';
  const label = earned ? 'Kazanım' : 'Kullanım';
  // ⚠️ U+2212 (matematiksel eksi), ASCII tire DEĞİL: tire bazı yazı
  // tiplerinde tireleme sanılır ve dar ekranda kaybolur.
  const sign = earned ? '+' : '−';

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className="tabular text-[13px] font-semibold tracking-[-0.02em] text-fg"
        aria-label={`${label} ${String(points)} puan`}
      >
        {sign}
        {formatPoints(points)}
      </span>
      <span className="font-mono text-[8.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">
        {label}
      </span>
    </span>
  );
}

/**
 * Bir hesabın bakiyesi.
 *
 * ⚠️ NEGATİF BİR BAKİYE GÖRÜNÜR OLMALIDIR — ve bu bir süs değil, ADR-0051
 * §4.4'ün DOĞRUDAN SONUCUDUR:
 *
 * > "Bakiye negatife düşemez" bir SATIRLAR ARASI koşuldur ve bir `CHECK` onu
 * > göremez. Tek dayanak tek kod yolu + `SELECT … FOR UPDATE` kilididir.
 * > ⚠️ Kilit bir gün atlanırsa negatif bir bakiye OLUŞABİLİR — ama bu
 * > **GÖRÜNÜRDÜR**.
 *
 * ⚠️ İşte burası "görünür" olduğu yerdir. Sıfırın altını sessizce `0` diye
 * göstermek, ADR'nin kabul ettiği tek riski GÖRÜNMEZ kılardı — yani gürültülü
 * bir yanlışlığı sessiz bir yanlışlığa çevirirdi.
 */
export function BalanceMark({ balance }: { readonly balance: number }) {
  const negative = balance < 0;

  return (
    <span
      className={`tabular text-[15px] leading-none font-bold tracking-[-0.028em] ${
        negative ? 'text-ink' : 'text-fg'
      }`}
      title={negative ? 'Negatif bakiye — beklenmeyen bir durum' : undefined}
    >
      {formatPoints(balance)}
      <span className="ml-1 text-[10px] font-semibold text-fg-3">puan</span>
    </span>
  );
}

/**
 * Adı çözülemeyen hesap işareti (ADR-0051 §9.2).
 *
 * ============================================================================
 * ⚠️ BU MODÜLDE SARKAN İŞARETÇİ İLK KEZ KAYDI **KULLANILAMAZ** KILIYOR
 * ============================================================================
 * Randevu, Geri Bildirim ve Kampanya'da `contactName: null` gelince arayüz
 * HİÇBİR ŞEY yazmıyordu — ad orada bir SÜSLEMEYDİ. Burada değil: adı olmayan
 * bir sadakat hesabı, kimin olduğu bilinmeyen bir bakiyedir ve müşteri
 * geldiğinde BULUNAMAZ.
 *
 * ⚠️ Ama satır LİSTEDEN DÜŞMEZ — düşseydi bakiye görünmez olurdu ve duvarın
 * toplamı listeyle TUTMAZDI.
 *
 * ⚠️ "Silinmiş" DENMEZ: o kelime, silinmiş bir kaydın BİR ZAMANLAR VAR
 * OLDUĞUNU sızdırır (ADR-0035'in yazılı kararı). Üç durum ayırt edilemez —
 * kişi silinmiş · başka tenant'ın · `contact:read` yok.
 */
export function UnresolvedContact() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-2">
      <span aria-hidden className="text-[10px]">
        ◌
      </span>
      Müşteri kaydı bulunamadı
    </span>
  );
}

/** `earn` / `spend` dışındaki bir değer buraya HİÇ ULAŞMAZ (Zod eler). */
export function toPointDirection(value: string): PointDirection | null {
  return value === 'earn' || value === 'spend' ? value : null;
}
