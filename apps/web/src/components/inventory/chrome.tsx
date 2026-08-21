'use client';

import {
  MOVEMENT_DIRECTION_LABELS,
  STOCK_LEVEL_LABELS,
  stockLevelOf,
  type MovementDirection,
  type StockLevel,
} from '@business-os/contracts';

/**
 * STOK ODASININ KENDİNE ÖZGÜ PARÇALARI.
 *
 * ⚠️ Buradakiler `module-kit`e TAŞINMADI ve sınav basit: "iki modül de bunu
 * aynı şekilde kullanabilir mi?" Hayır — `StockLevelPill` eşik mantığını,
 * `DirectionPill` giriş/çıkış sözlüğünü, `Quantity` ise miktarın dize
 * kalmasını bilir. Üçü de bu modüle özgüdür.
 */

/**
 * EŞİK DURUMU ROZETİ (ADR-0039 §6.1).
 *
 * ============================================================================
 * ⚠️ RENK TEK BİLGİ TAŞIYICISI DEĞİLDİR
 * ============================================================================
 * FRONTEND §4.8'in bağlayıcı kuralı: on iki rengin bir kısmı renk körlüğü
 * altında yakınlaşır. Bu yüzden her rozet SÖZCÜKLE de konuşur ("Kritik",
 * "Azalıyor", "Yeterli") ve kritik olan ayrıca KALIN yazılır. Rengi göremeyen
 * bir kullanıcı hiçbir şey kaybetmez.
 *
 * ⚠️ EŞİK BANDI SUNUCUYLA PAYLAŞILAN SABİTTEN GELİR (`NEAR_THRESHOLD_RATIO`,
 * `contracts`ta). İki tarafta ayrı yazılsaydı ekran "azalıyor" derken yapısal
 * katkıcı sağlıklı sayardı — `CRM_STALE_STAGE_DAYS` ayrışmasının aynı sınıfı.
 */
export function StockLevelPill({
  quantity,
  minQuantity,
}: {
  readonly quantity: string;
  readonly minQuantity: string | null;
}) {
  const level = stockLevelOf({ quantity, minQuantity });

  return (
    <span
      className={[
        'justify-self-start rounded-full border px-2 py-[3px] font-mono text-[8px] tracking-[0.1em] uppercase',
        TONE[level],
      ].join(' ')}
    >
      {STOCK_LEVEL_LABELS[level]}
    </span>
  );
}

const TONE: Readonly<Record<StockLevel, string>> = {
  // ⚠️ Kritik hem rengi hem YAZI AĞIRLIĞINI değiştirir.
  critical: 'border-danger/40 bg-danger/10 font-bold text-danger',
  near: 'border-accent bg-tint text-ink',
  healthy: 'border-border text-fg-3',
  // "İzlenmiyor" bir uyarı DEĞİLDİR: eşiği `null` olan kalem bilinçli olarak
  // izlenmiyordur (§6.1 — `null` ile `0` farklı şeylerdir).
  untracked: 'border-border text-fg-3',
};

/**
 * HAREKET YÖNÜ ROZETİ.
 *
 * ⚠️ İki değer var, üç DEĞİL: "düzeltme" bir yön değildir (ADR-0039 §3.1).
 * Düzeltme olduğu ayrı bir işaretle söylenir (`CorrectionMark`) — çünkü bir
 * düzeltme de ya girişTİR ya çıkışTIR.
 */
export function DirectionPill({ direction }: { readonly direction: MovementDirection }) {
  return (
    <span
      className={[
        'justify-self-start rounded-full border px-2 py-[3px] font-mono text-[8px] tracking-[0.1em] uppercase',
        direction === 'in'
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-border bg-fill text-fg-2',
      ].join(' ')}
    >
      {MOVEMENT_DIRECTION_LABELS[direction]}
    </span>
  );
}

/**
 * DÜZELTME İŞARETİ — yalnızca fiziksel sayımdan doğan satırlarda.
 *
 * ⚠️ Bunu `true` yapabilen TEK yol sayım ucudur. İşaretin değeri şudur:
 * "gerçek akış" ile "sayımda ortaya çıkan fark" bir işletme için FARKLI
 * şeylerdir; ikincisinin toplamı FİRE demektir (ADR-0039 §3.1).
 */
export function CorrectionMark() {
  return (
    <span className="font-mono text-[8px] tracking-[0.1em] text-fg-3 uppercase">
      · sayım düzeltmesi
    </span>
  );
}

/**
 * MİKTAR + BİRİM.
 *
 * ============================================================================
 * ⚠️ MİKTAR DİZE OLARAK YAZILIR — `Number`A ÇEVRİLMEZ (ADR-0039 §4.2)
 * ============================================================================
 * Sunucunun kanonik dizesi (`"12.500"`) olduğu gibi basılır. `Number(...)`
 * çağrısı bir yuvarlama kaymasını KALICI hâle getirirdi ve çıktı bir stok
 * rakamıdır.
 *
 * ⚠️ BİRİM DAİMA YAZILIR ve bu bir bezeme değil: birimsiz bir sayı, farklı
 * kalemlerin toplanabileceğini ima ederdi — "toplam stok" diye bir şey yoktur
 * (§4.1).
 */
export function Quantity({
  value,
  unit,
  negative = false,
}: {
  readonly value: string;
  readonly unit: string;
  /** Negatif miktar FİZİKSEL OLARAK İMKANSIZDIR: kayıt tutarsızdır. */
  readonly negative?: boolean;
}) {
  return (
    <span className={`tabular font-semibold ${negative ? 'text-danger' : 'text-fg'}`}>
      {value} <span className="text-[0.85em] font-normal text-fg-3">{unit}</span>
    </span>
  );
}

/** Türkçe tarih — tek yerde (iki ekran da aynı biçimi kullanmak zorunda). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}
