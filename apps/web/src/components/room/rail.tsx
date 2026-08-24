'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';

import { KobiWiseMark, KobiWiseWordmark } from '@/components/brand';
import {
  CalendarIcon,
  ChevronLeftIcon,
  CustomersIcon,
  DocumentsIcon,
  FinanceIcon,
  InventoryIcon,
  HrIcon,
  InvoicingIcon,
  OverviewIcon,
  ProjectsIcon,
  SuppliersIcon,
} from '@/components/icons';
import { CompanySwitcher } from '@/components/app-shell/company-switcher';
import { UserMenu } from '@/components/app-shell/user-menu';

/**
 * KORİDOR — odaların dizildiği şerit. `sidebar.tsx`'in yerini alır.
 *
 * ============================================================================
 * NEDEN SOLDA, NEDEN ALTTA DEĞİL (ADR-0038 §2)
 * ============================================================================
 * Konsept eskizinde oda seçici alttaydı ve güzeldi. İki nedenle taşındı:
 *
 *   1. KEŞFEDİLEBİLİRLİK — alt şerit bir gezinme yeri olarak okunmuyor;
 *      kullanıcı orayı bir durum çubuğu sanıyor.
 *   2. KLAVYE VE EKRAN OKUYUCU SIRASI — alt şerit DOM'un sonuna düşer, yani
 *      gezinmeye ulaşmak için tüm içeriği geçmek gerekirdi. Bu bir tercih
 *      değil, erişilebilirlik kusuru olurdu.
 *
 * Metafor bozulmadı: kapılar bir KORİDORDA dizilidir.
 *
 * ============================================================================
 * ⚠️ KORİDOR ODANIN RENGİNİ ALMAZ
 * ============================================================================
 * Şerit her modülün `layout.tsx`'indeki `data-module` kapsamının DIŞINDADIR,
 * yani kendi `--accent`i terracottadır. Ama her KAPI kendi `data-module`ünü
 * taşır — bu yüzden aktif Finans kapısı yeşil, aktif CRM kapısı çivit mavisi
 * yanar. Aynı desen `sidebar.tsx`'te de vardı ve bilinçli olarak korundu.
 *
 * KobiWise işareti hiçbir renk taşımaz (`text-fg`): marka bir odaya ait
 * değildir (ADR-0038 §7.1).
 */

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface Door {
  readonly label: string;
  /** Şeritte ikonun altında görünen kısa ad — 54 px'e sığmak zorunda. */
  readonly short: string;
  readonly icon: IconType;
  readonly href: string;
  /** `module-colors.css` anahtarı. Panel TAŞIMAZ: o bir modül değil. */
  readonly module?: string;
}

const DOORS: readonly Door[] = [
  { label: 'Panel', short: 'Panel', icon: OverviewIcon, href: '/app' },
  { label: 'Müşteriler', short: 'Müşteri', icon: CustomersIcon, href: '/app/crm', module: 'crm' },
  {
    label: 'Projeler',
    short: 'Proje',
    icon: ProjectsIcon,
    href: '/app/projects',
    module: 'projects',
  },
  { label: 'Finans', short: 'Finans', icon: FinanceIcon, href: '/app/finance', module: 'finance' },
  {
    label: 'Randevular',
    short: 'Randevu',
    icon: CalendarIcon,
    href: '/app/appointments',
    module: 'appointments',
  },
  /**
   * ⚠️ ALTINCI KAPI — Faz 5'in besinci is modulu (ADR-0037 §11).
   *
   * Anahtar `documents`: sema, modul ve `data-module` UCU DE ayni kelime.
   * Renk `module-colors.css`'te ZATEN olculmus (`#557380` / koyu `#8dacba`) ve
   * bilincli olarak setin EN SONUK rengidir — "sozlesme ekrani dikkat cekmek
   * icin degil OKUMAK icin vardir".
   */
  {
    label: 'Belgeler',
    short: 'Belge',
    icon: DocumentsIcon,
    href: '/app/documents',
    module: 'documents',
  },
  /**
   * YEDINCI KAPI — Faz 5'in ALTINCI is modulu (ADR-0039 §11.1).
   *
   * Anahtar `inventory`: sema, modul ve `data-module` UCU DE ayni kelime.
   * Renk `module-colors.css`'te ZATEN olculmus (`#876b1c` / koyu `#c2a45a`) —
   * terracottanin +-35 derecelik yasak koridoruna EN YAKIN komsu ve bilincli
   * olarak sariya cekilmis.
   *
   * ⚠️ Kapi dogrudan CANLI eklendi; bir "yakinda" bolumu YOK (`SOON` dizisi
   * Finans'ta bosalmis ve o gunden beri bos).
   */
  {
    label: 'Stok',
    short: 'Stok',
    icon: InventoryIcon,
    href: '/app/inventory',
    module: 'inventory',
  },
  /**
   * SEKIZINCI KAPI — Faz 5'in YEDINCI is modulu (ADR-0040 §8.1).
   *
   * Anahtar `suppliers`: sema, modul ve `data-module` UCU DE ayni kelime.
   * Renk `module-colors.css`'te ZATEN olculmus (`#5c6cab` / koyu `#92a5e8`).
   *
   * ⚠️ Bu renk bir tercih DEGIL, dosyanin kendi secim kuralinin sonucudur:
   * "AKRABA MODULLER KOMSU HUE ALIR. Tedarikci, CRM'in yaninda (ROADMAP §3.5:
   * 'CRM deseninin ucuz tekrari')." Yani KORIDORDA yan yana duran iki kapi —
   * Musteriler (civit) ve Tedarikci (mor-mavi) — akrabaliklarini RENKLE
   * soyluyor.
   *
   * ⚠️ KOMSU HUE OLMASININ BEDELI: ikisi renk korlugu altinda yakinlasabilir.
   * Bu yuzden kapilar ayrica FARKLI IKON, FARKLI ETIKET ve aktifken
   * `aria-current` tasir — renk hicbir zaman tek ayirt edici degildir.
   *
   * ⚠️ Kapi dogrudan CANLI eklendi; bir "yakinda" bolumu YOK (`SOON` dizisi
   * Finans'ta bosalmis ve o gunden beri bos).
   */
  {
    label: 'Tedarikçiler',
    short: 'Tedarik',
    icon: SuppliersIcon,
    href: '/app/suppliers',
    module: 'suppliers',
  },
  /**
   * DOKUZUNCU KAPI — Faz 5'in SEKIZINCI is modulu (ADR-0041 §11.1).
   *
   * Anahtar `invoicing`: sema, modul ve `data-module` UCU DE ayni kelime.
   * Renk `module-colors.css`'te ZATEN olculmus (`#257c6c` / koyu `#64b6a4`).
   *
   * ⚠️ Bu renk bir tercih DEGIL, dosyanin kendi secim kuralinin sonucudur:
   * "AKRABA MODULLER KOMSU HUE ALIR. Teklif/Fatura, Finans'in yaninda
   * ('Finans uzantisi')." Yani KORIDORDA renk, ROADMAP §3.5'in
   * konumlandirmasini soyluyor.
   *
   * ⚠️ KOMSU HUE OLMASININ BEDELI VE BU CIFTIN OZEL DURUMU: Finans (#307d54)
   * ile Teklif/Fatura (#257c6c) birbirine, CRM/Tedarikci ciftinden DAHA
   * YAKINDIR. Bu yuzden kapilar ayrica FARKLI IKON, FARKLI ETIKET ve aktifken
   * `aria-current` tasir — renk hicbir zaman tek ayirt edici degildir.
   *
   * ⚠️ Etiket "Teklif" (kisa) ama modul iki belge turu uretir; koridorda
   * 54 px'e sigmasi gerekiyor. Tam etiket geniş halde "Teklif / Fatura".
   *
   * ⚠️ Kapi dogrudan CANLI eklendi; bir "yakinda" bolumu YOK (`SOON` dizisi
   * Finans'ta bosalmis ve o gunden beri bos).
   */
  {
    label: 'Teklif / Fatura',
    short: 'Teklif',
    icon: InvoicingIcon,
    href: '/app/invoicing',
    module: 'invoicing',
  },
  /**
   * ONUNCU KAPI — Faz 5'in DOKUZUNCU is modulu (ADR-0043 §10).
   *
   * Anahtar `hr`: sema, modul, rota ve `data-module` DORDU DE ayni kelime.
   * Renk `module-colors.css`'te ZATEN olculmus (`#896096` / koyu `#c498d2`).
   *
   * ⚠️ UCUNCU KOMSU-HUE KUMESI VE ILKI UC RENKLI: `hr`, `marketing` (#7665a6)
   * ve `loyalty` (#9a5a84) mor bantta BIRLIKTE duruyor — CRM/Tedarikci ve
   * Finans/Teklif ciftlerinden bir renk daha kalabalik. Ikisi henuz yazilmadi;
   * yazildiklari gun bu kume UC KAPIYA cikar ve "renk tek ayirt edici degildir"
   * kurali burada EN COK sinanacak yerdir. Bu yuzden kapi ayrica FARKLI IKON,
   * FARKLI ETIKET ve aktifken `aria-current` tasir.
   *
   * ⚠️ Kapi dogrudan CANLI eklendi; bir "yakinda" bolumu YOK (`SOON` dizisi
   * Finans'ta bosalmis ve o gunden beri bos).
   */
  {
    label: 'Ekip',
    short: 'Ekip',
    icon: HrIcon,
    href: '/app/hr',
    module: 'hr',
  },
];

/**
 * Aktif kapı — EN UZUN eşleşen önek kazanır.
 *
 * `sidebar.tsx`'ten olduğu gibi taşındı ve gerekçesi değişmedi: eşitlik
 * `/app/crm/<id>` detayında "Müşteriler"i söndürürdü, salt önek ise her yol
 * `/app` ile başladığı için Panel'i HER sayfada aktif gösterirdi.
 */
export function activeDoorOf(pathname: string): string | undefined {
  return DOORS.map((door) => door.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * ⚠️ AÇILIP KAPANABİLİR (Product Owner, 2026-08-17: _"soldaki genel menü
 * dizaynı güzel ama küçük geldi bana biraz"_).
 *
 * Dar hâl (62 px) ikon + kısaltma taşır ve ekranı odaya bırakır; geniş hâl
 * (216 px) tam etiketleri, şirket adını ve hesabı gösterir. Varsayılan GENİŞ:
 * ilk kez açan kullanıcı ürünün neye sahip olduğunu okuyabilmeli — daraltma
 * bir alışkanlık kazandıktan sonra tercih edilir.
 *
 * Tercih kalıcıdır (`bo_rail`), çünkü bir gezinme genişliğini her açılışta
 * yeniden ayarlamak sinir bozucudur.
 */
export function Rail({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const activeHref = activeDoorOf(usePathname());

  return (
    <div
      className={`flex h-full w-full flex-col gap-1 py-3 ${collapsed ? 'items-center' : 'px-3'}`}
    >
      <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col' : 'px-1'}`}>
        {/*
          ⚠️ GENİŞ KORİDORDA YAZILI LOGO, dar koridorda YALNIZCA İŞARET.

          Marka sistemi iki varlıktır ve ikisi YAN YANA kullanılmaz (Product
          Owner, 2026-08-17): işaret, yer olmayan yüzeylerde yazının YERİNE
          geçer — yanına değil.

          Yazı elle dizilmiyor: `KobiWiseWordmark` tek tanımdır. Burada
          tekrarlansaydı ağırlık ve optik takip iki yerde durur, biri
          değişince marka sessizce ayrışırdı.
        */}
        <Link
          href="/app"
          aria-label="KobiWise ana sayfa"
          className="min-w-0 flex-1 rounded-[8px] p-1"
        >
          {collapsed ? (
            <KobiWiseMark height={19} className="text-fg" title="KobiWise" />
          ) : (
            <KobiWiseWordmark size={20} />
          )}
        </Link>
        {onToggle === undefined ? null : (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            aria-expanded={!collapsed}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-fg-3 transition-colors hover:bg-fill hover:text-fg md:inline-flex"
          >
            <ChevronLeftIcon
              width={15}
              height={15}
              className={`transition-transform duration-300 ease-rise ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Hangi şirketteyim — çok kiracılı bir üründe ilk sorulan soru. */}
      <div className={collapsed ? 'mt-2' : 'mt-3'}>
        <CompanySwitcher compact={collapsed} />
      </div>

      <nav
        aria-label="Odalar"
        className={`mt-3 flex flex-col gap-0.5 ${collapsed ? 'items-center' : ''}`}
      >
        {DOORS.map((door) => (
          <DoorLink
            key={door.href}
            door={door}
            collapsed={collapsed}
            active={door.href === activeHref}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex-1" />

      <UserMenu compact={collapsed} />
    </div>
  );
}

function DoorLink({
  door,
  active,
  collapsed,
  onNavigate,
}: {
  door: Door;
  active: boolean;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const Icon = door.icon;

  return (
    <Link
      href={door.href}
      {...(door.module === undefined ? {} : { 'data-module': door.module })}
      {...(active ? { 'aria-current': 'page' } : {})}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
      /*
       * ⚠️ `aria-label` ZORUNLU — `title` YETMEZ ve yanlış olurdu.
       *
       * Kapı görsel olarak KISALTMA taşır ("Müşteri"), çünkü şerit 54 px.
       * Erişilebilir ad içerikten türeseydi ekran okuyucu kullanıcısı da
       * kısaltmayı duyardı — görsel kullanıcı ikonu görüp bağlamı tamamlar,
       * o tamamlayamaz. `title` ise yalnızca içerik YOKKEN ada dönüşür;
       * burada içerik var, dolayısıyla `title` sessizce hiçbir işe yaramazdı.
       */
      aria-label={door.label}
      className={[
        'relative rounded-[11px] transition-colors duration-200',
        /*
         * ⚠️ DOKUNMA HEDEFİ 44 px. Dar kapı 46×~44, geniş kapı tam genişlikte
         * ve `min-h-11` ile 44 px'i garanti eder. Mobil çekmecede koridor
         * daima geniş açılır, yani parmakla kullanılan hâl budur.
         */
        collapsed
          ? 'flex min-h-11 w-[46px] flex-col items-center justify-center gap-1 px-1 py-2'
          : 'flex min-h-11 w-full items-center gap-2.5 px-3 py-2.5',
        active ? 'bg-tint text-ink' : 'text-fg-3 hover:bg-fill hover:text-fg-2',
        // Aktif kapının kenar çubuğu — renk TEK ayırt edici olmasın diye
        // etiket ayrıca kalınlaşır ve `aria-current` taşınır.
        active
          ? 'before:absolute before:top-1/2 before:-left-[9px] before:h-[20px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[3px] before:bg-accent'
          : '',
      ].join(' ')}
    >
      <Icon width={collapsed ? 16 : 17} height={collapsed ? 16 : 17} className="shrink-0" />
      {collapsed ? (
        <span
          className={`font-mono text-[7.5px] tracking-[0.06em] uppercase ${
            active ? 'font-bold' : 'font-medium'
          }`}
        >
          {door.short}
        </span>
      ) : (
        <span className={`text-[13.5px] ${active ? 'font-semibold' : 'font-medium'}`}>
          {door.label}
        </span>
      )}
    </Link>
  );
}
