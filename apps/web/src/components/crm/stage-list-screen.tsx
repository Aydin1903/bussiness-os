'use client';

import {
  OPPORTUNITY_STAGE_LABELS,
  opportunityStageSchema,
  type OpportunityListRow,
} from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { listOpportunities } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { EmptyState, Pager, RISE, SectionLabel } from '@/components/module-kit/chrome';
import { CrmTabs } from './chrome';
import { CrmWall } from './crm-wall';
import {
  Desk,
  DeskBody,
  DeskHead,
  Room,
  RoomScroll,
  RoomTop,
  DeskSkeleton,
} from '@/components/room/room';
import { FollowUpMark } from './follow-up-mark';
import { StageAgeMark } from './signals';
import { formatMoney } from './stage-pill';
import { CLOSED_OPPORTUNITY_STAGES } from '@business-os/contracts';

export const PAGE_SIZE = 20;

interface ListState {
  readonly items: readonly OpportunityListRow[];
  readonly total: number;
}

function useStageList(stage: string, offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const parsed = opportunityStageSchema.safeParse(stage);
    if (!parsed.success) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    // Panoyla AYNI sıralama (`priority`). Farklı olsaydı, panoda üstte duran
    // fırsat tam listede bambaşka bir yerde çıkardı ve "tümünü gör" bağlantısı
    // beklenmedik bir yere açılmış gibi olurdu.
    listOpportunities({ limit: PAGE_SIZE, offset, stage: parsed.data, order: 'priority' })
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
  }, [stage, offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

/**
 * `/app/crm/pipeline/[stage]` — bir aşamanın TAM listesi.
 *
 * ============================================================================
 * PANONUN BÜYÜK KARTLARI BURADA KULLANILMAZ
 * ============================================================================
 * Pano bir ÖZETTİR: az sayıda kart, her biri geniş ve okunaklı. Burası bir
 * ARŞİVDİR: yirmi satır, sayfalı, taranarak okunur. Aynı kartı kullanmak
 * ekranı üç ekran boyu uzatır ve tarama işini imkânsız kılardı.
 *
 * Bu yüzden satırlar KOMPAKT: tek satırda başlık · müşteri · tutar · rozet.
 * Ölçüler `note-list.tsx`'in arşiv mantığına yakın, görünüm ise Atölye'nin
 * kart dili — yeni bir yüzey türü icat edilmedi.
 *
 * ============================================================================
 * AYRI ROTA, SATIR İÇİ AÇILMA DEĞİL
 * ============================================================================
 * Sütun ~205px; kompakt liste oraya sığmaz. Tam genişliğe açılan bir panel ise
 * panoyu aşağı iter ve "her aşama tek ekranda" hedefini bozardı. Rota
 * paylaşılabilir, geri tuşu çalışır ve Atölye'nin "modal yok" ilkesiyle
 * çakışmaz.
 */
export function StageListScreen({ stage }: { stage: string }) {
  const [offset, setOffset] = useState(0);
  const { state, error, loading } = useStageList(stage, offset);

  const parsed = opportunityStageSchema.safeParse(stage);

  // Geçersiz aşama: uydurma bir başlık yazmak yerine ne olduğu söylenir.
  if (!parsed.success) {
    return <UnknownStage />;
  }

  const label = OPPORTUNITY_STAGE_LABELS[parsed.data];
  const closed = CLOSED_OPPORTUNITY_STAGES.includes(parsed.data);

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name={label}
          meta={<Subtitle loading={loading} failed={error !== null} total={state.total} />}
          action={<CrmTabs />}
        />

        <CrmWall />

        <Desk>
          <DeskHead title="Aşamadaki fırsatlar" />
          <DeskBody>
            <BackLink />

            <FormError message={error} />

            <Rise delay={RISE.body}>
              {state.items.length === 0 ? (
                <EmptyContent loading={loading} failed={error !== null} label={label} />
              ) : (
                <>
                  <div className="mb-3">
                    <SectionLabel>Önce gecikmiş takipler</SectionLabel>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {state.items.map((item) => (
                      <li key={item.id}>
                        <CompactRow item={item} closed={closed} />
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
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Panoya dönüş.
 *
 * `aria-label` ŞART: sekme şeridinde de "Fırsatlar" adlı bir bağlantı var ve
 * ikisi ekran okuyucuda ayırt edilemezdi (testte "found multiple elements"
 * olarak yakalandı). Görünen metin kısa kalır, erişilebilir ad nereye
 * gittiğini söyler.
 */
function BackLink() {
  return (
    <Link
      href="/app/crm/pipeline"
      aria-label="Fırsatlar panosuna dön"
      className="mb-5 inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase transition-colors duration-150 hover:text-ink"
    >
      <span aria-hidden>←</span> Fırsatlar
    </Link>
  );
}

function Subtitle({
  loading,
  failed,
  total,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (failed) {
    return <>Bu aşamadaki fırsatlar şu an listelenemiyor</>;
  }
  if (loading) {
    return <>Bu aşamadaki tüm fırsatlar</>;
  }

  return (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> fırsat bu aşamada
    </>
  );
}

function EmptyContent({
  loading,
  failed,
  label,
}: {
  loading: boolean;
  failed: boolean;
  label: string;
}) {
  if (loading) {
    // ⚠️ İskelet, listenin KENDİ şeklini taşır: düz metin ekranı bir an boş
    // gösterip içerik gelince ZIPLATIRDI (ADR-0038 bulgu 5).
    return <DeskSkeleton />;
  }
  if (failed) {
    return null;
  }

  return (
    <EmptyState
      title={`"${label}" aşamasında fırsat yok`}
      hint="Bir fırsatın aşamasını değiştirdiğinizde burada görünür."
      action={
        <Link
          href="/app/crm/pipeline"
          className="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
        >
          Panoya dön
        </Link>
      }
    />
  );
}

/**
 * Kompakt satır — panodaki kartın ARŞİV hâli.
 *
 * Dolgu 22/20 değil `18/12`: burada amaç taramak, okumak değil. Bilgi tek
 * satırda toplanır ve dar ekranda sarar. Hover çubuğu ve kalkma korunur —
 * tıklanabilirlik hissi sistemin her yerinde aynı.
 */
function CompactRow({ item, closed }: { item: OpportunityListRow; closed: boolean }) {
  const money = formatMoney(item.estimatedValue, item.currency);

  return (
    <div
      className={[
        'group relative flex flex-wrap items-center gap-x-3 gap-y-1.5 overflow-hidden',
        'rounded-card border border-border bg-surface px-[18px] py-[12px] shadow-card',
        'transition-[transform,box-shadow] duration-[260ms] ease-rise',
        'hover:-translate-y-[1px] hover:shadow-float',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-2.5 bottom-2.5 left-0 w-[2.5px] origin-center scale-y-[0.25] rounded-r-[3px] bg-accent',
          'opacity-0 transition-[opacity,transform] duration-[260ms] ease-rise',
          'group-hover:scale-y-100 group-hover:opacity-100',
        ].join(' ')}
      />

      {/* Bağlantı MÜŞTERİYE gider: fırsatın kendi sayfası yok (panoyla aynı). */}
      <Link
        href={`/app/crm/${item.companyId}`}
        className="text-[13.5px] font-semibold tracking-[-0.01em] text-fg transition-colors duration-[260ms] ease-rise after:absolute after:inset-0 group-hover:text-ink"
      >
        {item.title}
      </Link>

      <span className="text-[12px] text-fg-2">{item.companyName}</span>

      {money === null ? null : (
        <span className="font-mono text-[12px] font-medium text-fg tabular">{money}</span>
      )}

      {/* Rozetler sağa yaslanır: satırın sonu "dikkat" bölgesidir. */}
      <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        {item.nextFollowUpOn === null ? null : <FollowUpMark day={item.nextFollowUpOn} />}
        <StageAgeMark stageChangedAt={item.stageChangedAt} closed={closed} />
      </span>
    </div>
  );
}

/** Yoldaki aşama adı beş aşamadan biri değil. */
function UnknownStage() {
  return (
    <Room>
      <RoomScroll>
        {/* Alt satır ile boş durum başlığı AYNI cümleyi tekrar etmez. */}
        <RoomTop name="Fırsatlar" meta="Adres satırındaki aşama tanınmadı" action={<CrmTabs />} />

        {/*
        ⚠️ BİLİNMEYEN AŞAMADA DUVAR ÇİZİLMEZ. Duvar odanın DURUMUNU söyler;
        burada durum "böyle bir yer yok"tur ve bunun üstüne havadaki işin
        toplamını yazmak, hatalı bir adresi normal bir sayfa gibi gösterirdi.
      */}

        <Desk>
          <DeskHead title="Aşamadaki fırsatlar" />
          <DeskBody>
            <EmptyState
              title="Böyle bir aşama yok"
              hint="Adres satırındaki aşama adı beş aşamadan biri değil. Panodan doğru aşamaya girebilirsiniz."
              action={
                <Link
                  href="/app/crm/pipeline"
                  className="text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
                >
                  Panoya dön
                </Link>
              }
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}
