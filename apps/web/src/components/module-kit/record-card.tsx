import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Kayıt kartı — `memory-rail.tsx › RailNote`'un ana sütundaki hâli.
 *
 * ============================================================================
 * REÇETE AYNEN ALINDI
 * ============================================================================
 * Kenarlık, zemin, köşe, gölge, geçiş süresi (260ms), eğri (`ease-rise`),
 * kalkma miktarı (-2px) ve hover'da kenardan ısınan terracotta çubuk —
 * hepsi RailNote'tan birebir. Tek fark DOLGU: raydaki kart 296px'lik bir
 * sütunda yaşıyor ve `px-[15px] py-[13px]` taşıyor; buradaki kart 720px'lik
 * ana sütunda. Oran korunarak bir kademe büyütüldü (18/15). Yeni bir ölçü
 * ailesi açılmadı.
 *
 * ============================================================================
 * TIKLANABİLİRLİK: KART LİNK DEĞİL, BAŞLIK LİNK
 * ============================================================================
 * Kartın tamamını `<a>` yapmak, içindeki "Sil"/"Düzenle" düğmelerini bir
 * bağlantının İÇİNE koyardı — geçersiz HTML ve ekran okuyucuda anlamsız.
 * Bunun yerine başlık, `after:absolute after:inset-0` ile kartın tamamına
 * yayılan bir bağlantıdır; eylem düğmeleri `relative z-10` ile o örtünün
 * ÜSTÜNDE kalır. Sonuç: kartın her yeri tıklanır, düğmeler yine de kendi
 * işini yapar ve DOM geçerli kalır.
 */

/**
 * ============================================================================
 * YOĞUNLUK — dolgu 18/15 → 22/20 (Product Owner kararı)
 * ============================================================================
 * Teşhis dolgu değil ORAN'dı: 720px genişliğinde bir kartta iki kısa satır,
 * dolgu ne kadar kalın olursa olsun seyrek görünür — boşluk yatayda birikir.
 * Bu yüzden iki şey birden değişti: kart nefes aldı (dolgu + satır aralığı +
 * başlık boyu) ve kart GENİŞLİĞİNİ HAK EDEN gerçek bir bilgi satırı kazandı
 * (yetkili/fırsat sayaçları). Yalnızca dolguyu artırmak kartı uzatır, doldurmaz.
 *
 * `RailNote` (296px, 15/13) kendi genişliğine göre zaten doygundur; buradaki
 * ölçü onun ana sütundaki karşılığıdır, yeni bir ölçü ailesi değil.
 */
const CARD = [
  'group relative flex flex-col gap-[10px] overflow-hidden rounded-card px-[22px] py-[20px]',
  'border border-border bg-surface shadow-card',
  'transition-[transform,box-shadow] duration-[260ms] ease-rise',
  'hover:-translate-y-[2px] hover:shadow-float',
].join(' ');

/** Hover'da kenardan ısınan terracotta çubuk — RailNote ile birebir. */
function HoverBar() {
  return (
    <span
      aria-hidden
      className={[
        'absolute top-4 bottom-4 left-0 w-[2.5px] origin-center scale-y-[0.25] rounded-r-[3px] bg-accent',
        'opacity-0 transition-[opacity,transform] duration-[260ms] ease-rise',
        'group-hover:scale-y-100 group-hover:opacity-100',
      ].join(' ')}
    />
  );
}

export function RecordCard({ children }: { children: ReactNode }) {
  return (
    <div className={CARD}>
      <HoverBar />
      {children}
    </div>
  );
}

/**
 * Kartın başlığı ve aynı zamanda kartın bağlantısı (yukarıdaki örtü tekniği).
 *
 * `focus-visible` halkası `globals.css`'ten gelir; örtü `<a>`'nın kendisinde
 * olduğu için klavye odağı da kartın tamamını temsil eder.
 */
export function CardTitleLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[15px] font-semibold tracking-[-0.012em] text-fg transition-colors duration-[260ms] ease-rise after:absolute after:inset-0 group-hover:text-ink"
    >
      {children}
    </Link>
  );
}

/** Bağlantısız kart başlığı (kişi kartı gibi kendi sayfası olmayan kayıtlar). */
export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[15px] font-semibold tracking-[-0.012em] text-fg">{children}</h3>;
}

/**
 * İkincil bilgi satırı — sektör, e-posta, telefon…
 *
 * Ayraç `·` ve `text-fg-4`: Panel'in üst satırındaki istatistik ayracıyla aynı.
 * Boş (`null`) alanlar ÇİZİLMEZ; "—" yazmak boş bir alanı doldurulmuş gibi
 * gösterirdi.
 */
export function CardMeta({ items }: { items: readonly (string | null)[] }) {
  const shown = items.filter((item): item is string => item !== null && item !== '');

  if (shown.length === 0) {
    return null;
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[1.55] text-fg-2">
      {shown.map((item, index) => (
        <span key={item} className="inline-flex items-center gap-2">
          {index === 0 ? null : (
            <span aria-hidden className="text-fg-4">
              ·
            </span>
          )}
          {item}
        </span>
      ))}
    </p>
  );
}

/** Kartın sağ üstündeki eylem şeridi — başlık örtüsünün ÜSTÜNDE durur. */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className="relative z-10 flex shrink-0 items-center gap-1">{children}</div>;
}

/**
 * Kart içi sessiz eylem düğmesi.
 *
 * Dolgu YOK: kartın kendisi zaten yüzen bir yüzey ve içine ikinci bir yüzen
 * yüzey koymak derinlik sırasını bozar. Hover'da `--fill` kullanılır —
 * `surface`/`raised` DEĞİL (globals.css'in açıkça uyardığı hata: açık temada
 * ikisi de neredeyse beyazdır ve beyaz kartın üstünde görünmez).
 */
export function CardAction({
  children,
  onClick,
  danger = false,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /**
   * Ekran okuyucu adı — görünen metin "Düzenle" iken bile HANGİ kaydın
   * düzenleneceğini söyler.
   *
   * Şirket detayında iki "Düzenle" düğmesi aynı anda bulunur (şirketin kendisi
   * ve her kişi). Görsel kullanıcı hangisinin neye ait olduğunu konumdan
   * anlar; ekran okuyucu kullanıcısı yalnızca "Düzenle, Düzenle, Düzenle"
   * duyar. Testte de bu ayrımsızlık "found multiple elements" olarak yakalandı.
   */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      className={[
        'rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium tracking-[-0.004em]',
        'transition-colors duration-150',
        danger
          ? 'text-fg-3 hover:bg-fill hover:text-danger'
          : 'text-fg-3 hover:bg-fill hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
