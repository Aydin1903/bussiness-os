'use client';

import type { CampaignSummary } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * Kampanya odasının ORTAK duvarı (ADR-0038, ADR-0047 §9).
 *
 * ⚠️ DUVAR ORTAKTIR, TEZGAH DEĞİŞİR: liste ve detay aynı odanın iki çalışma
 * yüzeyidir — ama detay sayfalarının DUVARI YOKTUR (özetlenecek bir durum
 * değil, tek bir kayıt var). Bu bileşen yalnızca listede kullanılır.
 *
 * ============================================================================
 * ⚠️ KAHRAMAN RAKAM BİR SAYIDIR, BİR ORTALAMA DEĞİL
 * ============================================================================
 * ADR-0034'ün para birimi ve ADR-0039'un birim kuralı burada TETİKLENMEZ
 * (toplanacak bir büyüklük yok); ADR-0045'in "N olmadan ortalama gösterilmez"
 * kuralı da GEÇERLİ DEĞİLDİR — bu bir sayım.
 *
 * ⚠️ `totalCount === 0` iken rakam yerine BOŞ DURUM gösterilir. `0` basmak
 * doğru olurdu ama boş bir odada bir sıfır, bir HABER gibi okunur.
 */
export function MarketingWall({
  summary,
  loading,
}: {
  readonly summary: CampaignSummary | null;
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
          label="Yayında kampanya"
          delta={
            <span className="text-fg-3">
              {summary.totalCount === 0
                ? 'henüz kampanya yok'
                : `toplam ${String(summary.totalCount)} kampanya`}
            </span>
          }
        >
          {summary.totalCount === 0 ? (
            <>
              {/*
                ⚠️ `0` BASILMAZ. Boş bir odada bir sıfır bir HABER gibi okunur;
                bir tire "henüz başlamadınız"ı "hepsi bitti"den ayırır.
              */}
              <HeroFigure>—</HeroFigure>
              <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
                Henüz kampanya yok. Bir kampanya kaydettiğinizde burada görünür; bittiğinde sonuç
                notunu yazarsanız o cümle asistanın kurumsal hafızasına girer.
              </p>
            </>
          ) : (
            <HeroFigure>{summary.activeCount}</HeroFigure>
          )}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite label="Biten" value={summary.endedInWindow} note={window} tone="plain" />

          {/*
            ⚠️ TEK VURGULANAN UYDU — VE `campaign-gap` KATKICISININ SAYDIĞI
            KÜMENİN TA KENDİSİ (ADR-0047 §9.1).

            ⚠️ Ama ikisi AYNI ŞEY DEĞİLDİR: bu sayı yalnızca EKRANA gider;
            katkıcı `POST /ask` havuzuna girer, taban yuvası tüketir ve T2'yi
            etkiler. Kaydedilmeseydi ileride birisi "zaten ekranda gösteriyoruz"
            diye yapısal katkıcıyı GEREKSİZ sanabilirdi.
          */}
          <Satellite
            label="Sonucu yazılmadı"
            value={summary.missingResultCount}
            note="bitmiş kampanyalar"
            tone={summary.missingResultCount > 0 ? 'accent' : 'plain'}
          />

          {/*
            ⚠️ BU UYDU MODÜLÜN KENDİ SINIRINI GÖRÜNÜR KILAR: sonuç notu olmayan
            bir kampanyanın gömülecek metni yoktur, yani `POST /ask` havuzunda
            HİÇBİR SESİ OLMAZ. Göstermemek, kullanıcının "asistan neden bu
            kampanyayı bilmiyor" sorusunu CEVAPSIZ bırakırdı.

            ⚠️ VURGULANMAZ: sonuç notu olmayan bir kampanya bir HATA DEĞİLDİR —
            süren bir kampanyanın sonucu henüz YOKTUR. Vurgulamak, kullanıcıyı
            sonucu UYDURMAYA iterdi.

            Belge'nin `chunkCount: 0` → "Aranamıyor" rozetiyle aynı desen,
            üçüncü kez.
          */}
          <Satellite
            label="Aranamayan"
            value={summary.unsearchableCount}
            note="sonuç notu yok"
            tone="plain"
          />
        </Satellites>
      </Rise>
    </Wall>
  );
}
