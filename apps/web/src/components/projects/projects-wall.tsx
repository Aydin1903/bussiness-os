'use client';

import { useEffect, useState } from 'react';

import { Rise } from '@/components/panel/stream';
import { Hero, HeroFigure, ROOM_RISE, Satellite, Satellites, Wall } from '@/components/room/room';
import { listProjects, listTasks } from '@/lib/api/projects';

/**
 * PROJELER ODASININ DUVARI — üç rotanın PAYLAŞTIĞI yüzey.
 *
 * ============================================================================
 * KAHRAMAN SAYI DEĞİL, RİSKTİR (ADR-0038 §5)
 * ============================================================================
 * "Kaç proje var" yanlış sorudur — cevabı bilmek hiçbir şeyi değiştirmez.
 * İşletme sahibinin sorduğu şey **"kaçı yolunda gitmiyor"**dur. Bu yüzden
 * kahraman yürüyen iş sayısıdır ve hemen altındaki satır riski söyler; uydular
 * gecikmiş görevleri ve projesiz işleri sayar.
 *
 * ⚠️ Duvar ORTAKTIR, tezgah değişir (ADR-0038 §6.5): proje listesi ve
 * yapılacaklar aynı odanın iki çalışma yüzeyidir.
 *
 * ============================================================================
 * ⚠️ DURGUNLUK BURADA TÜRETİLMİYOR — ve bu bilinçli
 * ============================================================================
 * ADR-0033 §4 "durgunluk TÜRETİLİR, `last_activity_at` kolonu YOK" der ve o
 * türetme sunucudaki yapısal katkıcıda yaşar. İstemcide ikinci bir durgunluk
 * tanımı yazmak, aynı kavramın iki ayrı hesabı demek olurdu ve ayrıştıklarında
 * hata SESSİZ olurdu: ekran "durgun değil" derken asistan "durgun" derdi.
 *
 * Duvar bu yüzden yalnızca sunucunun DOĞRUDAN verdiği ölçüleri gösterir:
 * durum bazlı proje sayıları ve gecikmiş görev sayısı.
 */

/** Sunucu üst sınırı; sayım için `total` kullanılıyor, satırlar değil. */
const PAGE = 1;

interface Snapshot {
  readonly running: number;
  readonly planning: number;
  readonly overdueTasks: number;
  readonly looseTasks: number;
}

export function ProjectsWall() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    /*
     * ⚠️ `limit: 1` — SATIRLAR DEĞİL, `total` isteniyor.
     *
     * Duvarın ihtiyacı yalnızca sayılardır ve sunucu her listede `total`
     * döndürür. Yüz satır çekip istemcide saymak hem gereksiz veri taşır hem de
     * sayfaya sığmayanları kaybederdi — sayım o zaman SESSİZCE eksik olurdu.
     */
    Promise.all([
      listProjects({ limit: PAGE, offset: 0, status: 'in_progress' }),
      listProjects({ limit: PAGE, offset: 0, status: 'planning' }),
      listTasks({ limit: PAGE, offset: 0, overdue: true }),
      listTasks({ limit: PAGE, offset: 0, withoutProject: true, status: 'todo' }),
    ])
      .then(([running, planning, overdue, loose]) => {
        if (!active) {
          return;
        }
        setSnapshot({
          running: running.total,
          planning: planning.total,
          overdueTasks: overdue.total,
          looseTasks: loose.total,
        });
      })
      .catch(() => {
        if (active) {
          // ⚠️ Duvar çizilmez. "0 iş" bir ölçüm değil, ölçememenin sonucudur —
          // ve bu odada en büyük puntoyla yazılırdı.
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
          <span className="block h-[9px] w-[130px] rounded bg-fill-2" />
          <span className="block h-[52px] w-[38%] rounded-[10px] bg-fill-2" />
          <span className="block h-[11px] w-[150px] rounded bg-fill-2" />
        </div>
      </Wall>
    );
  }

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        <Hero
          label="Yürüyen iş"
          delta={
            <>
              {snapshot.planning > 0 ? (
                <span>
                  <b className="tabular font-semibold text-fg">{snapshot.planning}</b> proje
                  planlamada
                </span>
              ) : (
                <span className="text-fg-3">planlamada bekleyen proje yok</span>
              )}
            </>
          }
        >
          <HeroFigure>{snapshot.running}</HeroFigure>
          {snapshot.running === 0 ? (
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Şu an yürüyen bir iş yok. Bir proje açıp durumunu &ldquo;Devam Ediyor&rdquo; yapınca
              burada görünür.
            </p>
          ) : null}
        </Hero>
      </Rise>

      <Rise delay={ROOM_RISE.ai}>
        <Satellites>
          <Satellite
            label="Gecikmiş görev"
            value={snapshot.overdueTasks}
            note={snapshot.overdueTasks > 0 ? 'teslim tarihi geçti' : 'gecikme yok'}
            tone={snapshot.overdueTasks > 0 ? 'accent' : 'plain'}
          />
          {/*
            Projesiz görevler ADR-0033 §2'nin bilinçli sonucudur: `project_id`
            NULLABLE'dır çünkü bir görev tanımı gereği bir projeye ait değildir.
            Sayının görünür olması o kararın karşılığıdır — aksi halde bu işler
            hiçbir proje sayfasında görünmediği için kaybolurdu.
          */}
          <Satellite
            label="Projesiz iş"
            value={snapshot.looseTasks}
            note="tek başına duran görev"
          />
        </Satellites>
      </Rise>
    </Wall>
  );
}
