'use client';

import type { DocumentRow } from '@business-os/contracts';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';

/**
 * BELGELER ODASININ DUVARI (ADR-0038 §5).
 *
 * ============================================================================
 * KAHRAMAN NEDEN "ARANAMAYAN BELGE SAYISI" DEĞİL DE TOPLAM
 * ============================================================================
 * Duvarın sorusu "ne oluyor"dur. Bir arşivde bu sorunun cevabı arşivin
 * BÜYÜKLÜĞÜDÜR — kullanıcı önce "kaç belgem var" diye bakar.
 *
 * Aranamayan belgeler bir UYDUDUR ve yalnızca VARSA öne çıkar (`danger` tonu).
 * Kahramana konsaydı boş bir arşivde bile "0 aranamıyor" yazardı: bir sorun
 * olmadığında sorun diliyle konuşmak, gerçek bir sorun çıktığında sinyali
 * körelten şeydir.
 *
 * ============================================================================
 * ⚠️ DUVAR VERİYİ KENDİ ÇEKMEZ — LİSTEDEN ALIR
 * ============================================================================
 * `AppointmentsWall` kendi isteğini atıyordu çünkü sorusu listeninkinden
 * FARKLIYDI (bugün+yarın penceresi vs. tüm kayıtlar). Burada soru AYNI: her
 * ikisi de `GET /documents` sayfasına bakıyor.
 *
 * İkinci bir istek atmak, aynı veriyi iki kez çekip iki kez ödemek olurdu —
 * ve daha kötüsü, iki sayı arasında GEÇİCİ TUTARSIZLIK üretirdi (duvar "12
 * belge" derken liste 13 satır gösterebilirdi).
 *
 * ⚠️ Bedeli açıkça: uydular YALNIZCA GÖRÜNEN SAYFAYI sayar, tüm arşivi değil.
 * Kahraman rakam (`total`) sunucudan gelir ve DOĞRUDUR; "aranamayan" sayısı
 * sayfa başınadır ve bu, etiketinde yazılıdır.
 */
export function DocumentsWall({
  total,
  items,
  loading,
}: {
  readonly total: number;
  readonly items: readonly DocumentRow[];
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

  const unsearchable = items.filter((row) => row.chunkCount === 0).length;
  const linked = items.filter((row) => row.crmContactId !== null || row.projectId !== null).length;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Arşiv"
          delta={
            total === 0 ? undefined : (
              <span className="text-fg-3">sözleşmeler, teklifler ve şartnameler tek yerde</span>
            )
          }
        >
          <HeroFigure>{total}</HeroFigure>
          {total === 0 ? (
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Henüz belge yüklenmedi. PDF ve Word dosyalarını yükleyin; içerikleri asistanın
              sorularına kaynak olur.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite
            label="Bağlantılı"
            value={linked}
            note="bu sayfada"
            tone={linked > 0 ? 'accent' : 'plain'}
          />
          {/*
            ⚠️ VURGU YALNIZCA gerçekten aranamayan belge varsa. Sıfırken nötr
            kalır: sürekli vurgulu duran bir sayaç, gerçekten dikkat isteyen
            günde fark edilmez.

            ⚠️ `Satellite` yalnızca `plain | accent` tanır ve oda API'si bu iş
            için GENİŞLETİLMEDİ. "Sorun" anlamını taşıyan şey renk değil
            NOTTUR ("metni okunamadı") — zaten FRONTEND §4.8 rengin tek bilgi
            taşıyıcısı olmasını yasaklıyor. Listedeki `IndexPill` uyarı rengini
            kayıt başına zaten taşıyor.
          */}
          <Satellite
            label="Aranamıyor"
            value={unsearchable}
            note={unsearchable > 0 ? 'metni okunamadı' : 'bu sayfada'}
            tone={unsearchable > 0 ? 'accent' : 'plain'}
          />
        </Satellites>
      </Rise>
    </Wall>
  );
}
