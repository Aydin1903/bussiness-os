'use client';

import type { LoyaltySummary } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';
import { formatPoints } from '@/lib/config/loyalty';

/**
 * Sadakat odasının ORTAK duvarı (ADR-0038, ADR-0051 §9.1).
 *
 * ⚠️ DUVAR ORTAKTIR, TEZGAH DEĞİŞİR: liste ve detay aynı odanın iki çalışma
 * yüzeyidir — ama detay sayfalarının DUVARI YOKTUR (özetlenecek bir durum
 * değil, tek bir kayıt var). Bu bileşen yalnızca listede kullanılır.
 *
 * ============================================================================
 * ⚠️ KAHRAMAN RAKAM PROJEDE İLK KEZ ANLAMLI BİR **TOPLAM**
 * ============================================================================
 * Bugüne kadarki her odada bu bir SAYIM ya da bir ORTALAMA idi ve iki kural
 * toplamayı yasaklıyordu:
 *
 *   ADR-0034 §5 -> farklı PARA BİRİMLERİ toplanmaz
 *   ADR-0039 §4 -> farklı BİRİMLER toplanmaz (3 kg un + 12 adet vida)
 *
 * ⚠️ İkisi de burada TETİKLENMEZ: puanın para birimi YOKTUR ve tenant'ın
 * programında tek bir birim vardır ("puan"). Bu yüzden "dolaşımdaki toplam
 * puan" gerçek bir büyüklüktür — ve bir **YÜKÜMLÜLÜKTÜR** (müşterinin
 * harcayabileceği bir hak).
 *
 * ⚠️ AMA BİR PARA RAKAMI DEĞİLDİR: para birimi simgesi ya da kodu YAZILMAZ.
 * Puanın TL karşılığı bu modülde modellenmez (§10) ve bir simge, olmayan bir
 * dönüşümü İMA ederdi.
 *
 * ⚠️ `accountCount === 0` iken rakam yerine BOŞ DURUM gösterilir. `0` basmak
 * doğru olurdu ama boş bir odada bir sıfır, bir HABER gibi okunur
 * (ADR-0047 §9'un kuralı, ikinci kez).
 */
export function LoyaltyWall({
  summary,
  loading,
}: {
  readonly summary: LoyaltySummary | null;
  readonly loading: boolean;
}) {
  if (loading || summary === null) {
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

  const window = `son ${String(summary.windowDays)} günde`;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Dolaşımdaki puan"
          delta={
            <span className="text-fg-3">
              {summary.accountCount === 0
                ? 'henüz hesap yok'
                : `${String(summary.accountCount)} sadakat hesabı`}
            </span>
          }
        >
          {summary.accountCount === 0 ? (
            <>
              {/*
                ⚠️ `0` BASILMAZ. Boş bir odada bir sıfır bir HABER gibi okunur;
                bir tire "henüz başlamadınız"ı "hepsi harcandı"dan ayırır.
              */}
              <HeroFigure>—</HeroFigure>
              <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
                Henüz sadakat hesabı yok. Bir müşteriye hesap açtığınızda burada görünür; puan
                kazandırdıkça bu rakam müşterilerinize borçlu olduğunuz toplam puanı gösterir.
              </p>
            </>
          ) : (
            <HeroFigure>{formatPoints(summary.outstandingPoints)}</HeroFigure>
          )}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          {/*
            ⚠️ İKİ UYDU DA "son 30 günde" — VE İKİSİ BİRLİKTE OKUNUR:
            kazandırılan > kullanılan ise yükümlülük BÜYÜYOR demektir.
            Tek başına hiçbiri bunu söylemez, bu yüzden yan yana duruyorlar.
          */}
          <Satellite
            label="Kazandırılan"
            value={formatPoints(summary.earnedInWindow)}
            note={window}
            tone="plain"
          />
          <Satellite
            label="Kullanılan"
            value={formatPoints(summary.spentInWindow)}
            note={window}
            tone="plain"
          />
          {/*
            ⚠️ HESAP SAYISI VURGULANMAZ: bir sayımdır, bir haber değil
            (ADR-0043'ün reddettiği "12 aktif çalışan" sınıfı). Duvarda
            OLMASININ sebebi kahraman rakamın PAYDASI olmasıdır — 12.400 puan,
            3 hesapta bambaşka bir şeydir, 300 hesapta bambaşka.
          */}
          <Satellite label="Hesap" value={summary.accountCount} note="toplam" tone="plain" />
        </Satellites>
      </Rise>
    </Wall>
  );
}
