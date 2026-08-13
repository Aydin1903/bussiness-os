'use client';

import type { AppointmentRow } from '@business-os/contracts';
import { APPOINTMENT_STATUS_LABELS, appointmentStatusSchema } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { deleteAppointment, listAppointments } from '@/lib/api/appointments';
import { errorMessage } from '@/lib/api/error-message';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import { EmptyState, ModuleBody, ModuleHeader, Pager, RISE } from '@/components/module-kit/chrome';
import {
  CardAction,
  CardActions,
  CardHeader,
  CardMeta,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { SelectField, TextField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { AppointmentTabs, StatusPill } from './chrome';

export const PAGE_SIZE = 20;

/** `YYYY-MM-DD` → günün ilk anı (yerel) ISO; boşsa `undefined`. */
function dayStart(value: string): string | undefined {
  if (value === '') {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** `YYYY-MM-DD` → ERTESİ günün ilk anı: `to` HARİÇ sınır olduğu için. */
function dayAfter(value: string): string | undefined {
  if (value === '') {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  parsed.setDate(parsed.getDate() + 1);
  return parsed.toISOString();
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tüm durumlar' },
  ...Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

/**
 * Liste görünümü — filtreler (tarih aralığı · durum · kişi).
 *
 * ⚠️ KİŞİ FİLTRESİ İSTEMCİ TARAFINDA. Sunucu `GET /appointments`te bir kişi
 * parametresi TAŞIMAZ (ADR-0035 §9'un uç listesi) ve bu slice bir API
 * değişikliği DEĞİLDİR. Sayfadaki satırlar üzerinde ad araması yapılıyor;
 * bedeli açıkça: filtre YALNIZCA GÖRÜNEN SAYFAYA uygulanır, tüm veriye değil.
 *
 * Doğru çözüm sunucuya `contactId` filtresi eklemektir ve o gün bu blok
 * silinir — bugün eklemek, ADR'nin uç listesini bir arayüz ihtiyacı yüzünden
 * sessizce genişletmek olurdu.
 */
export function AppointmentsListScreen() {
  const [items, setItems] = useState<readonly AppointmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [contactQuery, setContactQuery] = useState('');

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir ve ikincisi sorguya `?from=undefined` yazma
    // riskini taşır (`query()` onu düşürüyor ama tip yine de yalan söylerdi).
    const fromIso = dayStart(from);
    // ⚠️ ERTESİ GÜNÜN başı: `to` HARİÇ bir sınırdır, yani kullanıcının seçtiği
    // günün TAMAMI kapsansın diye bir gün ileri alınır. Doğrudan `to`
    // verilseydi o günün randevuları listeden DÜŞERDİ — sessiz ve fark
    // edilmesi zor.
    const toIso = dayAfter(to);
    const parsedStatus = appointmentStatusSchema.safeParse(status);
    const statusFilter = parsedStatus.success ? parsedStatus.data : undefined;

    listAppointments({
      limit: PAGE_SIZE,
      offset,
      ...(fromIso === undefined ? {} : { from: fromIso }),
      ...(toIso === undefined ? {} : { to: toIso }),
      // ⚠️ TİP ZORLAMASI YOK: boş dize "filtre yok" demektir ve sözlükte
      // karşılığı olmayan bir değer sorguya HİÇ girmez.
      ...(statusFilter === undefined ? {} : { status: statusFilter }),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setTotal(page.total);
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
  }, [offset, from, to, status, reloadToken]);

  const remove = useCallback((id: string) => {
    deleteAppointment(id)
      .then(() => {
        setDeleting(null);
        setReloadToken((token) => token + 1);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
        setDeleting(null);
      });
  }, []);

  const visible =
    contactQuery.trim() === ''
      ? items
      : items.filter((row) =>
          (row.contactName ?? '')
            .toLocaleLowerCase('tr')
            .includes(contactQuery.trim().toLocaleLowerCase('tr')),
        );

  return (
    <>
      <ModuleHeader
        title="Randevular"
        subtitle={`${String(total)} kayıt`}
        right={<AppointmentTabs />}
      />

      <ModuleBody>
        {error === null ? null : <FormError message={error} />}

        <Rise delay={RISE.body}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              id="filter-from"
              label="Başlangıç"
              type="date"
              value={from}
              onChange={(next) => {
                setOffset(0);
                setFrom(next);
              }}
            />
            <TextField
              id="filter-to"
              label="Bitiş"
              type="date"
              value={to}
              onChange={(next) => {
                setOffset(0);
                setTo(next);
              }}
            />
            <SelectField
              id="filter-status"
              label="Durum"
              value={status}
              onChange={(next) => {
                setOffset(0);
                setStatus(next);
              }}
              options={STATUS_OPTIONS}
            />
            <TextField
              id="filter-contact"
              label="Kişi"
              value={contactQuery}
              onChange={setContactQuery}
              placeholder="Ad ara"
              hint="Yalnızca bu sayfada arar."
            />
          </div>
        </Rise>

        {loading ? (
          <EmptyState title="Yükleniyor…" hint="Randevular getiriliyor." />
        ) : visible.length === 0 ? (
          <EmptyState title="Kayıt yok" hint="Seçtiğiniz aralıkta randevu bulunamadı." />
        ) : (
          <Rise delay={RISE.body}>
            <div className="flex flex-col gap-2">
              {visible.map((row) => {
                const startsAt = new Date(row.scheduledAt);

                return (
                  <RecordCard key={row.id}>
                    <CardHeader>
                      <CardTitle>
                        {/* ⚠️ Kişi adı yoksa HİÇBİR ŞEY yazılmaz — "silinmiş"
                            bile: null'ın üç sebebi ayırt edilmez. */}
                        {row.contactName ?? 'Randevu'}
                      </CardTitle>
                      <StatusPill status={row.status} />
                    </CardHeader>

                    <CardMeta
                      items={[
                        startsAt.toLocaleString('tr-TR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                        `${String(row.durationMinutes)} dk`,
                        row.serviceNote,
                      ]}
                    />

                    <CardActions>
                      <CardAction
                        onClick={() => {
                          setDeleting(row.id);
                        }}
                        danger
                      >
                        Sil
                      </CardAction>
                    </CardActions>

                    {deleting === row.id ? (
                      <ConfirmDelete
                        question="Bu randevu silinsin mi? Bu işlem geri alınamaz."
                        ariaLabel="Randevuyu sil"
                        onConfirm={() => {
                          remove(row.id);
                        }}
                      />
                    ) : null}
                  </RecordCard>
                );
              })}
            </div>
          </Rise>
        )}

        <Pager
          offset={offset}
          count={visible.length}
          total={total}
          loading={loading}
          onPrevious={() => {
            setOffset((current) => Math.max(0, current - PAGE_SIZE));
          }}
          onNext={() => {
            setOffset((current) => current + PAGE_SIZE);
          }}
        />
      </ModuleBody>
    </>
  );
}
