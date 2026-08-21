'use client';

/**
 * TEDARİKÇİ ODASININ KENDİNE ÖZGÜ PARÇALARI.
 *
 * ⚠️ Buradakiler `module-kit`e TAŞINMADI ve sınav basit: "iki modül de bunu
 * aynı şekilde kullanabilir mi?" Hayır — `PaymentTerms` ödeme koşulunun
 * SERBEST METİN olduğunu, `TaxNumber` ise tekilliğin ona dayandığını bilir.
 */

/**
 * ÖDEME KOŞULLARI — SERBEST METİN OLARAK GÖSTERİLİR (ADR-0040 §1.2).
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN HİÇBİR ŞEY AYRIŞTIRMAZ — VE BU, ONUN ASIL İŞİDİR
 * ============================================================================
 * "60 gün vadeli, 10 gün içinde ödemede %2 iskonto" bir İNSAN CÜMLESİDİR.
 * Buradan bir vade tarihi çıkarmak, bir rozet ("60 gün") üretmek ya da metni
 * regex'le renklendirmek CAZİPTİR ve YANLIŞTIR:
 *
 *   - "60 iş günü" ile "60 gün" arasındaki farkı bir regex BİLMEZ,
 *   - ekran MAKUL GÖRÜNEN YANLIŞ bir tarih gösterir,
 *   - ve hata SESSİZDİR — kullanıcı yazdığını doğru sanır.
 *
 * ⚠️ Aynı gerekçe ADR §3.2'de bir YAPISAL KATKICIYI reddetti ("ödeme vadesi
 * yaklaşan tedarikçiler"). Arayüzde ayrıştırmak, sunucuda reddedilen şeyi
 * arka kapıdan geri getirmek olurdu.
 *
 * ⚠️ Boş hâl "—" ile geçilir, bir uyarıyla DEĞİL: koşul girmemek meşrudur.
 */
export function PaymentTerms({ value }: { readonly value: string | null }) {
  if (value === null) {
    return <span className="text-[11.5px] text-fg-3">ödeme koşulu yazılmamış</span>;
  }

  return (
    <span className="text-[11.5px] leading-[1.5] text-fg-2" title={value}>
      {value}
    </span>
  );
}

/**
 * VERGİ NUMARASI.
 *
 * ⚠️ Yokluğu SESSİZ GEÇİLMEZ ve sebebi §1.1'dir: tekillik
 * `lower(tax_number)` üzerinde zorlanır. Vergi numarası girilmemiş iki kayıt,
 * AYNI TÜZEL KİŞİ olsa bile çakışmaz — yani mükerrer kayıt kapısı açık kalır
 * ve o gün GÖRÜŞME GEÇMİŞİ ikiye bölünür.
 *
 * ⚠️ Yine de bir HATA gibi gösterilmez (kırmızı yok): alan opsiyoneldir ve
 * küçük bir işletme tedarikçisinin vergi numarasını bilmeyebilir.
 */
export function TaxNumber({ value }: { readonly value: string | null }) {
  if (value === null) {
    return (
      <span className="font-mono text-[10.5px] tracking-[0.04em] text-fg-3">vergi no yok</span>
    );
  }

  return <span className="font-mono text-[10.5px] tracking-[0.04em] text-fg-2">{value}</span>;
}

/**
 * TAKVİM GÜNÜ — `YYYY-MM-DD` dizesinden.
 *
 * ⚠️ `new Date(iso)` SAAT DİLİMİ KAYDIRIR: `'2026-08-21'` UTC gece yarısı
 * olarak ayrıştırılır ve UTC−03:00'te BİR ÖNCEKİ GÜN gösterilir. Görüşme
 * tarihi bir TAKVİM GÜNÜDÜR (`date` kolonu), bir an değil — bu yüzden dize
 * ELLE parçalanır.
 *
 * Bu, Randevu'nun `scheduledAt`ından (bir AN) bilinçli farktır.
 */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (year === undefined || month === undefined || date === undefined) {
    return day;
  }

  return new Date(Number(year), Number(month) - 1, Number(date)).toLocaleDateString('tr-TR', {
    dateStyle: 'medium',
  });
}

/** Türkçe tarih — ISO AN'dan (oluşturulma zamanı gibi). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}
