import { LOW_RATING_MAX, MAX_RATING } from '@business-os/contracts';

/**
 * Geri bildirim odasının küçük gösterim parçaları (ADR-0045 §9).
 *
 * `suppliers/chrome.tsx` ile aynı sınıf: modüle özgü, tek satırlık okuma
 * yardımcıları. `module-kit`e ÇIKARILMAZLAR — hiçbiri genel değil.
 */

/**
 * PUAN ROZETİ — `n/5`.
 *
 * ============================================================================
 * ⚠️ YILDIZ DEĞİL, SAYI — VE BU BİLİNÇLİ
 * ============================================================================
 * Beş yıldız çizmek "4" ile "4,2"yi aynı görüntüye indirir ve kullanıcı kaç
 * yıldızın dolu olduğunu SAYMAK zorunda kalır. Sayı doğrudan okunur.
 *
 * ⚠️ RENK TEK AYIRT EDİCİ DEĞİLDİR: düşük puan hem TON hem `title` metniyle
 * işaretlenir. `module-colors.css`in bağlayıcı kuralı (renk körlüğü) bu
 * modülde ayrıca önemlidir — kapı zaten dört renkli yeşil bandın içinde.
 *
 * ⚠️ Eşik `LOW_RATING_MAX` — BURADA İCAT EDİLMEZ. Sunucu aynı sabiti sayar;
 * iki tarafta ayrı yazılsaydı ekran "≤2" der, sunucu başka bir sayı sayardı
 * ve fark SESSİZ olurdu.
 */
export function RatingBadge({ value }: { readonly value: number }) {
  const low = value <= LOW_RATING_MAX;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
        low ? 'bg-accent-tint text-ink' : 'bg-fill-2 text-fg-2'
      }`}
      title={low ? 'Düşük puan' : 'Puan'}
    >
      {value}
      <span className="text-fg-3">/{MAX_RATING}</span>
    </span>
  );
}

/**
 * KANAL ETİKETİ — olduğu gibi basılır.
 *
 * ⚠️ HİÇBİR ŞEY AYRIŞTIRILMAZ ve normalize EDİLMEZ (§1.5): `"google"` ile
 * `"Google"` iki ayrı değerdir ve öyle gösterilir. Arayüzde birleştirmek,
 * sunucuda gruplanamayan bir veriyi gruplanabilir GÖSTERİRDİ — kullanıcı
 * ekranda tek bir "Google" görür, bir rapor iki satır sayardı.
 */
export function Channel({ value }: { readonly value: string | null }) {
  if (value === null) {
    return <span className="text-fg-3">Kanal belirtilmemiş</span>;
  }

  return <span className="text-fg-2">{value}</span>;
}

/**
 * YORUM — ya da yokluğunun AÇIKÇA söylenmesi.
 *
 * ============================================================================
 * ⚠️ "ARANAMIYOR" BİR SÜS DEĞİL, MODÜLÜN KENDİ SINIRININ EKRANDAKİ HÂLİ
 * ============================================================================
 * Yorumsuz bir kaydın gömülecek metni yoktur (§1.4), dolayısıyla `POST /ask`
 * havuzunda HİÇBİR SESİ OLMAZ (§3.5). Bunu söylememek, kullanıcının "neden
 * asistan bu puanı bilmiyor" sorusunu CEVAPSIZ bırakırdı.
 *
 * Belge modülünün `chunkCount: 0` → "Aranamıyor" rozetiyle aynı desen, ikinci
 * kez.
 */
export function Comment({ value }: { readonly value: string | null }) {
  if (value === null) {
    return (
      <p className="text-[12px] leading-[1.6] text-fg-3">
        Yorum yok — <span className="text-fg-3">bu kayıt asistanın aramasına girmez.</span>
      </p>
    );
  }

  return <p className="text-[12.5px] leading-[1.65] text-fg">{value}</p>;
}

/**
 * Tarih — `YYYY-MM-DD` yerine okunur biçim.
 *
 * ⚠️ `receivedAt` bir ANDIR (`timestamptz`) ama listede yalnızca GÜN
 * gösterilir: saat, bir geri bildirimin okunmasında anlamlı bir boyut değil.
 * Sıralama yine tam ana göre yapılır (sunucuda), yani aynı gün içindeki sıra
 * korunur.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
