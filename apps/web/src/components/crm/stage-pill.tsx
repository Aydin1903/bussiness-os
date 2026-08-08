import { OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from '@business-os/contracts';

/**
 * Aşama rozeti — RENKLE DEĞİL, DOLULUKLA ayrışır.
 *
 * ============================================================================
 * NEDEN BEŞ RENK YOK
 * ============================================================================
 * Beş aşama var, modülün TEK imza rengi var. Yaygın çözüm her aşamaya bir renk
 * vermektir — yeşil kazanıldı, kırmızı kaybedildi, mavi görüşülüyor. Bu,
 * Atölye'nin bütün renk disiplinini tek bileşende çökertirdi: `globals.css`'te
 * tanımlı olmayan üç yeni renk ekranın en çok tekrarlanan öğesine girer ve
 * sistem oradan dağılırdı.
 *
 * ⚠️ MODÜL BAŞINA RENK BU KARARI DEĞİŞTİRMEZ, GÜÇLENDİRİR (2026-08-08).
 * Artık on iki imza rengi var ama bir EKRANDA hâlâ tek bir tanesi geçerlidir;
 * aşama rozeti bulunduğu modülün rengini okur. Aşamaya göre renk vermek, o tek
 * rengi beşe bölüp modül kimliğini de yok ederdi.
 *
 * Bunun yerine ayrım TON YOĞUNLUĞUYLA yapılır ve hattın ilerleyişi görsel
 * olarak "ısınma" gibi okunur (aşağıda "imza rengi" = CRM'de çivit mavisi):
 *
 *   potential      boş kenarlık, soluk metin   → henüz bir şey yok
 *   in_discussion  nötr dolgu                  → temas var
 *   proposal_sent  imza rengi tint + ink       → sıcak
 *   won            DOLU imza rengi             → kapandı, kazanıldı
 *   lost           soluk, dolgusuz             → kapandı, geçti
 *
 * `--danger` KAYIP için kullanılmadı: o bir HATA rengidir ve kaybedilen bir
 * anlaşma hata değildir. Kayıp, dikkat çekmemesi gereken bir sonuçtur —
 * sönükleşerek geri çekilir.
 */
const STAGE_STYLES: Readonly<Record<OpportunityStage, string>> = {
  potential: 'border border-border text-fg-3',
  in_discussion: 'bg-fill text-fg-2',
  proposal_sent: 'bg-tint text-ink',
  won: 'bg-accent text-accent-fg shadow-card',
  lost: 'border border-border text-fg-4',
};

export function StagePill({ stage }: { stage: OpportunityStage }) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px]',
        'font-mono text-[9.5px] font-semibold tracking-[0.08em] uppercase',
        STAGE_STYLES[stage],
      ].join(' ')}
    >
      {OPPORTUNITY_STAGE_LABELS[stage]}
    </span>
  );
}

/**
 * Tahmini değer — `1.250.000 TRY`.
 *
 * ⚠️ Sunucu `numeric`i STRING olarak taşır ve burada da string kalır: `Number`'a
 * çevirmek 14 haneli bir tutarda kayan nokta hassasiyetini kaybettirebilir.
 * Yalnızca binlik ayracı eklenir, aritmetik YAPILMAZ.
 *
 * Ayraç `Intl` ile değil elle konur: locale'e bağlı biçimleme sunucu ile
 * istemcide farklı çıktı verip hydration uyuşmazlığı üretebilir
 * (`lib/format/datetime.ts`'in aynı gerekçesi).
 */
export function formatMoney(value: string | null, currency: string | null): string | null {
  if (value === null) {
    return null;
  }

  const [whole = '', fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Kuruş yalnızca SIFIRDAN FARKLIYSA yazılır: "250.000" ile "250.000,00"
  // aynı bilgiyi taşır, ikincisi listeyi gürültüyle doldurur.
  const withFraction =
    fraction === undefined || Number(fraction) === 0 ? grouped : `${grouped},${fraction}`;

  return currency === null ? withFraction : `${withFraction} ${currency}`;
}
