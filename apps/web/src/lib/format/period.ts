/**
 * DÖNEM — oda duvarının kahraman rakamı için (ADR-0038 §5).
 *
 * ============================================================================
 * NEDEN BİR DÖNEM GEREKTİ
 * ============================================================================
 * `GET /finance/summary` tarih verilmezse TÜM ZAMANLARI toplar. O rakam bir
 * duvar kahramanı olamaz: "1.284.500" tek başına bir afiştir, karşılaştırması
 * olmayan bir sayı karar ürettirmez. Duvar kuralı üç şey ister — dönem,
 * değişim, eğilim — ve üçü de bir döneme ihtiyaç duyar.
 *
 * ⚠️ YENİ BİR API UCU AÇILMADI. `from`/`to` zaten destekleniyordu; delta,
 * ÖNCEKİ dönem için ikinci bir çağrıyla türetiliyor. Sunucuya "bana deltayı
 * ver" demek daha ucuz olurdu ama bu bir modül değişikliği olurdu ve ADR-0038
 * yalnızca arayüzü kapsıyor.
 *
 * ⚠️ TARİHLER YEREL, UTC DEĞİL. `calendarDay` bir takvim günüdür (`YYYY-MM-DD`),
 * bir zaman damgası değil. `toISOString()` kullanmak, UTC+3'te ayın 1'i saat
 * 02:00'de bir önceki AYA düşürürdü — sessiz ve yılda on iki kez yanlış.
 */

export interface Period {
  /** `YYYY-MM-DD`, dahil. */
  readonly from: string;
  /** `YYYY-MM-DD`, dahil. */
  readonly to: string;
  /** Ekranda görünen ad — "Ağustos 2026". */
  readonly label: string;
}

const MONTHS: readonly string[] = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Yerel takvim gününü `YYYY-MM-DD` olarak yazar — UTC'ye HİÇ uğramadan. */
function calendarDay(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `offset` ay öncesinin tam ayı. `0` = içinde bulunulan ay.
 *
 * `new Date(y, m + 1, 0)` ayın SON gününü verir ve artık yılı da doğru bilir —
 * elle "30 mu 31 mi" hesaplamak bu yüzden yapılmadı.
 */
export function monthPeriod(offset = 0, now: Date = new Date()): Period {
  const year = now.getFullYear();
  const month = now.getMonth() - offset;

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  return {
    from: calendarDay(first),
    to: calendarDay(last),
    label: `${MONTHS[first.getMonth()] ?? ''} ${String(first.getFullYear())}`,
  };
}

/**
 * Yüzde değişim — iki kanonik para dizesi arasında.
 *
 * ============================================================================
 * ⚠️ BURADAKİ `Number()` ÇAĞRILARI SADECE ORAN İÇİNDİR
 * ============================================================================
 * `category-bars.tsx`'in aynı kuralı: parse edilen değer EKRANA HİÇ YAZILMAZ.
 * Ekrandaki tutar daima sunucunun kanonik dizesidir. Yüzdede kayan nokta
 * hatası görünmez (%0,001'lik sapma bir yüzdede ölçülemez), ama aynı hata bir
 * TUTARDA görünürdü — ayrım bu yüzden korunuyor.
 *
 * `null` döner ve bu bir hata değil bir CEVAPTIR:
 *   - önceki dönem sıfırsa oran tanımsızdır (sıfıra bölme)
 *   - dizelerden biri sayı değilse uydurma yapılmaz
 * Çağıran `null` gördüğünde delta'yı HİÇ çizmez; "%0" yazmak yanlış olurdu.
 */
export function percentChange(current: string, previous: string): number | null {
  const now = Number(current);
  const before = Number(previous);

  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) {
    return null;
  }

  return Math.round(((now - before) / Math.abs(before)) * 100);
}
