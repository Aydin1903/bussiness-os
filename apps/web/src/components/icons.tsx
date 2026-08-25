import type { SVGProps } from 'react';

/**
 * Minimal, bağımlılıksız inline ikonlar (§4 Apple-vari, ince çizgi).
 *
 * Hepsi `currentColor` kullanır; boyut/renk çağıran tarafından className ile
 * verilir. Harici ikon kütüphanesi eklemek yerine gereken küçük set elle yazıldı.
 */
type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function OverviewIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function CustomersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function FinanceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3.5-4 3 2.5L20 7" />
    </svg>
  );
}

export function ProjectsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

/**
 * Randevu / takvim — ADR-0035 Slice 5.
 *
 * ⚠️ YENİ BİR İKON ÇİZMEK BİR TASARIM KARARIDIR ve Slice 1'de bilinçli olarak
 * ertelenmişti (`sidebar.tsx`'in `SOON` notu). Seçim setin diline uyar: 24
 * kutuluk viewBox, 1.7 çizgi kalınlığı, `currentColor`, dolgu yok.
 *
 * Takvim gövdesi + iki askı + başlık çizgisi + tek bir gün işareti. Gün işareti
 * ONEMLİDİR: askısız/işaretsiz bir kare `ProjectsIcon`ın dikdörtgeniyle
 * karışırdı ve sidebar'da iki satır aynı görünürdü. ⚠️ Renk körlüğü altında da
 * ayırt edilebilmesi gerekiyor — renk TEK ayırt edici olamaz (FRONTEND §4.8).
 */
export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
      <rect x="7" y="13" width="3.5" height="3" rx="0.8" />
    </svg>
  );
}

/**
 * Belge / Sozlesme — kivrik kosesi olan bir SAYFA (ADR-0037 §11).
 *
 * ⚠️ `KnowledgeIcon`DAN AYIRT EDILEBILIR OLMAK ZORUNDA: o bir KITAP (kurumsal
 * hafiza), bu bir DOSYA. Koridorda yan yana durabilecekleri icin iki ikonun
 * silueti farkli olmali — ayni "dikdortgen + cizgiler" sekli iki modulu
 * karistirilir kilardi.
 *
 * Kivrik kose bilincli: sete uygun ince cizgi dilinde "dosya"yi anlatan en
 * taninir isarettir ve dolgu gerektirmez.
 */
export function DocumentsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z" />
      <path d="M14 3.5V7a.5.5 0 0 0 .5.5H18" />
      <path d="M9 13h6" />
      <path d="M9 16.5h4" />
    </svg>
  );
}

/**
 * Stok / Envanter — RAF ve KUTU.
 *
 * ⚠️ Bir kutu (paket) DEĞİL bir RAF seçildi: tek kutu "kargo/teslimat"
 * okunur ve bu modül sevkiyat değil DEPO tutar. Raf metaforu miktar ve
 * seviye fikrini de tasir — modulun kahraman rakami "esik altindaki kalem
 * sayisi"dir (ADR-0039 §4.1).
 */
export function InventoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h16" />
      <path d="M8 6.5v-2h4v2" />
      <path d="M13 12v-2h4v2" />
      <path d="M7 17.5v-2h4v2" />
    </svg>
  );
}

/**
 * Tedarikci Yonetimi — EL SIKISMA / KARSILIKLI OK.
 *
 * ⚠️ Bir KAMYON ya da KUTU DEGIL: ikisi de "sevkiyat/kargo" okunur ve bu modul
 * lojistik degil ILISKI tutar (firma · kisi · gorusme). Bir FABRIKA da degil:
 * tedarikci uretici olmak zorunda degildir.
 *
 * Secilen sekil KARSILIKLI AKIS: iki yon, biri gelen biri giden. ROADMAP
 * §3.5'in "ayni sekil, TERS YON (satin alma)" tanimini soyluyor — CRM'in
 * musteri ikonuyla akraba ama zit yonlu.
 *
 * ⚠️ Renk gibi ikon da TEK ayirt edici degildir: kapi ayrica etiket ve
 * `aria-label` tasir.
 */
export function SuppliersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8.5h11" />
      <path d="M10.5 5 14 8.5 10.5 12" />
      <path d="M21 15.5H10" />
      <path d="M13.5 12 10 15.5 13.5 19" />
    </svg>
  );
}

/**
 * TEKLIF / FATURA — dokuzuncu kapinin ikonu (ADR-0041 §11.1).
 *
 * Secilen sekil BIR KAGIT + UZERINDE SATIRLAR + BIR ONAY ISARETI: modulun
 * urettigi sey bir BELGEDIR ("satir kalemleri") ve o belgenin bir SONUCU
 * vardir (kabul / kesim). Belge modulunun ikonundan (arsivlenen dosya) bu
 * ikinci parca ile ayrilir.
 *
 * ⚠️ Renk gibi ikon da TEK ayirt edici degildir: kapi ayrica etiket ve
 * `aria-label` tasir. Bu modulde kural OZELLIKLE gecerli — imza rengi
 * (#257c6c) Finans'in yesiliyle (#307d54) KOMSU HUE'dur ve bu cift,
 * CRM/Tedarikci ciftinden DAHA YAKINDIR.
 */
export function InvoicingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3h8l4 4v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v4h4" />
      <path d="M8 11h6" />
      <path d="M8 14.5h3" />
      <path d="M13 19.5l2 2 4-4" />
    </svg>
  );
}

/**
 * IK / PERSONEL — ONUNCU kapinin ikonu (ADR-0043 §10).
 *
 * Secilen sekil IKI FIGUR: biri onde biri arkada. Modulun cevapladigi soru
 * "sirkette KIMLER var"dir — tekil bir kisi degil, BIR EKIP.
 *
 * ⚠️ CRM'in musteri ikonundan ayrilmasi ONEMLI: orada da insan var ama oradaki
 * insan DISARIDANDIR (musteri), buradaki ICERIDEN. Fark ikonda iki figurun
 * BIRLIKTE durmasiyla soyleniyor.
 *
 * ⚠️ Renk gibi ikon da TEK ayirt edici degildir: kapi ayrica etiket ve
 * `aria-label` tasir. Bu modulde kural OZELLIKLE gecerli — imza rengi
 * (#896096) `marketing` (#7665a6) ve `loyalty` (#9a5a84) ile UC RENKLI bir
 * mor kume olusturuyor (ikisi henuz yazilmadi).
 */
export function HrIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8" />
      <path d="M17.5 14.9c1.9.6 3 2.4 3 4.6" />
    </svg>
  );
}

/**
 * MUSTERI GERI BILDIRIMI — ONBIRINCI kapinin ikonu (ADR-0045 §9).
 *
 * Secilen sekil BIR KONUSMA BALONU + ICINDE BIR YILDIZ: modulun tasidigi sey
 * bir SOZ (musterinin kendi cumlesi) ve bir PUANDIR. Ikisi birden, cunku
 * modulun tamami bu ikisidir.
 *
 * ⚠️ CRM'in musteri ikonundan (insan silueti) ve Tedarikci'nin akis okundan
 * BILINCLI olarak uzak: burada tasinan sey bir KISI ya da bir ILISKI degil,
 * DISARIDAN GELEN BIR SESTIR (§3.1 — havuza disaridan gelen ilk ses).
 *
 * ⚠️ Renk gibi ikon da TEK ayirt edici degildir ve BU MODULDE KURAL EN COK
 * BURADA GECERLI: imza rengi (#56793e adacayi) `projects` (#717325),
 * `finance` (#307d54) ve `invoicing` (#257c6c) ile YESIL BANTTA DORT KAPILIK
 * bir kume olusturuyor — setin EN KALABALIGI. Kapi ayrica farkli etiket ve
 * `aria-label` tasir.
 */
export function FeedbackIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 12.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-4.2A7.5 7.5 0 0 1 12.5 5 7.5 7.5 0 0 1 20 12.5Z" />
      <path d="M12.5 8.8l1.1 2.3 2.5.35-1.8 1.75.43 2.5-2.24-1.18-2.23 1.18.42-2.5-1.8-1.75 2.5-.35Z" />
    </svg>
  );
}

export function KnowledgeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19" />
    </svg>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
      <path d="M18 15l.9 2.4L21.3 18l-2.4.9L18 21.3l-.9-2.4L14.7 18l2.4-.6z" />
    </svg>
  );
}
