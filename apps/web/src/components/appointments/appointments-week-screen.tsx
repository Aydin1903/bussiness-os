'use client';

import type { AppointmentRow } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { createAppointment, listAppointments, updateAppointment } from '@/lib/api/appointments';
import { errorMessage } from '@/lib/api/error-message';
import {
  EmptyState,
  ModuleBody,
  ModuleHeader,
  PillButton,
  PrimaryButton,
  RISE,
} from '@/components/module-kit/chrome';
import { WeekGrid, addDays, startOfWeek, type TimeBlock } from '@/components/module-kit/week-grid';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { AppointmentTabs, STATUS_TONES } from './chrome';
import { AppointmentForm, type AppointmentFormValues } from './appointment-form';

/** Haftada en fazla kaç kayıt çekilir — sunucu `MAX_LIMIT` 100. */
const WEEK_LIMIT = 100;

/** Blok etiketinde saat — `Intl` yerine sabit biçim: tek dil, tek satır. */
function clock(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function toBlocks(items: readonly AppointmentRow[]): TimeBlock[] {
  return items.map((row) => {
    const startsAt = new Date(row.scheduledAt);
    const endsAt = new Date(startsAt.getTime() + row.durationMinutes * 60_000);

    return {
      id: row.id,
      startsAt,
      endsAt,
      // ⚠️ `contactName` ÜÇ anlama gelir (bağlı değil / silinmiş / izin yok) ve
      // ÜÇÜ AYIRT EDİLMEZ: arayüz hiçbir şey yazmaz. "Silinmiş" yazmak, bir
      // kaydın BİR ZAMANLAR VAR OLDUĞUNU sızdırırdı (ADR-0035 §4).
      label: row.contactName ?? clock(startsAt),
      ...(row.contactName === null
        ? {}
        : { detail: `${clock(startsAt)} · ${String(row.durationMinutes)} dk` }),
      tone: STATUS_TONES[row.status],
    };
  });
}

/** Haftalık takvim — modülün BİRİNCİL görünümü (ADR-0035 §7d). */
export function AppointmentsWeekScreen() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<readonly AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [editing, setEditing] = useState<AppointmentRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ `to` HARİÇ bir sınırdır: gelecek pazartesi 00:00 verilir ve o andaki
    // bir kayıt BU haftaya girmez. `<=` olsaydı sınırdaki randevu İKİ HAFTADA
    // DA görünürdü (ADR-0035 §9).
    listAppointments({
      limit: WEEK_LIMIT,
      offset: 0,
      from: weekStart.toISOString(),
      to: addDays(weekStart, 7).toISOString(),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
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
  }, [weekStart, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const submit = useCallback(
    (values: AppointmentFormValues) => {
      setPending(true);
      setFormError(null);

      // `datetime-local` YEREL bir dize verir; `new Date(...)` onu yerel
      // yorumlar ve `toISOString()` sunucunun beklediği ofsetli ana çevirir.
      const body = {
        scheduledAt: new Date(values.scheduledAt).toISOString(),
        durationMinutes: values.durationMinutes,
        status: values.status,
        serviceNote: values.serviceNote === '' ? null : values.serviceNote,
      };

      const request =
        editing === null ? createAppointment(body) : updateAppointment(editing.id, body);

      request
        .then(() => {
          setFormOpen(false);
          setEditing(null);
          reload();
        })
        .catch((caught: unknown) => {
          setFormError(errorMessage(caught));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [editing, reload],
  );

  const blocks = toBlocks(items);

  return (
    <>
      <ModuleHeader
        title="Randevular"
        subtitle={`${weekStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} haftası · ${String(items.length)} kayıt`}
        right={
          <div className="flex items-center gap-2">
            <AppointmentTabs />
            <PillButton
              onClick={() => {
                setWeekStart((current) => addDays(current, -7));
              }}
            >
              ‹
            </PillButton>
            <PillButton
              onClick={() => {
                setWeekStart(startOfWeek(new Date()));
              }}
            >
              Bu hafta
            </PillButton>
            <PillButton
              onClick={() => {
                setWeekStart((current) => addDays(current, 7));
              }}
            >
              ›
            </PillButton>
            <PrimaryButton
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setFormOpen(true);
              }}
            >
              Yeni randevu
            </PrimaryButton>
          </div>
        }
      />

      <ModuleBody>
        {error === null ? null : <FormError message={error} />}

        {formOpen ? (
          <Rise delay={RISE.body}>
            <AppointmentForm
              initial={editing}
              onSubmit={submit}
              onCancel={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              pending={pending}
              error={formError}
            />
          </Rise>
        ) : null}

        {loading ? (
          <EmptyState title="Yükleniyor…" hint="Haftanın randevuları getiriliyor." />
        ) : (
          <Rise delay={RISE.body}>
            <WeekGrid
              weekStart={weekStart}
              blocks={blocks}
              emptyLabel="Bu hafta randevu yok."
              onSelectBlock={(id) => {
                const row = items.find((item) => item.id === id);
                if (row !== undefined) {
                  setEditing(row);
                  setFormError(null);
                  setFormOpen(true);
                }
              }}
            />
          </Rise>
        )}
      </ModuleBody>
    </>
  );
}
