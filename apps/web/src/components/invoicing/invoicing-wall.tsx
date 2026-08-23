'use client';

import type { SalesDocument } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * TEKLİF / FATURA ODASININ DUVARI — İKİ ROTA TARAFINDAN PAYLAŞILIR
 * (ADR-0038 §6.5, ADR-0041 §11.2).
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN KOPYALANMAZ
 * ============================================================================
 * `/app/invoicing` (teklifler) ve `/app/invoicing/invoices` (faturalar) AYRI
 * ODALAR DEĞİLDİR: aynı odanın iki çalışma yüzeyidir ve aynı soruyu
 * cevaplarlar — _"satış evrakımız ne durumda"_.
 *
 * Kopyalansaydı iki duvar zamanla sapardı ve sekmeler arasında gezerken
 * "hangi durumdayım" sorusunun cevabı DEĞİŞİRDİ. `suppliers-wall.tsx` /
 * `inventory-wall.tsx` ile aynı karar, dördüncü kez.
 *
 * ============================================================================
 * ⚠️ KAHRAMAN RAKAM BİR SAYIDIR, BİR TUTAR DEĞİL (ADR-0041 §11.2)
 * ============================================================================
 * Gerekçe ADR-0039'un _"toplam stok diye bir rakam bulunmaz"_ kararıyla
 * AYNIDIR, yalnızca ekseni farklıdır: orada birimler toplanamıyordu, burada
 * PARA BİRİMLERİ toplanmıyor (§1.4 — kur çevrimi YOK).
 *
 * Kahraman bir tutar olsaydı iki seçenek kalırdı ve ikisi de kötü: ya para
 * birimlerini toplayıp SESSİZCE YANLIŞ bir rakam gösterirdik, ya da tek bir
 * para birimini seçip diğerlerini GİZLERDİK. Sayı ikisini de yapmaz.
 *
 * Tutarlar tezgahta, HER SATIRDA kendi para birimiyle görünür.
 *
 * ============================================================================
 * ⚠️ DUVAR VERİYİ KENDİ ÇEKMEZ — ÇAĞIRANDAN ALIR
 * ============================================================================
 * `SuppliersWall` / `InventoryWall` ile aynı karar: ikinci bir istek atmak
 * aynı veriyi iki kez çekmek ve iki sayı arasında GEÇİCİ TUTARSIZLIK üretmek
 * olurdu.
 *
 * ⚠️ Bedeli açıkça: uydu sayımları YALNIZCA GÖRÜNEN SAYFAYI kapsar ve bu,
 * etiketlerde ("bu sayfada") yazılıdır. Kahraman rakam ise sunucudan gelen
 * `total`dır.
 */
export function InvoicingWall({
  total,
  items,
  loading,
}: {
  /** Aktif sekmenin TÜM kayıt sayısı (sunucudan). */
  readonly total: number;
  /** Görünen sayfa — uydular yalnızca bunu sayar. */
  readonly items: readonly SalesDocument[];
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
   * ⚠️ ÜÇ UYDU, ÜÇÜ DE BİR İŞ BEKLİYOR — bir envanter sayısı değil.
   *
   * Yapısal katkıcının (§4.1) bantlarıyla AYNI SORULARI sorar ve bu bilinçli:
   * asistana "bu haber" derken kullanıcıya başka bir şey göstermek, iki ayrı
   * gerçeklik üretirdi.
   *
   * ⚠️ "Kabul edildi" uydusu FATURALANMAMIŞ olanları saymaz — bu sayfada
   * dönüştürülüp dönüştürülmediği bilinmiyor (o bilgi faturaların
   * `convertedFromId`inde). Etiket bu yüzden "kabul edildi" der, "faturası
   * kesilmedi" DEMEZ: sayamadığımız bir şeyi saymış gibi göstermek, uydunun
   * kendisini yalan yapardı.
   */
  const drafts = items.filter((row) => row.status === 'draft').length;
  const waiting = items.filter((row) => row.status === 'sent').length;
  const accepted = items.filter((row) => row.status === 'accepted').length;
  const issued = items.filter((row) => row.status === 'issued').length;

  const quotesShown = items.some((row) => row.kind === 'quote');

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Satış evrakı"
          delta={
            total === 0 ? undefined : (
              <span className="text-fg-3">
                {waiting > 0
                  ? `${String(waiting)} belge cevap bekliyor`
                  : 'bu sayfada cevap bekleyen yok'}
              </span>
            )
          }
        >
          <HeroFigure>{total}</HeroFigure>
          {total === 0 ? (
            <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
              Henüz belge yok. Bir teklif yazıp gönderdiğinizde, cevap bekleyenler ve kabul edilip
              faturası kesilmeyenler asistanın gündemine girer — “hangi teklifimiz masada kaldı”
              sorusu oradan cevaplanır.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          {/*
            ⚠️ TASLAK VURGULANMAZ: taslak bir eksik değil, bir çalışma hâlidir.
            Vurgulamak kullanıcıyı yarım belgeleri "temizlemeye" iterdi — oysa
            bir taslağı silmek meşru ama ACELESİ OLMAYAN bir iştir.
          */}
          <Satellite label="Taslak" value={drafts} note="bu sayfada" />
          {/*
            ⚠️ "Cevap bekliyor" VURGULANIR: yapısal katkıcının 0.90 bandıyla
            aynı soru (§4.1). Bir teklif gönderilip unutulduğunda kaybedilen
            şey zamandır ve zaman geri gelmez.
          */}
          <Satellite
            label="Cevap bekliyor"
            value={waiting}
            note="bu sayfada"
            tone={waiting > 0 ? 'accent' : 'plain'}
          />
          {quotesShown || accepted > 0 ? (
            /*
              ⚠️ "Kabul edildi" VURGULANIR: katkıcının EN AĞIR bandı (0.95) —
              para masada duruyor. Ardından bir iş gelir: faturaya dönüştürme.
            */
            <Satellite
              label="Kabul edildi"
              value={accepted}
              note="bu sayfada"
              tone={accepted > 0 ? 'accent' : 'plain'}
            />
          ) : (
            <Satellite label="Kesildi" value={issued} note="bu sayfada" />
          )}
        </Satellites>
      </Rise>
    </Wall>
  );
}
