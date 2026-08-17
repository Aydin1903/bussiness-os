import type { ReactNode } from 'react';

/**
 * ODA — ADR-0038'in iskeleti. Beş odanın da paylaştığı tek bileşen ailesi.
 *
 * ============================================================================
 * BİR ODA İKİ BÖLGEDİR — VE BU, ESKİZİN ÖLÜMCÜL AÇIĞINI KAPATIR
 * ============================================================================
 * Konsept eskizi "tek dev nesne + uydular" diyordu ve 200 satırlık bir işlem
 * listesi oraya SIĞMIYORDU. Çözüm ikinci bir yüzeydir:
 *
 *   DUVAR  (`Wall`)  → "ne oluyor"    — kahraman rakam · uydular · AI'ın cümlesi
 *   TEZGAH (`Desk`)  → "ne yapacağım" — yoğun liste, aynı odanın ışığında
 *
 * Sekme YOK, mod değiştirme YOK: ikisi aynı dikey kaydırmadadır. Gerekçe
 * kullanıcı modelidir — KobiWise'ı açan işletme sahibi önce durumu görür,
 * sonra kalemlere iner.
 *
 * ============================================================================
 * ⚠️ BURADA MODÜLE ÖZGÜ HİÇBİR ŞEY YOKTUR
 * ============================================================================
 * `module-kit`'in dersi burada ilk günden uygulanıyor: sınav "beş oda da bunu
 * aynı şekilde kullanabilir mi?". Cevap hayırsa parça modülün kendi klasöründe
 * kalır. Renk de buraya yazılmaz — `--accent` / `--accent-rgb` alt ağaçtan
 * gelir (`module-colors.css`), yani bu dosya on iki modülün hiçbirini bilmez.
 */

/** Giriş sahnelemesi — `panel/stream.tsx › RISE` ile aynı kademeler. */
export const ROOM_RISE = { top: 0, wall: 90, ai: 220, desk: 320 } as const;

/**
 * ODANIN TEK IZGARASI — duvar ve tezgah AYNI kenarlardan başlar.
 *
 * ============================================================================
 * ⚠️ BU BİR ORANTI HATASININ DÜZELTMESİDİR (Product Owner, 2026-08-17)
 * ============================================================================
 * Bildirilen sorun: _"özet kısmı çok büyük ama son notlar küçük ve ortada …
 * göz yoruyor büyüklü küçüklü olunca"_.
 *
 * Sebep dolgu ya da punto değildi, **İKİ AYRI IZGARAYDI**: duvar tam genişlikte
 * (`px-5 md:px-9`), tezgah ise 760 px'de ORTALANMIŞ (`mx-auto max-w-[760px]`).
 * 1280 px'lik bir ekranda duvar ~1220 px, tezgah 760 px oluyordu ve ikisinin
 * SOL KENARI hizalanmıyordu. Göz iki ayrı kompozisyon görüyor, biri diğerinin
 * içinde yüzüyor gibi duruyordu.
 *
 * Çözüm tek bir ölçüdür: her bölge aynı `max-w` ve aynı yatay dolguyu kullanır,
 * yani **sol kenarlar üst üste oturur**. Hizalanmış kenar, farklı boyuttaki
 * öğeleri tek bir kompozisyon olarak okutan şeydir — büyüklük farkı sorun
 * değildi, HİZASIZLIK sorundu.
 *
 * ⚠️ Ekran başına elle `max-w` yazılmaz. Bir ekran kendi ölçüsünü seçerse
 * hata SESSİZDİR: o ekran tek başına iyi görünür, yalnızca diğerleriyle
 * karşılaştırıldığında bozulur — ve kimse iki ekranı yan yana koymaz.
 */
const MEASURE = 'mx-auto w-full max-w-[1180px] px-5 md:px-9';

/**
 * Odanın tuvali.
 *
 * `room-canvas` sınıfı `globals.css`'tedir: oda renginin ince yıkaması + sol
 * üstten gelen ışık hüzmesi. Sınıf `--accent-rgb`yi okur, o da modülün
 * `layout.tsx`'indeki `data-module`den gelir — bu bileşen hiçbir modül adı
 * taşımaz.
 */
export function Room({ children }: { children: ReactNode }) {
  return <div className="room-canvas flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}

/**
 * Odanın kaydırma alanı — DUVAR VE TEZGAH BURADA BİRLEŞİR.
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN BİR HATANIN DÜZELTMESİDİR — çalışan uygulamada bulundu
 * ============================================================================
 * İlk yazımda `Desk` kendi `overflow-y-auto`sunu taşıyordu ve duvar SABİTTİ.
 * Geniş bir ekranda doğru görünüyordu; 1280×720 / DPR 1.5 bir dizüstünde
 * (CSS görünüm alanı **529 px**) duvar tüm yüksekliği yiyor ve tezgaha
 * ~20 px kalıyordu — başlığı görünüyor, içeriği görünmüyordu.
 *
 * Asıl mesele estetik değil: ADR-0038 §1 "sekme YOK, mod değiştirme YOK —
 * ikisi AYNI DİKEY KAYDIRMADADIR" diyor. İki ayrı kaydırma alanı o kararın
 * ihlaliydi. Doğrusu tek bir kaydırıcıdır: aşağı inildikçe duvar yukarı
 * kayar ve tezgah tüm ekranı alır — işletme sahibi önce durumu görür, sonra
 * kalemlere iner.
 *
 * ⚠️ Yazma alanı (Panel'in `Composer`ı) bunun DIŞINDA kalır: o bir footer'dır
 * ve kaydırmayla kaybolmamalıdır.
 */
export function RoomScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>;
}

/**
 * Odanın üst şeridi — oda adı solda, birincil eylem sağda.
 *
 * ⚠️ EKRAN BAŞINA BİR birincil eylem. İkincisi eklenmek istendiğinde doğru yer
 * tezgahın başlığıdır; üst şerit "bu odada yapılacak asıl iş" için ayrılmıştır.
 */
export function RoomTop({
  name,
  meta,
  action,
}: {
  name: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header
      className={`${MEASURE} flex flex-wrap items-center justify-between gap-x-5 gap-y-3 pt-6`}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="font-mono text-[9.5px] font-semibold tracking-[0.2em] text-ink uppercase">
          {name}
        </h1>
        {meta === undefined ? null : (
          <span className="truncate font-mono text-[9.5px] tracking-[0.14em] text-fg-3 uppercase">
            {meta}
          </span>
        )}
      </div>
      {action}
    </header>
  );
}

/**
 * Duvar — kahraman solda, uydular sağda.
 *
 * `items-end`: kahraman rakam çok büyük, uydu kartları küçük. Üstten
 * hizalamak rakamın altında bir boşluk bırakır ve iki sütun ayrı ayrı yüzer
 * gibi görünür; alttan hizalamak ikisini tek bir taban çizgisine oturtur.
 */
export function Wall({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${MEASURE} grid grid-cols-1 items-end gap-7 pt-5 pb-8 md:grid-cols-[1.35fr_1fr]`}
    >
      {children}
    </div>
  );
}

/**
 * Kahraman — odanın tek dev nesnesi.
 *
 * ============================================================================
 * ⚠️ RAKAM TEK BAŞINA BIRAKILMAZ (ADR-0038 §5)
 * ============================================================================
 * Bağlamsız büyük sayı bir AFİŞTİR, araç değil. `label` dönemi, `delta`
 * karşılaştırmayı, `trend` eğilimi söyler. "1.284.500" bir bilgi değildir;
 * "geçen aya göre %12 artı" bir karardır.
 *
 * Bu yüzden `label` ZORUNLU bir prop'tur — isteğe bağlı olsaydı unutulur ve
 * duvarda etiketsiz bir sayı kalırdı.
 */
export function Hero({
  label,
  children,
  delta,
  trend,
}: {
  label: string;
  children: ReactNode;
  delta?: ReactNode;
  trend?: readonly number[];
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] font-semibold tracking-[0.19em] text-fg-3 uppercase">
        {label}
      </p>
      {children}
      {delta === undefined ? null : (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[11.5px] text-fg-2">
          {delta}
        </div>
      )}
      {trend === undefined || trend.length === 0 ? null : <Trend values={trend} />}
    </div>
  );
}

/**
 * Kahraman rakamın kendisi — odanın en büyük tipografisi.
 *
 * ⚠️ `tabular` ZORUNLU: rakam yenilendiğinde (yeni dönem, yeni sayım) genişlik
 * değişip düzen ZIPLAMASIN. Bu boyutta bir zıplama ekranın tamamını sarsar.
 */
export function HeroFigure({ children }: { children: ReactNode }) {
  return (
    <p className="tabular mt-1.5 text-[clamp(38px,6vw,64px)] leading-[0.94] font-bold tracking-[-0.042em] text-fg">
      {children}
    </p>
  );
}

/** Eğilim çubuğu — son değer vurgulanır. Grafik kütüphanesi YOK (FRONTEND §4.10). */
function Trend({ values }: { values: readonly number[] }) {
  const peak = Math.max(...values, 1);

  return (
    <div aria-hidden className="mt-3 flex h-[26px] items-end gap-[3px]">
      {values.map((value, index) => (
        <span
          key={index}
          className={`w-[9px] rounded-[1px] ${
            index === values.length - 1 ? 'bg-accent' : 'bg-fill-2'
          }`}
          style={{ height: `${String(Math.max(3, Math.round((value / peak) * 26)))}px` }}
        />
      ))}
    </div>
  );
}

/** Uydu sütunu — kahramanın yanındaki ikincil ölçümler. */
export function Satellites({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

/**
 * Tek uydu kartı — tuvalden YÜKSELİR.
 *
 * `bg-surface` + gölge: gündüz tuval renkli, kart beyaz; gece tuval koyu, kart
 * ışıklı. İkisinde de kart zeminden ayrılır — derinlik çizgiyle değil katmanla
 * kurulur (Atölye'den devralınan ve korunan kural).
 */
export function Satellite({
  label,
  value,
  note,
  tone = 'plain',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** `accent` sayıyı odanın rengine boyar — "dikkat isteyen" ölçüm. */
  tone?: 'plain' | 'accent';
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card">
      <p className="font-mono text-[8.5px] font-semibold tracking-[0.17em] text-fg-3 uppercase">
        {label}
      </p>
      <p
        className={`tabular mt-0.5 text-[17px] leading-tight font-bold tracking-[-0.028em] ${
          tone === 'accent' ? 'text-ink' : 'text-fg'
        }`}
      >
        {value}
      </p>
      {note === undefined ? null : <p className="mt-0.5 text-[11px] text-fg-2">{note}</p>}
    </div>
  );
}

/**
 * ASİSTANIN SESİ — her odada terracotta, hiçbir oda ezemez.
 *
 * ============================================================================
 * ⚠️ `ai-accent` / `ai-ink` KULLANIR, `accent` DEĞİL
 * ============================================================================
 * Bu, 2026-08-08 kararının oda sistemindeki karşılığıdır ve oda sistemi onu
 * GÜÇLENDİRİR: odalar artık doygun renkli olduğu için terracotta hiçbir odanın
 * rengi değildir. Ekranda terracotta görüldüğünde tek bir şey demektir —
 * "burada asistan konuşuyor".
 *
 * ⚠️ Cümle SÜS DEĞİL: içindeki iddialar bağlantı olmalıdır (ADR-0038 §6).
 * Süslemeyle araç arasındaki fark bu tek kuraldır — bu yüzden `children`
 * serbest `ReactNode`'dur ve çağıran `RoomAiLink` gömer.
 */
export function RoomAi({ children }: { children: ReactNode }) {
  return (
    <div className="mx-5 mb-5 flex items-start gap-2.5 border-l-2 border-ai-accent pl-3 md:mx-9">
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ai-accent" />
      <p className="ai-voice min-w-0 text-[13.5px] leading-[1.55] text-fg">{children}</p>
    </div>
  );
}

/** Asistanın cümlesi içindeki iddia — kanıta götüren bağlantı. */
export function RoomAiClaim({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ai-ink underline decoration-ai-ink/40 underline-offset-2 transition-colors hover:decoration-ai-ink"
    >
      {children}
    </button>
  );
}

/**
 * TEZGAH — odanın çalışma yüzeyi.
 *
 * `mt-auto` YOK ve bu bilinçli: tezgah duvarın hemen ALTINDA başlar, ekranın
 * dibine itilmez. Dibe itmek, az veri olan bir odada duvarla tezgah arasında
 * anlamsız bir boşluk bırakırdı.
 */
export function Desk({ children }: { children: ReactNode }) {
  /*
   * ⚠️ KENDİ KAYDIRMASI YOK — kaydırma `RoomScroll`a aittir (yukarıdaki not).
   * Buraya `overflow-y-auto` geri konursa duvar yeniden sabitlenir ve kısa
   * ekranlarda tezgah ezilir.
   *
   * `min-h-full`: az kayıt varken tezgahın zemini ekranın altına kadar iner;
   * aksi halde tuvalin ortasında yarım kalmış bir yüzey görünürdü.
   */
  return <div className="min-h-full border-t border-border bg-surface/45">{children}</div>;
}

/**
 * Tezgahın içeriği — odanın ızgarasını ZORUNLU kılar.
 *
 * ⚠️ Ekranlar bir süre kendi `mx-auto max-w-[760px]` sarmalayıcılarını
 * yazıyordu; orantı hatası (Product Owner, 2026-08-17) tam olarak buradan
 * doğdu. Bu bileşen o seçimi ellerinden alır: tezgah her odada duvarla aynı
 * kenarlardan başlar.
 */
export function DeskBody({ children }: { children: ReactNode }) {
  return <div className={`${MEASURE} pt-6 pb-8`}>{children}</div>;
}

export function DeskHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className={`${MEASURE} flex items-center justify-between gap-3 py-3`}>
        <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
          {title}
        </p>
        {right}
      </div>
    </div>
  );
}

/**
 * Tezgah satırı — tablo yoğunluğunda, tablo işaretlemesi olmadan.
 *
 * ⚠️ `<table>` KULLANILMADI ve gerekçesi var: satırların çoğu tıklanabilir bir
 * kayda gider ve bir `<tr>` içine bağlantı örtüsü koymak (`after:inset-0`)
 * tablo düzeninde çalışmaz. Sütun hizası `grid` ile kurulur; çağıran
 * `columns` ile şablonu verir.
 */
export function DeskRow({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div
      className={`${MEASURE} grid items-center gap-3 border-b border-border py-2.5 text-[12.5px] transition-colors last:border-b-0 hover:bg-fill`}
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}

/**
 * TEZGAHIN YÜKLENİYOR HÂLİ — listenin KENDİ şeklini taşır (ADR-0038 bulgu 5).
 *
 * ============================================================================
 * NEDEN `Yükleniyor…` YAZISI DEĞİL
 * ============================================================================
 * Düz metin ekranı bir an BOŞ gösterir, sonra içerik gelince liste aşağıdan
 * ZIPLAYARAK yerleşir. İskelet o zıplamayı yok eder çünkü yeri şimdiden tutar:
 * kart yüksekliği, aralık ve satır sayısı gerçek listeyle aynıdır.
 *
 * ⚠️ `rows` VARSAYILANI 3'TÜR, listenin gerçek uzunluğu değil. Kaç kayıt
 * geleceğini bilmiyoruz; çok sayıda hayalet satır çizmek, boş bir listede
 * "dolu" izlenimi verirdi ve gelen sonuç bir anda küçülürdü.
 *
 * `aria-hidden`: ekran okuyucuya boş kutular okutmanın anlamı yok. Yükleme
 * durumunu duyurmak isteyen çağıran, kendi `role="status"` metnini verir.
 */
export function DeskSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-card border border-border bg-surface px-[22px] py-[20px] shadow-card"
        >
          <span className="block h-[13px] w-[42%] rounded bg-fill-2" />
          <span className="mt-2.5 block h-[11px] w-[68%] rounded bg-fill" />
        </div>
      ))}
    </div>
  );
}

/** Sağa dayalı sayı — sütunlar hizalansın diye daima `tabular`. */
export function DeskNumber({ children }: { children: ReactNode }) {
  return <span className="tabular text-right font-semibold text-fg">{children}</span>;
}

/**
 * Durum işareti.
 *
 * ⚠️ RENK TEK BİLGİ TAŞIYICISI DEĞİLDİR: `hot` hem rengi değiştirir hem
 * kenarlığı — ve etiketin kendisi zaten sözcükle konuşur. Renk körlüğü altında
 * hiçbir anlam kaybolmaz (FRONTEND §4.8'in bağlayıcı kuralı).
 */
export function DeskPill({ children, hot = false }: { children: ReactNode; hot?: boolean }) {
  return (
    <span
      className={`justify-self-start rounded-full border px-2 py-[3px] font-mono text-[8px] tracking-[0.1em] uppercase ${
        hot ? 'border-accent bg-tint text-ink' : 'border-border text-fg-3'
      }`}
    >
      {children}
    </span>
  );
}
