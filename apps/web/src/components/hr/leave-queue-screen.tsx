'use client';

import type { Employee, LeaveRequest, LeaveStatus } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, RISE } from '@/components/module-kit/chrome';
import { CardHeader, CardMeta, RecordCard } from '@/components/module-kit/record-card';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskSkeleton,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import { decideLeave, listEmployees, listLeave } from '@/lib/api/hr';
import { canDecideLeave } from '@/lib/config/hr';
import { useCurrentRole } from '@/lib/session/use-current-role';
import { HrTabs, LEAVE_TYPE_LABELS, LeaveStatusFilter, formatDay } from './chrome';

export const PAGE_SIZE = 20;

/**
 * İZİN KUYRUĞU — ⚠️ İK'CININ GÜNLÜK EKRANI (ADR-0044 §2).
 *
 * ============================================================================
 * ⚠️ VARSAYILAN FİLTRE `pending` — VE BU EKRANIN VAR OLMA SEBEBİ BUDUR
 * ============================================================================
 * İK'cının sabah sorduğu soru _"onay bekleyen izin var mı"_dır. Varsayılan
 * "hepsi" olsaydı ekran bir ARŞİV olurdu ve bekleyen bir talep, onaylanmış
 * yüzlerce kaydın arasında **kaybolurdu** — hata sessiz olurdu: kimse
 * reddedilmez, sadece kimse cevaplanmaz.
 *
 * ============================================================================
 * ⚠️ AD ÇÖZÜMÜ İK'NIN KENDİ VERİSİNDEN — UYDURULMAZ
 * ============================================================================
 * `leave_requests` yalnızca `employee_id` taşır. Ad, çalışan listesinden
 * kurulan bir haritayla çözülür; harita ilk 100 kaydı kapsar ve çözülemezse
 * **ad gösterilmez** (kayda tıklanabilir bağlantı yine çalışır). "Bir çalışan"
 * yazmak bile bir İDDİADIR.
 */
export function LeaveQueueScreen() {
  const role = useCurrentRole();
  const canDecide = canDecideLeave(role);

  const [items, setItems] = useState<readonly LeaveRequest[]>([]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<LeaveStatus | undefined>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listLeave({ limit: PAGE_SIZE, offset, ...(status === undefined ? {} : { status }) })
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [offset, status]);

  useEffect(load, [load]);

  useEffect(() => {
    let active = true;

    listEmployees({ limit: 100, offset: 0 })
      .then((response) => {
        if (active) {
          setNames(new Map(response.items.map((row: Employee) => [row.id, row.fullName])));
        }
      })
      .catch(() => {
        // Sessiz: ad bir KOLAYLIKTIR. Çözülemezse gösterilmez, uydurulmaz.
      });

    return () => {
      active = false;
    };
  }, []);

  function decide(leaveId: string, next: 'approved' | 'rejected'): void {
    decideLeave(leaveId, { status: next })
      .then(load)
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      });
  }

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="İzinler"
          meta={total === 0 ? undefined : `${String(total)} kayıt`}
          action={<HrTabs />}
        />

        {/*
          ⚠️ BU EKRANIN DUVARI YOKTUR ve bu, ADR-0038'in kuralının bilinçli
          uygulamasıdır: duvar ORTAKTIR, tezgah değişir. İzin kuyruğu Ekip
          odasının aynı durumunu (kaç çalışan, kaç kişi izinde) sorar — ikinci
          bir duvar aynı sayıları İKİ KEZ çeker ve aralarında geçici
          tutarsızlık üretirdi.
        */}
        <Desk>
          <DeskHead
            title="İzin talepleri"
            right={
              <LeaveStatusFilter
                value={status}
                onChange={(next) => {
                  setStatus(next);
                  setOffset(0);
                }}
              />
            }
          />

          <DeskBody>
            <FormError message={error} />

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title={status === 'pending' ? 'Onay bekleyen izin yok' : 'Kayıt yok'}
                hint="İzin talepleri çalışanın detay sayfasından girilir. Onaylanan yıllık izinler hak edişten düşer; ücretsiz ve mazeret izni düşmez."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {items.map((leave) => (
                  <Rise key={leave.id} delay={RISE.body}>
                    <RecordCard>
                      <CardHeader>
                        <Link
                          href={`/app/hr/${leave.employeeId}`}
                          className="truncate text-[14.5px] font-semibold tracking-[-0.015em] text-fg hover:text-ink"
                        >
                          {names.get(leave.employeeId) ?? 'Çalışan kaydı'}
                        </Link>

                        <div className="flex items-center gap-2">
                          <StatusText status={leave.status} />
                          {/*
                            ⚠️ Karar düğmeleri YALNIZCA `pending` iken çizilir:
                            karara bağlanmış bir izin yeniden karara bağlanamaz
                            (sunucu 409 döner). Düğmeyi göstermek, çalışmayacak
                            bir eylem sunmaktı.
                          */}
                          {canDecide && leave.status === 'pending' ? (
                            <>
                              <QueueButton
                                onClick={() => {
                                  decide(leave.id, 'approved');
                                }}
                              >
                                Onayla
                              </QueueButton>
                              <QueueButton
                                onClick={() => {
                                  decide(leave.id, 'rejected');
                                }}
                              >
                                Reddet
                              </QueueButton>
                            </>
                          ) : null}
                        </div>
                      </CardHeader>

                      {/* ⚠️ "SEBEP" DİYE BİR ALAN YOK — yazacak verisi de yok. */}
                      <CardMeta
                        items={[
                          LEAVE_TYPE_LABELS[leave.type],
                          `${formatDay(leave.startsOn)} – ${formatDay(leave.endsOn)}`,
                          `${String(leave.days)} gün`,
                        ]}
                      />
                    </RecordCard>
                  </Rise>
                ))}
              </div>
            )}

            <Pager
              offset={offset}
              count={items.length}
              total={total}
              loading={loading}
              onPrevious={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset(offset + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

function StatusText({ status }: { readonly status: LeaveStatus }) {
  const label =
    status === 'approved' ? 'Onaylandı' : status === 'rejected' ? 'Reddedildi' : 'Bekliyor';

  return (
    <span
      className={[
        'font-mono text-[9.5px] font-medium tracking-[0.09em] uppercase',
        // ⚠️ Renk TEK BAŞINA bilgi taşımaz: durum ayrıca YAZIYLA da söylenir.
        status === 'pending' ? 'text-ink' : 'text-fg-3',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function QueueButton({
  children,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border px-3 py-[3px] text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent hover:text-ink"
    >
      {children}
    </button>
  );
}
