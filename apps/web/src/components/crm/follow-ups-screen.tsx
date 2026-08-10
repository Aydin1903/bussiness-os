'use client';

import type { FollowUp } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { listFollowUps } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import {
  EmptyState,
  ModuleBody,
  ModuleHeader,
  Pager,
  RISE,
  SectionLabel,
} from '@/components/module-kit/chrome';
import { CrmTabs } from './chrome';
import { FollowUpMark, isOverdue } from './follow-up-mark';
import { StagePill } from './stage-pill';

export const PAGE_SIZE = 20;

interface ListState {
  readonly items: readonly FollowUp[];
  readonly total: number;
}

function useFollowUps(offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listFollowUps({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

/**
 * `/app/crm/follow-ups` — takipler.
 *
 * ============================================================================
 * BU BİR TAKVİM DEĞİL
 * ============================================================================
 * Görünümün KENDİ VERİSİ YOKTUR: ayrı bir `follow_ups` tablosu kurulmadı, liste
 * `crm.opportunities` üzerinde türetilmiş bir sorgudur (ADR-0031 §3). Somut
 * faydası, fırsat kapandığında takibin listeden KENDİLİĞİNDEN düşmesidir —
 * ayrı bir tabloda bunu elle silmek gerekirdi ve biri unutulduğunda liste yalan
 * söylerdi.
 *
 * Bu yüzden burada "takibi tamamla" diye bir düğme YOK: tamamlamak, fırsatın
 * tarihini ilerletmek ya da aşamasını kapatmaktır ve o iş fırsatın kendi
 * formunda yapılır.
 *
 * ============================================================================
 * GECİKMİŞLER ÖNE ÇIKAR — ama AYRI BİR LİSTEYE alınmaz
 * ============================================================================
 * Sunucu kronolojik sıralar, dolayısıyla gecikmişler zaten en üsttedir. Onları
 * ayrı bir bloğa taşımak kronolojiyi kırar ve "yarın" ile "3 gün gecikmiş"
 * arasındaki mesafe okunamaz olurdu. Ayrım VURGUYLA yapılır: geciken satır
 * terracotta çubuğunu KALICI taşır (diğerlerinde yalnızca hover'da belirir) ve
 * kaç gün geciktiğini yazar.
 */
export function FollowUpsScreen() {
  const [offset, setOffset] = useState(0);
  const { state, error, loading } = useFollowUps(offset);

  const overdueCount = state.items.filter((item) => isOverdue(item.nextFollowUpOn)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        title="Takipler"
        subtitle={
          <Subtitle
            loading={loading}
            failed={error !== null}
            total={state.total}
            overdueCount={overdueCount}
          />
        }
        right={<CrmTabs />}
      />

      <ModuleBody>
        <FormError message={error} />

        <Rise delay={RISE.body}>
          {state.items.length === 0 ? (
            <EmptyContent loading={loading} failed={error !== null} />
          ) : (
            <>
              <div className="mb-3">
                <SectionLabel>Yaklaşan takipler</SectionLabel>
              </div>
              <ul className="flex flex-col gap-2.5">
                {state.items.map((item) => (
                  <li key={item.opportunityId}>
                    <FollowUpRow item={item} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Rise>

        <Pager
          offset={offset}
          count={state.items.length}
          total={state.total}
          loading={loading}
          onPrevious={() => {
            setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
          }}
          onNext={() => {
            setOffset((previous) => previous + PAGE_SIZE);
          }}
        />
      </ModuleBody>
    </div>
  );
}

function Subtitle({
  loading,
  failed,
  total,
  overdueCount,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
  overdueCount: number;
}) {
  if (failed) {
    return <>Takip listeniz şu an açılamıyor</>;
  }
  if (loading) {
    return <>Aramanız veya görüşmeniz gereken müşteriler</>;
  }

  return (
    <>
      {/*
        ⚠️ "N müşteri" DEĞİL: sayı TAKİPLERİ sayar ve bir müşterinin birden çok
        fırsatı olabilir. Gerçek veriyle ekran görüntüsü alınırken yakalandı —
        aynı müşterinin iki fırsatı "2 müşteriyle görüşmeniz var" diye
        yazılıyordu, düpedüz yanlıştı.
      */}
      <b className="font-semibold text-fg tabular">{total}</b> görüşme yapmanız gerekiyor
      {/*
        Gecikme sayısı YALNIZCA bu sayfadaki satırlardan hesaplanır ve metin de
        bunu söyler ("bu sayfada"). Toplam gecikme sayısını vermek için sunucuya
        ayrı bir sorgu gerekirdi; sayfadaki sayıyı "toplam" gibi sunmak sessizce
        yanlış olurdu.
      */}
      {overdueCount > 0 ? (
        <>
          {' · '}
          <b className="font-semibold text-ink tabular">{overdueCount}</b> tanesi bu sayfada
          gecikmiş
        </>
      ) : null}
    </>
  );
}

function EmptyContent({ loading, failed }: { loading: boolean; failed: boolean }) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    return null;
  }

  return (
    <EmptyState
      title="Bekleyen takip yok"
      hint="Bir fırsata takip tarihi verdiğinizde, o müşteri burada listelenir. Fırsatı kapattığınızda listeden kendiliğinden düşer."
      action={
        <Link
          href="/app/crm/pipeline"
          className="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
        >
          Fırsatlara bak
        </Link>
      }
    />
  );
}

function FollowUpRow({ item }: { item: FollowUp }) {
  const overdue = isOverdue(item.nextFollowUpOn);

  return (
    <div
      className={[
        'group relative flex flex-col gap-[10px] overflow-hidden rounded-card px-[22px] py-[20px]',
        'border border-border bg-surface shadow-card',
        'transition-[transform,box-shadow] duration-[260ms] ease-rise',
        'hover:-translate-y-[2px] hover:shadow-float',
      ].join(' ')}
    >
      {/*
        Aynı çubuk, iki farklı anlam: hover'da GEZİNME geri bildirimi, gecikmede
        DURUM göstergesi. Geciken satırda kalıcı ve tam boy; diğerlerinde
        yalnızca hover'da ısınır.
      */}
      <span
        aria-hidden
        className={[
          'absolute top-4 bottom-4 left-0 w-[2.5px] origin-center rounded-r-[3px] bg-accent',
          'transition-[opacity,transform] duration-[260ms] ease-rise',
          overdue
            ? 'scale-y-100 opacity-100'
            : 'scale-y-[0.25] opacity-0 group-hover:scale-y-100 group-hover:opacity-100',
        ].join(' ')}
      />

      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <Link
          href={`/app/crm/${item.companyId}`}
          className="text-[15px] font-semibold tracking-[-0.012em] text-fg transition-colors duration-[260ms] ease-rise after:absolute after:inset-0 group-hover:text-ink"
        >
          {item.title}
        </Link>
        <StagePill stage={item.stage} />
      </div>

      <p className="text-[12.5px] text-fg-2">{item.companyName}</p>

      <FollowUpMark day={item.nextFollowUpOn} />
    </div>
  );
}
