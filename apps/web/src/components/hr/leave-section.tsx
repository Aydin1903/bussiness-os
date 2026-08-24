'use client';

import type { EmployeeLeaveResponse, LeaveType } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, PrimaryButton, SectionLabel } from '@/components/module-kit/chrome';
import { FieldGrid, FormActions, SelectField, TextField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import { createLeave, decideLeave, getEmployeeLeave } from '@/lib/api/hr';
import { formatDay, LEAVE_TYPE_LABELS, toLeaveType } from './chrome';

/**
 * İZİN BÖLÜMÜ — talep, onay, bakiye (ADR-0044 §2).
 *
 * ============================================================================
 * ⚠️ BU FORMDA "SEBEP" ALANI YOKTUR — VE BU, SÜS DEĞİL
 * ============================================================================
 * Bir izin kaydının en doğal alanı "sebep"tir ve oraya İLK YAZILACAK ŞEY
 * "RAPORLU"DUR. ADR-0043 §3 sağlık verisini KVKK m.6 özel nitelikli veri
 * rejimi gereği KESİN OLARAK dışarıda tutmuştu; serbest not alanı da tam bu
 * yüzden hiç açılmamıştı.
 *
 * Bir "sebep" alanı o sınırın ARKA KAPISIDIR: sınır yerinde görünür, kullanıcı
 * onu ihlal eder ve hata SESSİZDİR.
 *
 * ⚠️ Aynı sebeple tür listesinde "hastalık/raporlu" YOKTUR. Sunucu da
 * reddeder (`.strict()` + CHECK kısıtı) — yani bu, yalnızca bir arayüz tercihi
 * değil, üç katmanda birden korunan bir sınırdır.
 *
 * ⚠️ SINIR EKRANDA DA YAZILIR (aşağıdaki not): kullanıcı "raporlu nereye
 * yazılır" diye aramasın, cevabı görsün.
 */
export function LeaveSection({
  employeeId,
  canRequest,
  canDecide,
}: {
  readonly employeeId: string;
  readonly canRequest: boolean;
  readonly canDecide: boolean;
}) {
  const [data, setData] = useState<EmployeeLeaveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<LeaveType>('annual');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getEmployeeLeave(employeeId)
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [employeeId]);

  useEffect(load, [load]);

  function submit(): void {
    setSaving(true);
    setFormError(null);

    createLeave(employeeId, { type, startsOn, endsOn })
      .then(() => {
        setStartsOn('');
        setEndsOn('');
        setFormOpen(false);
        load();
      })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function decide(leaveId: string, status: 'approved' | 'rejected'): void {
    decideLeave(leaveId, { status })
      .then(load)
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>İzinler</SectionLabel>
        {canRequest ? (
          <PrimaryButton
            onClick={() => {
              setFormOpen((open) => !open);
            }}
          >
            {formOpen ? 'Vazgeç' : 'İzin talebi'}
          </PrimaryButton>
        ) : null}
      </div>

      {data === null ? null : (
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Balance label="Hak ediş" value={`${String(data.entitlementDays)} gün`} />
          <Balance label="Kullanılan" value={`${String(data.usedDays)} gün`} />
          {/*
            ⚠️ NEGATİF KALAN GİZLENMEZ ve bir hata gibi gösterilmez: hak
            edişinden fazla izin kullanmış bir çalışan GERÇEK bir durumdur
            (ADR-0044 §2.3). Gizlemek, İK'nın görmesi gereken şeyi saklamaktı.
          */}
          <Balance
            label="Kalan"
            value={`${String(data.remainingDays)} gün`}
            tone={data.remainingDays < 0 ? 'accent' : 'plain'}
          />
        </div>
      )}

      {/*
        ⚠️ SINIR EKRANDA YAZILI: kullanıcı "raporlu nereye yazılır" diye
        aramasın, cevabı burada görsün. Sessiz bir eksik, kullanıcıyı sınırı
        başka bir alana yazarak ihlal etmeye iterdi.
      */}
      <p className="mt-2 max-w-[62ch] text-[12px] leading-[1.6] text-fg-3">
        Hak ediş <strong className="font-semibold text-fg-2">elle girilir</strong>; sistem kıdemden
        hesaplamaz — izin hakkı ülkeye özel mevzuattır. Gün sayısı{' '}
        <strong className="font-semibold text-fg-2">takvim günüdür</strong>, iş günü değil.{' '}
        <strong className="font-semibold text-fg-2">
          Raporlu/hastalık izni bu modülde tutulmaz
        </strong>{' '}
        — sağlık verisi KVKK’nın özel nitelikli kategorisindedir ve ayrı bir güvenlik rejimi
        gerektirir.
      </p>

      {formOpen ? (
        <div className="mt-4 rounded-card border border-border bg-surface px-5 py-4 shadow-card">
          <FieldGrid>
            {/*
              ⚠️ Listede "hastalık/raporlu" YOK — ADR-0043 §3'ün sınırının
              taşıyıcısı. Sunucu da reddeder.
            */}
            <SelectField
              id="hr-leave-type"
              label="İzin türü"
              value={type}
              onChange={(next) => {
                setType(toLeaveType(next));
              }}
              options={Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              disabled={saving}
            />
            <TextField
              id="hr-leave-start"
              label="Başlangıç"
              value={startsOn}
              onChange={setStartsOn}
              type="date"
              required
              disabled={saving}
            />
            <TextField
              id="hr-leave-end"
              label="Bitiş"
              value={endsOn}
              onChange={setEndsOn}
              type="date"
              required
              disabled={saving}
              hint="bitiş dahil sayılır"
            />
          </FieldGrid>

          <FormError message={formError} />

          <FormActions>
            <PrimaryButton disabled={saving || startsOn === '' || endsOn === ''} onClick={submit}>
              {saving ? 'Gönderiliyor…' : 'Talep gönder'}
            </PrimaryButton>
          </FormActions>
        </div>
      ) : null}

      <FormError message={error} />

      {loading ? (
        <p className="mt-4 text-[12.5px] text-fg-3">Yükleniyor…</p>
      ) : data === null || data.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="İzin kaydı yok"
            hint="Bu çalışan için henüz izin talebi girilmemiş. Onaylanan yıllık izinler hak edişten düşer; ücretsiz ve mazeret izni düşmez."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {data.items.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-border bg-surface px-4 py-2.5"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[13px] font-semibold text-fg">
                  {LEAVE_TYPE_LABELS[leave.type]}
                </span>
                <span className="text-[11.5px] text-fg-3">
                  {formatDay(leave.startsOn)} – {formatDay(leave.endsOn)} · {leave.days} gün
                </span>
              </div>

              <div className="flex items-center gap-2">
                <LeaveStatusBadge status={leave.status} />
                {/*
                  ⚠️ Karar düğmeleri YALNIZCA `pending` iken görünür: karara
                  bağlanmış bir izin YENİDEN karara bağlanamaz (sunucu 409
                  döner). Düğmeyi göstermek, çalışmayacak bir eylem sunmaktı.
                */}
                {canDecide && leave.status === 'pending' ? (
                  <>
                    <MiniButton
                      onClick={() => {
                        decide(leave.id, 'approved');
                      }}
                    >
                      Onayla
                    </MiniButton>
                    <MiniButton
                      onClick={() => {
                        decide(leave.id, 'rejected');
                      }}
                    >
                      Reddet
                    </MiniButton>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Balance({
  label,
  value,
  tone = 'plain',
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'plain' | 'accent';
}) {
  return (
    <div className="min-w-[110px] rounded-card border border-border bg-surface px-4 py-2.5">
      <p className="font-mono text-[9px] font-semibold tracking-[0.19em] text-fg-3 uppercase">
        {label}
      </p>
      <p
        className={[
          'tabular mt-1 text-[16px] font-bold tracking-[-0.02em]',
          tone === 'accent' ? 'text-ink' : 'text-fg',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}

function LeaveStatusBadge({ status }: { readonly status: string }) {
  const label =
    status === 'approved' ? 'Onaylandı' : status === 'rejected' ? 'Reddedildi' : 'Bekliyor';

  return (
    <span
      className={[
        'font-mono text-[9.5px] font-medium tracking-[0.09em] uppercase',
        status === 'pending' ? 'text-ink' : 'text-fg-3',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function MiniButton({
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
