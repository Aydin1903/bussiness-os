'use client';

import type { FeedbackSummary } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * GERİ BİLDİRİM ODASININ DUVARI (ADR-0045 §9).
 *
 * ============================================================================
 * ⚠️ KAHRAMAN RAKAM BİR ORTALAMA — VE PROJEDE İLK KEZ
 * ============================================================================
 * Stok'un duvarı _"toplam stok diye bir rakam YOKTUR"_ diyordu (miktarlar
 * birimleri yüzünden toplanamaz); Teklif/Fatura'nınki para birimleri yüzünden
 * bir SAYIYDI. Burada toplanabilirlik sorunu YOKTUR: ölçek SABİTTİR (1..5,
 * §1.3), dolayısıyla ortalama ANLAMLIDIR.
 *
 * ⚠️ Bu, ADR-0034'ün para birimi ve ADR-0039'un birim kuralının bu modülde
 * TETİKLENMEDİĞİ anlamına gelir — ve sebebi ölçeğin sabit tutulmasıdır. NPS
 * eklenseydi (0..10) aynı sütunda iki ölçek yaşar ve ortalama SESSİZCE YANLIŞ
 * olurdu; §1.3 tam olarak bunu engelliyor.
 *
 * ============================================================================
 * ⚠️ N HER ZAMAN YAZILIR — VE `N = 0` İKEN ORTALAMA HİÇ GÖSTERİLMEZ (§9.1)
 * ============================================================================
 * Tek kayıtlı bir tenant'ta _"ortalama 1,0"_ bir haber değil GÜRÜLTÜDÜR.
 *
 * ⚠️ Kural TİP SEVİYESİNDE zorlanıyor: sunucu `average: null` döner ve `0`
 * DÖNMEZ. `0` dönseydi burada `0,0` basılır ve _"çok kötü"_ ile _"hiç veri
 * yok"_ AYNI GÖRÜNÜRDÜ — hata SESSİZ olurdu. Yani bu bileşen bir "0 kontrolü"
 * YAPMAZ; yapamayacağı için yapmaz.
 *
 * ============================================================================
 * ⚠️ BU DUVAR VERİYİ KENDİ ÇEKER — VE SUPPLIERS'TAN BİLİNÇLİ SAPMA
 * ============================================================================
 * `SuppliersWall` / `DocumentsWall` uydularını ÇAĞIRANDAN alıyordu ve
 * etiketlerinde "bu sayfada" yazıyordu — yani yalnızca GÖRÜNEN SAYFAYI
 * sayıyorlardı.
 *
 * Burada bu KABUL EDİLEMEZ: bir ortalama sayfaya bağlı olamaz. Kullanıcı 20
 * kayıtlık sayfayı görür, ortalama 200 kaydın değil O 20'NİN ortalaması olurdu
 * ve hata SESSİZ kalırdı. Bu yüzden özet AYRI BİR UÇTAN gelir
 * (`GET /feedback/summary`) ve toplama SQL'de yapılır.
 *
 * ⚠️ Bedeli açıkça: duvar ile liste AYRI İSTEKLERDİR, yani bir kayıt
 * silindiğinde ikisi kısa bir an ayrışabilir. Telafi, silme sonrası İKİSİNİN
 * DE tazelenmesidir (`reloadToken`) — ve bu, çağıranın sorumluluğudur.
 *
 * ============================================================================
 * ⚠️ BİR "TREND" OKU YOKTUR — VE OLAMAZ (§10)
 * ============================================================================
 * "Geçen aya göre +0,3" göstermek İKİNCİ BİR PENCERE ve bir KARŞILAŞTIRMA
 * kararı demektir; NPS/trend analizi ADR §10'da açıkça kapsam dışıdır. Duvara
 * koymak, sunucuda reddedilen şeyi arayüzden geri getirmek olurdu.
 */
export function FeedbackWall({
  summary,
  loading,
}: {
  readonly summary: FeedbackSummary | null;
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

  /*
   * ⚠️ ETİKET SUNUCUDAN GELEN SAYIYLA kurulur, "30" burada YAZILMAZ.
   * Yazılsaydı sunucudaki pencere değiştiğinde ekran eski sayıyı göstermeye
   * devam ederdi ve hata SESSİZ olurdu (`STALE_STAGE_DAYS` ayrışmasının aynı
   * sınıfı).
   */
  const window = `son ${String(summary.windowDays)} günde`;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Ortalama puan"
          delta={
            /*
             * ⚠️ N HER ZAMAN GÖRÜNÜR — ortalamanın yanında, aynı satırda.
             * Ayrı bir uyduya taşınsaydı kullanıcı ortalamayı N'siz okuyabilir
             * ve tek kayıtlık bir ortalamayı bir eğilim sanabilirdi.
             */
            <span className="text-fg-3">
              {summary.count === 0 ? window : `${String(summary.count)} geri bildirim · ${window}`}
            </span>
          }
        >
          {summary.average === null ? (
            <>
              {/*
                ⚠️ `0,0` BASILMAZ. Sunucu `null` döndüğü için burada gösterecek
                bir sayı YOKTUR — ve bu, tip seviyesinde garanti altındadır.
                Bir tire, "veri yok"u "çok kötü"den ayırır.
              */}
              <HeroFigure>—</HeroFigure>
              <p className="mt-2 max-w-[46ch] text-[12.5px] leading-[1.6] text-fg-2">
                Bu pencerede geri bildirim yok. Puan girdiğinizde ortalama burada belirir; yorum da
                yazarsanız müşterinin kendi cümlesi asistanın kurumsal hafızasına girer.
              </p>
            </>
          ) : (
            /*
             * ⚠️ Sunucunun KANONİK DİZESİ olduğu gibi basılır, `Number`a
             * ÇEVRİLMEZ. Yuvarlama sunucuda yapıldı (`round(avg, 1)`); burada
             * yeniden biçimlendirmek İKİ YERDE İKİ FARKLI yuvarlama demekti —
             * `finance`in "binlik ayracı yok" kararıyla aynı disiplin.
             */
            <HeroFigure>{summary.average}</HeroFigure>
          )}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          {/*
            ⚠️ TEK VURGULANAN UYDU: düşük puan. Eşik SUNUCUDAN gelir
            (`lowRatingMax`), etiket ondan üretilir — "≤2" burada YAZILMAZ.
          */}
          <Satellite
            label={`≤${String(summary.lowRatingMax)} puan`}
            value={summary.lowRatingCount}
            note={window}
            tone={summary.lowRatingCount > 0 ? 'accent' : 'plain'}
          />
          {/*
            ⚠️ BU UYDU MODÜLÜN KENDİ SINIRINI GÖRÜNÜR KILAR (§3.5): yorumsuz
            kayıtların `POST /ask` havuzunda HİÇBİR SESİ YOKTUR. Göstermemek,
            kullanıcının "asistan neden bu puanları bilmiyor" sorusunu CEVAPSIZ
            bırakırdı.

            ⚠️ VURGULANMAZ: yorumsuz bir puan bir HATA DEĞİLDİR (§1.4) — QR
            kodla toplanan geri bildirimlerin çoğu böyledir. Vurgulamak,
            kullanıcıyı müşteri adına yorum UYDURMAYA iterdi.
          */}
          <Satellite label="Yorumsuz" value={summary.withoutCommentCount} note="aranamaz" />
          <Satellite label="Toplam" value={summary.count} note={window} />
        </Satellites>
      </Rise>
    </Wall>
  );
}
