'use client';

import type { AppointmentRow } from '@business-os/contracts';
import { useEffect, useState } from 'react';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';
import { listAppointments } from '@/lib/api/appointments';

/**
 * RANDEVULAR ODASININ DUVARI — iki rotanın PAYLAŞTIĞI yüzey.
 *
 * ============================================================================
 * BEŞ ODANIN İÇİNDE KAHRAMANI BİR BÜYÜKLÜK OLMAYAN TEK ODA (ADR-0038 §5)
 * ============================================================================
 * Finans'ta kahraman bir tutar, CRM'de bir toplam, Projeler'de bir sayıdır.
 * Burada kahraman bir **AN**dır: sıradaki randevunun saati. Bir işletme
 * sahibinin bu ekrandan istediği tek şey budur — "şimdi nereye gitmem
 * gerekiyor".
 *
 * ⚠️ Duvar ORTAKTIR (ADR-0038 §6.5): hafta ızgarası ve liste aynı odanın iki
 * çalışma yüzeyidir; ikisinde de "sıradaki" gözden kaybolmaz.
 *
 * ============================================================================
 * ⚠️ "SIRADAKİ" İSTEMCİDE HESAPLANIR — ve sebebi kayıtlıdır
 * ============================================================================
 * ADR-0035'in bilinen sınırı: **tenant bazlı saat dilimi YOK**. `timestamptz`
 * UTC saklar, çevrimi istemci yapar. Dolayısıyla "şu andan sonraki ilk
 * randevu" sorusunun cevabı da istemcinin saatine göre verilir — sunucunun
 * `CURRENT_TIMESTAMP`i ile kullanıcının saati aynı olmak zorunda değil.
 *
 * Aynı gerekçe `follow-up-mark.tsx › isOverdue`ta da yazılı.
 */

/**
 * Bugün + yarın penceresi.
 *
 * ============================================================================
 * ⚠️ `from`/`to` AN'DIR, TAKVİM GÜNÜ DEĞİL — bir hatanın düzeltmesi
 * ============================================================================
 * İlk yazımda `YYYY-MM-DD` gönderiliyordu; sunucu bu iki alanı `instant` diye
 * doğruluyor (`appointments.dto.ts`) ve istek 422 dönüyordu. Duvar da tasarımı
 * gereği sessizce KAYBOLUYORDU — "ölçemedim" hâli doğru davranıştı ama sebep
 * benim parametre biçimimdi. Tarayıcıda görüldü.
 *
 * ⚠️ `to` HARİÇTİR (`>= from` ve `< to`, `appointments.ts` notu). Bu yüzden
 * yarını kapsamak için sınır ÖBÜR GÜNÜN başlangıcıdır — `to`yu yarının
 * başlangıcı yapmak yarını tamamen dışarıda bırakırdı.
 *
 * Sınırlar YEREL gün başlangıçlarından türetilir; `toISOString()` çevrimi
 * yapar. Doğrudan UTC gün başlangıcı almak, UTC+3'te günü üç saat kaydırırdı.
 */
function todayWindow(): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).toISOString();

  return { from: startOfDay(0), to: startOfDay(2) };
}

interface Snapshot {
  readonly next: AppointmentRow | null;
  readonly todayCount: number;
  readonly upcomingCount: number;
}

export function AppointmentsWall() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const range = todayWindow();

    listAppointments({ limit: 100, offset: 0, ...range, status: 'scheduled' })
      .then((page) => {
        if (!active) {
          return;
        }
        const now = Date.now();
        const upcoming = [...page.items]
          .filter((row) => new Date(row.scheduledAt).getTime() >= now)
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

        const todayKey = new Date().toDateString();

        setSnapshot({
          next: upcoming[0] ?? null,
          todayCount: page.items.filter(
            (row) => new Date(row.scheduledAt).toDateString() === todayKey,
          ).length,
          upcomingCount: upcoming.length,
        });
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return null;
  }

  if (snapshot === null) {
    return (
      <Wall>
        <div aria-hidden className="flex flex-col gap-3">
          <span className="block h-[9px] w-[120px] rounded bg-fill-2" />
          <span className="block h-[52px] w-[42%] rounded-[10px] bg-fill-2" />
          <span className="block h-[11px] w-[160px] rounded bg-fill-2" />
        </div>
      </Wall>
    );
  }

  const next = snapshot.next;

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        {next === null ? (
          <Hero label="Sıradaki">
            <HeroFigure>—</HeroFigure>
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Bugün ve yarın için planlanmış randevunuz yok.
            </p>
          </Hero>
        ) : (
          <Hero
            label={`Sıradaki · ${dayLabel(next.scheduledAt)}`}
            delta={
              <>
                {/*
                  ⚠️ Kişi adı YOKSA uydurma yapılmaz. `crm_contact_id`
                  opsiyoneldir (ADR-0035) ve silinmiş bir kişiye işaret ediyor
                  olabilir — "Bilinmeyen kişi" yazmak, var olmayan bir kaydı
                  varmış gibi gösterirdi.
                */}
                <span className="text-fg">{next.contactName ?? 'Kişisiz randevu'}</span>
                {next.serviceNote === null ? null : (
                  <span className="truncate text-fg-3">· {next.serviceNote}</span>
                )}
              </>
            }
          >
            {/* Kahraman bir SAAT — beş odanın içinde tek "an" kahramanı. */}
            <HeroFigure>{clock(next.scheduledAt)}</HeroFigure>
          </Hero>
        )}
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite
            label="Bugün"
            value={snapshot.todayCount}
            note={snapshot.todayCount > 0 ? 'randevu' : 'boş gün'}
            tone={snapshot.todayCount > 0 ? 'accent' : 'plain'}
          />
          <Satellite label="Yaklaşan" value={snapshot.upcomingCount} note="bugün ve yarın" />
        </Satellites>
      </Rise>
    </Wall>
  );
}

/** Yerel saat `HH:MM`. Sunucu UTC gönderir, çevrimi istemci yapar. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** "bugün" / "yarın" — kullanıcı saate bakmadan hangi gün olduğunu bilmeli. */
function dayLabel(iso: string): string {
  const when = new Date(iso).toDateString();
  const today = new Date().toDateString();
  return when === today ? 'bugün' : 'yarın';
}
