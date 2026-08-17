import type { SVGProps } from 'react';

/**
 * KOBIWISE MARKASI — ADR-0038 §7.
 *
 * ============================================================================
 * NEDEN `icons.tsx` DEĞİL
 * ============================================================================
 * `icons.tsx`'in sözleşmesi tektir ve dosyanın tamamı ona dayanır: 24 kutuluk
 * viewBox, `fill: none`, 1.7 çizgi kalınlığı, `currentColor` KONTUR. Marka
 * işareti bunların hiçbirini taşımaz — dolgu tabanlıdır ve 76×100 orandadır.
 * Oraya koymak ya işareti yanlış `base()` sözleşmesinden geçirmek ya da o
 * dosyada "bu hariç" diye bir istisna açmak olurdu. Marka bir ikon değildir.
 *
 * ============================================================================
 * ⚠️ KELİME LOGOSU UYGULAMA KABUĞUNA GİRMEZ (ADR-0038 §7.3)
 * ============================================================================
 * Kelime logosu ince ağırlıklı ve geniştir; 12px'lik bir gezinme şeridinde
 * cılız ve soluk görünür — tam olarak kaçınılan his. Kabukta YALNIZCA
 * `KobiWiseMark` durur. Tam kilit (`KobiWiseLockup`) giriş ekranı, e-posta ve
 * pazarlama içindir; orada işaretin yanındaki metin gerçekten okunur boydadır.
 *
 * "BUSINESS OS" alt satırı uygulamanın HİÇBİR yerinde kullanılmaz: kullanıcı
 * zaten içindedir.
 *
 * ============================================================================
 * ⚠️ BU BİR YENİDEN ÇİZİMDİR
 * ============================================================================
 * `logo/` altındaki kaynak dosyalar JPEG'dir; işaret vektör olarak yeniden
 * çizildi. Product Owner kelime logosunun vektörüne gerek olmadığını bildirdi
 * (2026-08-14) ve bu tutarlıdır — kelime logosu kabukta kullanılmıyor.
 *
 * Form dili: yuvarlak sonlu dikey gövde + gövdeden AYRI iki açılı kol.
 * Yumuşak/keskin karşıtlığı bilinçlidir ve arayüzde de yankılanır (yuvarlak
 * yüzeyler, keskin veri işaretleri).
 */

type MarkProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>;

/**
 * İşaretin geometrisi — TEK KAYNAK.
 *
 * ⚠️ Aynı yollar `app/icon.svg` ve `app/apple-icon.svg` içinde de duruyor:
 * statik bir SVG dosyası TSX'ten import EDEMEZ. İkizleşme riski gerçektir ve
 * sessizdir — biri güncellenip diğeri unutulursa sekmedeki ikon uygulamadaki
 * işaretten farklı olur ve kimse fark etmez.
 *
 * Risk `brand-assets.spec` ile kapatıldı: test iki dosyayı okuyup buradaki üç
 * yolun ikisinde de birebir geçtiğini doğruluyor.
 */
export const MARK_PATHS: readonly string[] = [
  // Gövde: tam yuvarlak tepe, sol altı yuvarlak taban.
  'M0 9.5A9.5 9.5 0 0 1 19 9.5L19 100L9.5 100A9.5 9.5 0 0 1 0 90.5Z',
  // Üst kol — gövdeden ayrı.
  'M26 55L48 23L74 23L52 55Z',
  // Alt kol.
  'M26 64L52 64L74 96L48 96Z',
];

export const MARK_VIEWBOX = '-2 -2 80 104';

/**
 * K işareti — tek renk, `currentColor`.
 *
 * Yükseklik/genişlik çağıran tarafından verilir. Oran 76:100 olduğu için
 * yalnızca birini vermek yeterlidir; ikisi birden verilirse oran bozulabilir.
 *
 * `aria-hidden` VARSAYILAN DEĞİL: işaret çoğu yerde markayı temsil eden tek
 * öğedir (daraltılmış gezinme şeridi), yani orada erişilebilir bir ada
 * ihtiyacı vardır. Süs olarak kullanıldığı yerde çağıran `aria-hidden` verir.
 */
export function KobiWiseMark({ title, ...props }: MarkProps & { title?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      role={title === undefined ? 'presentation' : 'img'}
      {...(title === undefined ? { 'aria-hidden': true } : {})}
      {...props}
    >
      {title === undefined ? null : <title>{title}</title>}
      {/*
        `stroke` + `stroke-linejoin: round` bilinçli bir tekniktir: dolguyu
        1.1px büyütüp köşeleri yuvarlar. Alternatif her köşeye elle yay
        yazmaktı — aynı görüntü, üç kat uzun yol.
      */}
      <g fill="currentColor" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round">
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * YAZILI LOGO — yer olan HER YERDE marka budur.
 *
 * ============================================================================
 * MARKA SİSTEMİ İKİ VARLIKTIR, BİR "KİLİT" DEĞİL (Product Owner, 2026-08-17)
 * ============================================================================
 * Önceki yazımda işaret ve yazı tek bir kilitte birleştirilip her yere o
 * konmuştu. Product Owner düzeltti ve kural şu:
 *
 *   | Varlık          | Nerede                                                |
 *   | --------------- | ----------------------------------------------------- |
 *   | **K işareti**   | YALNIZCA yer olmayan yüzeyler: favicon, mobil uygulama |
 *   |                 | ikonu, daraltılmış koridor                            |
 *   | **Yazılı logo** | Yer olan her yer: giriş ekranı, geniş koridor          |
 *
 * ⚠️ İkisi YAN YANA KULLANILMAZ. Bir markanın adı zaten yazılıyken yanına bir
 * de baş harfini koymak, aynı şeyi iki kez söylemektir — ve iki farklı ağırlık
 * yan yana durduğu için kompozisyonu da zayıflatır. Küçük yüzeylerde işaret
 * yazının YERİNE geçer, yanına değil.
 *
 * ============================================================================
 * OPTİK TAKİP — punto büyüdükçe SIKILAŞIR
 * ============================================================================
 * Sabit bir `letter-spacing` her boyutta yanlıştır: aynı `em` değeri büyük
 * puntoda gereğinden gevşek, küçük puntoda gereğinden sıkı görünür. Gerçek
 * yazı tipi aileleri bunu optik boyutlarla çözer; tek ağırlığımız olduğu için
 * takibi puntoya göre ölçekliyoruz.
 *
 *   20 px → -0.022em   (koridor: harfler birbirine yapışmasın)
 *   34 px → -0.030em   (giriş ekranı)
 *   48 px → -0.036em   (pazarlama)
 *
 * ⚠️ Bu, "güzelleştirme"nin süs değil ÖLÇÜ tarafıdır: aynı wordmark iki farklı
 * boyutta aynı takiple dizilirse biri mutlaka yanlış görünür.
 */
function opticalTracking(size: number): string {
  // 20 px'te -0.022em, 48 px'te -0.036em; arası doğrusal, dışı kırpılır.
  const raw = -0.022 - ((size - 20) / 28) * 0.014;
  const clamped = Math.max(-0.036, Math.min(-0.022, raw));
  return `${clamped.toFixed(4)}em`;
}

export function KobiWiseWordmark({
  size = 28,
  descriptor = false,
}: {
  /** Yazının punto boyu (px). Takip buna göre optik olarak ayarlanır. */
  size?: number;
  /**
   * "BUSINESS OS" alt satırı — kaynak logonun kendi parçası.
   *
   * ⚠️ Yalnızca kullanıcının HENÜZ İÇERİDE OLMADIĞI yüzeylerde açılır (giriş,
   * kayıt, e-posta). Uygulamanın içinde ürünün ne olduğunu anlatmak gereksizdir:
   * kullanıcı zaten kullanıyor.
   */
  descriptor?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-center">
      <span
        className="font-bold whitespace-nowrap text-fg"
        style={{
          fontSize: `${String(size)}px`,
          letterSpacing: opticalTracking(size),
          lineHeight: 1.05,
        }}
      >
        KobiWise
      </span>

      {descriptor ? (
        /*
          Kaynak logodaki alt satır: iki yanı çizgili, geniş takipli versal.
          Çizgiler `flex-1` ile yazının genişliğine UYAR — sabit genişlik
          verilseydi punto değiştiğinde hizadan çıkardı.
        */
        <span
          className="mt-2 flex w-full items-center gap-2.5 text-fg-3"
          style={{ fontSize: `${String(Math.max(8, Math.round(size * 0.26)))}px` }}
        >
          <span aria-hidden className="h-px flex-1 bg-border-strong" />
          {/*
            ⚠️ METİN ZATEN BÜYÜK HARF — `uppercase` KULLANILMAZ.

            Belge `lang="tr"` taşıyor ve CSS `text-transform` DİLE DUYARLIDIR:
            Türkçe kurallarıyla `i` → `İ` olur, yani "Business OS" ekranda
            "BUSİNESS OS" diye çizilirdi. Tarayıcıda görüldü.

            `lang="en"` eklemek de çözerdi ama tarayıcılar arasında daha kırılgan;
            harfleri olduğu gibi yazmak dönüşümü tamamen ortadan kaldırır.
          */}
          <span className="font-mono tracking-[0.34em]">BUSINESS OS</span>
          <span aria-hidden className="h-px flex-1 bg-border-strong" />
        </span>
      ) : null}
    </span>
  );
}
