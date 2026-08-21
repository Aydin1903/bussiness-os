'use client';

import { stockLevelOf, type StockItemRow } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * STOK ODASININ DUVARI — İKİ ROTA TARAFINDAN PAYLAŞILIR (ADR-0038 §6.5).
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN KOPYALANMAZ — VE SEBEBİ BİR KULLANICI MODELİDİR
 * ============================================================================
 * `/app/inventory` (kalem listesi) ve `/app/inventory/movements` (hareket
 * defteri) AYRI ODALAR DEĞİLDİR: aynı odanın iki çalışma yüzeyidir. İkisi de
 * AYNI SORUYU cevaplıyor — _"stok durumu ne"_ — dolayısıyla duvar ORTAKTIR.
 *
 * ADR-0038 §6.5'in karar noktası: _"bu rota hangi soruyu cevaplıyor? Aynı
 * soruysa duvar ortak, farklı soruysa duvar farklı."_ Finans'ın
 * `/finance/categories` istisnası burada YOKTUR: hareket defteri bir sözlük
 * yönetmiyor, aynı stoğun geçmişini gösteriyor.
 *
 * Uygulaması `finance-wall.tsx` ile aynı: PAYLAŞILAN BİR BİLEŞEN. Kopyalansaydı
 * iki duvar zamanla sapardı ve sekmeler arasında gezerken _"hangi durumdayım"_
 * sorusunun cevabı DEĞİŞİRDİ.
 *
 * ============================================================================
 * ⚠️ KAHRAMAN RAKAM "TOPLAM STOK" DEĞİLDİR — VE OLAMAZ (ADR-0039 §4.1)
 * ============================================================================
 * 3 kg un ile 12 adet vidanın toplamı YOKTUR. Birimler arası toplama bu
 * modülde tip seviyesinde bile mümkün değildir (`contracts`ta böyle bir alan
 * yok).
 *
 * Kahraman: **eşik altındaki kalem sayısı**. Birimsizdir, toplanabilir ve
 * odanın asıl sorusunu cevaplar — _"neyimiz bitiyor"_. "Kaç kalemim var" bir
 * uydudur: envanterin büyüklüğü bir karar değil, bir envanter bilgisidir.
 *
 * ⚠️ Bu, Belge'nin duvarından BİLİNÇLİ bir sapmadır. Orada kahraman ARŞİVİN
 * BÜYÜKLÜĞÜYDÜ ("kaç belgem var") çünkü bir arşivde ilk sorulan budur. Bir
 * depoda ilk sorulan "kaç kalemim var" değil, "neyim bitiyor"dur.
 *
 * ============================================================================
 * ⚠️ DUVAR VERİYİ KENDİ ÇEKMEZ — ÇAĞIRANDAN ALIR
 * ============================================================================
 * `DocumentsWall` ile aynı karar: ikinci bir istek atmak aynı veriyi iki kez
 * çekmek ve iki sayı arasında GEÇİCİ TUTARSIZLIK üretmek olurdu.
 *
 * ⚠️ Bedeli açıkça: sayımlar YALNIZCA GÖRÜNEN SAYFAYI kapsar — bu, etiketlerde
 * ("bu sayfada") yazılıdır. Kahraman rakam da öyle; tüm envanterin eşik altı
 * sayısı ancak `lowStockOnly` filtresiyle GÖRÜLÜR ve o zaman `total` sunucudan
 * gelen doğru sayıdır.
 *
 * ⚠️ MİKTARLAR BURADA HİÇ TOPLANMAZ — yalnızca KALEM SAYILIR. `stockLevelOf`
 * her satırı kendi eşiğiyle karşılaştırır; satırlar arası hiçbir aritmetik
 * yoktur.
 */
export function InventoryWall({
  total,
  items,
  loading,
}: {
  readonly total: number;
  readonly items: readonly StockItemRow[];
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

  const levels = items.map((row) =>
    stockLevelOf({ quantity: row.quantity, minQuantity: row.minQuantity }),
  );
  const critical = levels.filter((level) => level === 'critical').length;
  const near = levels.filter((level) => level === 'near').length;
  const untracked = levels.filter((level) => level === 'untracked').length;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Eşik altında"
          delta={
            total === 0 ? undefined : (
              <span className="text-fg-3">
                {near > 0 ? `${String(near)} kalem de eşiğe yaklaştı` : 'bu sayfadaki kalemler'}
              </span>
            )
          }
        >
          {/*
            ⚠️ RAKAM EŞİK ALTINDAKİ KALEM SAYISIDIR — miktar toplamı DEĞİL.
            Miktarlar birimleri yüzünden toplanamaz (§4.1).
          */}
          <HeroFigure>{critical}</HeroFigure>
          {total === 0 ? (
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Henüz stok kalemi yok. Kalem açıp giriş hareketi yazdığınızda miktar hareketlerden
              hesaplanır — elle bir stok sayısı girilmez.
            </p>
          ) : critical === 0 ? (
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Bu sayfadaki kalemlerin hiçbiri eşiğinin altında değil.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite label="Kalem" value={total} note="toplam" />
          <Satellite
            label="Azalıyor"
            value={near}
            note="bu sayfada"
            tone={near > 0 ? 'accent' : 'plain'}
          />
          {/*
            ⚠️ "İZLENMİYOR" BİR UYARI DEĞİLDİR ve vurgulanmaz. Eşiği `null` olan
            kalem bilinçli olarak izlenmiyordur (§6.1 — `null` = izleme yok,
            `0` = tükendiğinde haber ver). Vurgulansaydı, kullanıcıyı her kaleme
            eşik yazmaya iterdi ve o eşikler uydurma olurdu.
          */}
          <Satellite label="Eşiksiz" value={untracked} note="bu sayfada" />
        </Satellites>
      </Rise>
    </Wall>
  );
}
