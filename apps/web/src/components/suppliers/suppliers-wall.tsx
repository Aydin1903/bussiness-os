'use client';

import type { Supplier } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * TEDARİKÇİ ODASININ DUVARI — İKİ ROTA TARAFINDAN PAYLAŞILIR (ADR-0038 §6.5).
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN KOPYALANMAZ
 * ============================================================================
 * `/app/suppliers` (tedarikçi listesi) ve `/app/suppliers/interactions`
 * (görüşme akışı) AYRI ODALAR DEĞİLDİR: aynı odanın iki çalışma yüzeyidir.
 * İkisi de AYNI SORUYU cevaplıyor — _"tedarikçi ilişkilerimiz ne durumda"_ —
 * dolayısıyla duvar ORTAKTIR.
 *
 * Kopyalansaydı iki duvar zamanla sapardı ve sekmeler arasında gezerken
 * _"hangi durumdayım"_ sorusunun cevabı DEĞİŞİRDİ. `finance-wall.tsx` /
 * `inventory-wall.tsx` ile aynı karar, üçüncü kez.
 *
 * ============================================================================
 * ⚠️ "DURGUN TEDARİKÇİ" BİR UYDU DEĞİLDİR — VE OLAMAZ (ADR-0040 §3.2, §8.2)
 * ============================================================================
 * Bu, bu duvarın EN ÖNEMLİ boşluğudur ve bilinçlidir.
 *
 * ADR §3.2 "durgun tedarikçi"yi bir YAPISAL KATKICI adayı olarak değerlendirip
 * REDDETTİ: durgunluk bu modülde HABER DEĞİLDİR. Durgun bir FIRSAT kayıp
 * gelirdir; durgun bir TEDARİKÇİ normaldir — ihtiyaç olunca aranır. Yılda bir
 * kez çalışılan bir tedarikçi 364 gün "durgun" görünür.
 *
 * Onu duvara bir uydu olarak koymak, katkıcının reddedilme gerekçesiyle
 * ÇELİŞİRDİ: AI'a "bu haber değil" derken kullanıcıya "bu haber" demiş olurduk.
 * ⚠️ Bir gün gerçekten haber sayılırsa sıra DEĞİŞTİRİLEMEZ (§3.3): önce
 * sipariş/teslimat ADR'si, sonra ADR-0036'nın yeniden açılması, ancak ondan
 * sonra hem katkıcı hem bu uydu.
 *
 * ============================================================================
 * KAHRAMAN: TOPLAM TEDARİKÇİ SAYISI
 * ============================================================================
 * ⚠️ Stok'un duvarından BİLİNÇLİ bir sapma. Orada kahraman "eşik altındaki
 * kalem sayısı"ydı çünkü bir depoda ilk sorulan _"neyim bitiyor"_dur ve
 * miktarlar birimleri yüzünden TOPLANAMIYORDU.
 *
 * Burada toplanamayan bir şey yok ve bir ALARM da yok: tedarikçi listesi bir
 * DEFTERDİR. Belge'nin duvarıyla aynı sınıf — orada da kahraman ARŞİVİN
 * BÜYÜKLÜĞÜYDÜ.
 *
 * ============================================================================
 * ⚠️ DUVAR VERİYİ KENDİ ÇEKMEZ — ÇAĞIRANDAN ALIR
 * ============================================================================
 * `DocumentsWall` / `InventoryWall` ile aynı karar: ikinci bir istek atmak aynı
 * veriyi iki kez çekmek ve iki sayı arasında GEÇİCİ TUTARSIZLIK üretmek olurdu.
 *
 * ⚠️ Bedeli açıkça: uydu sayımları YALNIZCA GÖRÜNEN SAYFAYI kapsar ve bu,
 * etiketlerde ("bu sayfada") yazılıdır. Kahraman rakam ise sunucudan gelen
 * `total`dır, yani TÜM tedarikçileri sayar.
 */
export function SuppliersWall({
  total,
  items,
  loading,
}: {
  readonly total: number;
  readonly items: readonly Supplier[];
  readonly loading: boolean;
}) {
  if (loading) {
    return (
      <Wall>
        <div aria-hidden className="flex flex-col gap-3">
          <span className="block h-[9px] w-[120px] rounded bg-fill-2" />
          <span className="block h-[52px] w-[38%] rounded-[10px] bg-fill-2" />
          <span className="block h-[11px] w-[180px] rounded bg-fill-2" />
        </div>
      </Wall>
    );
  }

  /*
   * ⚠️ ÜÇ UYDUNUN ÜÇÜ DE BİR KAYIT EKSİĞİNİ gösterir, bir RİSK değil.
   *
   * "Vergi no yok" bir alarm DEĞİLDİR (alan opsiyoneldir — küçük bir işletme
   * bilmeyebilir) ama tekilliğin dayandığı alan odur (§1.1): vergi numarası
   * girilmemiş iki kayıt, aynı tüzel kişi olsa bile ÇAKIŞMAZ. Yani bu sayı
   * "mükerrer kayıt riski" demektir ve göstermeye değer.
   */
  const withoutTaxNumber = items.filter((row) => row.taxNumber === null).length;
  const withoutPaymentTerms = items.filter((row) => row.paymentTerms === null).length;
  const withCategory = new Set(
    items.flatMap((row) => (row.category === null ? [] : [row.category])),
  ).size;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Tedarikçi"
          delta={
            total === 0 ? undefined : (
              <span className="text-fg-3">
                {withoutTaxNumber > 0
                  ? `${String(withoutTaxNumber)} kayıtta vergi no yok`
                  : 'bu sayfadaki kayıtların vergi numarası tam'}
              </span>
            )
          }
        >
          <HeroFigure>{total}</HeroFigure>
          {total === 0 ? (
            <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
              Henüz tedarikçi yok. Firma ekleyip görüşme yazdığınızda, konuşulanlar asistanın
              kurumsal hafızasına girer — “şu vidayı kimden alıyorduk” sorusu oradan cevaplanır.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          {/*
            ⚠️ "Vergi no yok" TEK vurgulanan uydudur ve sebebi §1.1'dir:
            tekillik `lower(tax_number)` üzerinde zorlanır. Boş bırakılan her
            kayıt, aynı firmanın ikinci kez açılmasına açık kapı demektir — ve
            o gün GÖRÜŞME GEÇMİŞİ, yani AI'ın hafızası İKİYE BÖLÜNÜR.
          */}
          <Satellite
            label="Vergi no yok"
            value={withoutTaxNumber}
            note="bu sayfada"
            tone={withoutTaxNumber > 0 ? 'accent' : 'plain'}
          />
          {/*
            ⚠️ "Ödeme koşulu yok" VURGULANMAZ: alan serbest metindir ve hiçbir
            şeyi zorlamaz (§1.2). Vurgulamak, kullanıcıyı her kayda bir şeyler
            yazmaya iterdi ve o metinler uydurma olurdu — üstelik hiçbir sorgu
            onları okumuyor.
          */}
          <Satellite label="Ödeme koşulu yok" value={withoutPaymentTerms} note="bu sayfada" />
          <Satellite label="Kategori" value={withCategory} note="bu sayfada, ayrı" />
        </Satellites>
      </Rise>
    </Wall>
  );
}
