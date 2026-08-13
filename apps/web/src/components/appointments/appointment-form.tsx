'use client';

import {
  APPOINTMENT_STATUS_LABELS,
  MAX_SERVICE_NOTE_CHARS,
  appointmentStatusSchema,
  type AppointmentRow,
  type AppointmentStatus,
} from '@business-os/contracts';
import { useState } from 'react';

import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { PrimaryButton } from '@/components/module-kit/chrome';
import { FormError } from '@/components/ui/form-error';

/**
 * Randevu formu — yeni kayıt ve düzenleme AYNI bileşen.
 *
 * ============================================================================
 * ⚠️ SINIR BURADA YENİDEN YAZILMAZ — `contracts`TAN OKUNUR
 * ============================================================================
 * `MAX_SERVICE_NOTE_CHARS` sunucuda `chunking.ts`in tek parça hedefinden
 * türer (ADR-0035 §3d) ve `@business-os/contracts` üzerinden buraya gelir.
 * Burada bir sayı yazılsaydı iki taraf SESSİZCE ayrışırdı: kullanıcı formda
 * "tamam" görür, sunucu 422 döner ve neden reddedildiğini ANLAYAMAZDI.
 *
 * Sunucu tarafında bir test iki sabitin aynı olduğunu kilitliyor.
 *
 * ============================================================================
 * ⚠️ KULLANICI 422'Yİ HİÇ GÖRMEMELİ
 * ============================================================================
 * Sınır aşıldığında form ZATEN engeller: sayaç uyarır, alan `aria-invalid`
 * olur ve kaydet düğmesi devre dışı kalır. Sunucunun 422'si bir GÜVENLİK AĞI
 * olarak kalır (HTTP'yi atlayan her yolu bağlar) ama normal akışta hiç
 * tetiklenmez.
 */

/** Sınıra bu ORANDA yaklaşınca uyarı başlar. */
const WARN_RATIO = 0.9;

/**
 * `datetime-local` girdisinin istediği biçim (`YYYY-MM-DDTHH:mm`) — YEREL.
 *
 * ⚠️ `toISOString()` KULLANILMAZ: o UTC'ye çevirir ve kullanıcı saatini
 * kendi diliminde değil sunucununkinde görürdü. Sunucu UTC saklar, çevrimi
 * istemci yapar (ADR-0035 §2c) ve bu fonksiyon o çevrimin bir yarısıdır.
 */
function toLocalInput(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${String(value.getFullYear())}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

const STATUS_OPTIONS = Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export interface AppointmentFormValues {
  readonly scheduledAt: string;
  readonly durationMinutes: number;
  readonly status: AppointmentStatus;
  readonly serviceNote: string;
}

export function AppointmentForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  /** `null` = yeni kayıt. */
  initial: AppointmentRow | null;
  onSubmit: (values: AppointmentFormValues) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [scheduledAt, setScheduledAt] = useState(() =>
    toLocalInput(initial === null ? defaultStart() : new Date(initial.scheduledAt)),
  );
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 30));
  const [status, setStatus] = useState<AppointmentStatus>(initial?.status ?? 'scheduled');
  const [serviceNote, setServiceNote] = useState(initial?.serviceNote ?? '');

  const used = serviceNote.trim().length;
  const overLimit = used > MAX_SERVICE_NOTE_CHARS;
  const nearLimit = !overLimit && used >= MAX_SERVICE_NOTE_CHARS * WARN_RATIO;

  const durationValue = Number(duration);
  const durationInvalid =
    !Number.isInteger(durationValue) || durationValue < 1 || durationValue > 1440;

  // ⚠️ Kaydet düğmesi SINIR AŞILDIĞINDA kapanır — kullanıcı 422 görmesin diye.
  const blocked = pending || overLimit || durationInvalid || scheduledAt === '';

  return (
    <InlinePanel title={initial === null ? 'Yeni randevu' : 'Randevuyu düzenle'}>
      <FieldGrid>
        <TextField
          id="appointment-scheduled-at"
          label="Tarih ve saat"
          type="datetime-local"
          value={scheduledAt}
          onChange={setScheduledAt}
          disabled={pending}
        />

        <TextField
          id="appointment-duration"
          label="Süre (dakika)"
          type="number"
          value={duration}
          onChange={setDuration}
          disabled={pending}
          error={durationInvalid && duration !== '' ? '1 ile 1440 arasında olmalı' : null}
        />

        <SelectField
          id="appointment-status"
          label="Durum"
          value={status}
          onChange={(next) => {
            // ⚠️ TİP ZORLAMASI (`as`) YOK — şema DARALTIR. `<select>` yalnızca
            // bizim yazdığımız seçenekleri döndürebilir ama bunu TİP
            // seviyesinde bilmenin yolu, değeri sözlükten GEÇİRMEKTİR.
            const parsed = appointmentStatusSchema.safeParse(next);
            if (parsed.success) {
              setStatus(parsed.data);
            }
          }}
          options={STATUS_OPTIONS}
          disabled={pending}
        />
      </FieldGrid>

      <TextAreaField
        id="appointment-service-note"
        label="Servis notu"
        value={serviceNote}
        onChange={setServiceNote}
        rows={4}
        disabled={pending}
        placeholder="Ne konuşuldu, ne yapıldı?"
        error={
          overLimit
            ? `Not çok uzun: ${String(used)} / ${String(MAX_SERVICE_NOTE_CHARS)} karakter. Kısaltın.`
            : null
        }
        hint="Bu not aramada kullanılır; kısa ve somut yazın."
      />

      {/*
        ⚠️ CANLI SAYAÇ — sınıra yaklaşınca RENK DEĞİŞTİRİR.
        Renk TEK bilgi taşıyıcısı değildir: sayının kendisi de görünür ve
        aşıldığında alanın altında AÇIK bir hata metni belirir.
      */}
      <p
        aria-live="polite"
        className={[
          'text-right font-mono text-[11px] tabular-nums',
          overLimit ? 'font-semibold text-danger' : nearLimit ? 'text-warning' : 'text-fg-3',
        ].join(' ')}
      >
        {used} / {MAX_SERVICE_NOTE_CHARS}
        {nearLimit ? ' · sınıra yaklaşıyorsunuz' : ''}
      </p>

      {error === null ? null : <FormError message={error} />}

      <FormActions>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
        <PrimaryButton
          onClick={() => {
            onSubmit({
              scheduledAt,
              durationMinutes: durationValue,
              status,
              serviceNote: serviceNote.trim(),
            });
          }}
          disabled={blocked}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}

/** Yeni randevu varsayılanı: bir sonraki tam saat. */
function defaultStart(): Date {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}
