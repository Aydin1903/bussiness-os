'use client';

import type { Employee } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * İK ODASININ DUVARI (ADR-0038 §6.5, ADR-0043 §10).
 *
 * ============================================================================
 * ⚠️ KAHRAMAN: AKTİF ÇALIŞAN SAYISI — "TOPLAM MAAŞ GİDERİ" DEĞİL
 * ============================================================================
 * Bu, duvarın EN ÖNEMLİ kararıdır ve İKİ BAĞIMSIZ sebebi vardır (ADR §4.4):
 *
 *   1. Para birimleri TOPLANMAZ (ADR-0034'ün kuralı, ADR-0039'un birim
 *      kuralının aynı şekli). Farklı para biriminde çalışanları olan bir
 *      şirkette "toplam" diye bir sayı YOKTUR.
 *   2. ⚠️ VE DAHA AĞIRI: o rakam bir ÖZET ÜZERİNDEN MAAŞ SIZDIRMA yoludur.
 *      Üç kişilik bir ekipte toplam, tek tek maaşlara neredeyse eşittir —
 *      ve duvar `employee:read` taşıyan DÖRT ROLE de görünür.
 *
 * Yani kahraman rakamın maaş olmaması bir tasarım tercihi değil, §4.2'nin
 * izolasyonunun DUVARDAKİ karşılığıdır.
 *
 * ============================================================================
 * ⚠️ BU DUVARDA HİÇBİR ÜCRET SAYISI YOKTUR — VE OLAMAZ
 * ============================================================================
 * Bileşen `Employee[]` alır; o tip ÜCRET TAŞIMAZ (contracts). Yani buraya bir
 * maaş uydusu eklemek İMKÂNSIZDIR — önce şemayı, sonra API'yi, sonra izni
 * değiştirmek gerekir. Yüzey, veri modelinin kendisi tarafından korunuyor.
 *
 * ============================================================================
 * ⚠️ DUVAR VERİYİ KENDİ ÇEKMEZ — ÇAĞIRANDAN ALIR
 * ============================================================================
 * `SuppliersWall` / `InventoryWall` ile aynı karar, dördüncü kez: ikinci bir
 * istek aynı veriyi iki kez çekmek ve iki sayı arasında GEÇİCİ TUTARSIZLIK
 * üretmek olurdu.
 *
 * ⚠️ Bedeli açıkça: uydu sayımları YALNIZCA GÖRÜNEN SAYFAYI kapsar ve bu,
 * etiketlerde ("bu sayfada") yazılıdır. Kahraman rakam sunucudan gelen
 * `total`dır.
 */
export function HrWall({
  total,
  items,
  loading,
}: {
  readonly total: number;
  readonly items: readonly Employee[];
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

  const withoutTitle = items.filter((row) => row.jobTitle === null).length;

  /*
   * ⚠️ "Platform hesabı yok" BİR ALARM DEĞİLDİR ve vurgulanmaz.
   *
   * Hesabı olmayan çalışan YAYGINDIR ve NORMALDİR (ADR §2.1): depo görevlisi,
   * saha ekibi, sistemi hiç kullanmayan çalışan. Vurgulamak kullanıcıyı
   * herkese hesap açmaya iterdi — yani veri modeli, şirketi LİSANS SATIN
   * ALMAYA zorlardı. Sayı yine de gösterilir: "kimler sisteme giriyor"
   * sorusunun cevabı burada başlar.
   */
  const withoutAccount = items.filter((row) => row.platformUserId === null).length;
  const ended = items.filter((row) => row.employmentStatus === 'ended').length;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Aktif çalışan"
          delta={
            total === 0 ? undefined : (
              <span className="text-fg-3">
                {withoutTitle > 0
                  ? `${String(withoutTitle)} kayıtta unvan girilmemiş`
                  : 'bu sayfadaki kayıtların unvanı tam'}
              </span>
            )
          }
        >
          <HeroFigure>{total}</HeroFigure>
          {total === 0 ? (
            <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
              Henüz çalışan kaydı yok. Ekibi buraya yazdığınızda kimin ne iş yaptığı tek yerde durur
              — sisteme girişi olmayan çalışanlar da dahil.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite
            label="Unvan girilmemiş"
            value={withoutTitle}
            note="bu sayfada"
            tone={withoutTitle > 0 ? 'accent' : 'plain'}
          />
          <Satellite label="Platform hesabı yok" value={withoutAccount} note="bu sayfada" />
          <Satellite label="Ayrılmış" value={ended} note="bu sayfada" />
        </Satellites>
      </Rise>
    </Wall>
  );
}
