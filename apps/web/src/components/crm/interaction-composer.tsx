'use client';

import {
  createInteractionRequestSchema,
  type Contact,
  type CreateInteractionRequest,
} from '@business-os/contracts';
import { useState } from 'react';

import { FormError } from '@/components/ui/form-error';
import { todayCalendarDay } from '@/lib/format/datetime';
import { PrimaryButton } from './chrome';
import { fieldErrors, NO_FIELD_ERRORS, type FieldErrors } from './field-errors';
import { FieldGrid, FormActions, SelectField, TextAreaField, TextField } from './form-kit';

/** Kişi seçilmedi. Boş dizge, `null`'a çevrilecek olan sentinel'dir. */
const NO_CONTACT = '';

/**
 * Görüşme kaydetme alanı.
 *
 * ============================================================================
 * HER ZAMAN AÇIK — bir düğmenin ardında DEĞİL
 * ============================================================================
 * Panel'in `Composer`'ı ile aynı gerekçe: bu ekranın var oluş sebebi görüşme
 * kaydetmektir ve onu "Yeni görüşme" düğmesinin ardına saklamak, asıl işi bir
 * tık uzağa iterdi. Şirket ve kişi formları aksine satır içi panelde açılır —
 * onlar seyrek işlerdir.
 *
 * ============================================================================
 * GÖRÜŞME DÜZELTİLMEZ
 * ============================================================================
 * Backend'de `PATCH`/`DELETE` YOKTUR ve bu bir eksiklik değil karardır
 * (ADR-0031): görüşme bir GÜNLÜK KAYDIDIR, yanlışsa yenisi yazılır. Bu yüzden
 * burada da "düzenle" diye bir yüzey yoktur — olmayan bir fiili arayüzde vaat
 * etmek, 405 ile biten bir tıklama üretirdi.
 *
 * ============================================================================
 * `occurredOn` VARSAYILANI BUGÜN, AMA DEĞİŞTİRİLEBİLİR
 * ============================================================================
 * Görüşmenin OLDUĞU gün ile kaydedildiği an farklı şeylerdir; dün yapılan bir
 * görüşme bugün yazılır. Varsayılan yerel takvim gününden gelir
 * (`todayCalendarDay`) — `toISOString()` UTC gününü verirdi ve UTC+3'te gece
 * yarısından sonra girilen görüşme bir gün geride kaydedilirdi.
 */
export function InteractionComposer({
  companyId,
  contacts,
  pending,
  error,
  onSubmit,
}: {
  companyId: string;
  /** Bu şirketin kişileri — görüşme isteğe bağlı olarak birine bağlanır. */
  contacts: readonly Contact[];
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateInteractionRequest) => void;
}) {
  const [body, setBody] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => todayCalendarDay());
  const [contactId, setContactId] = useState<string>(NO_CONTACT);
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function submit(): void {
    const candidate = {
      companyId,
      contactId: contactId === NO_CONTACT ? null : contactId,
      opportunityId: null,
      occurredOn,
      body: body.trim(),
    };

    const parsed = createInteractionRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
    // Alan TEMİZLENİR ama tarih ve kişi KORUNUR: aynı görüşmeden birkaç not
    // arka arkaya girilir ve her seferinde tarihi yeniden seçtirmek gereksiz
    // sürtünmedir.
    setBody('');
  }

  return (
    <form
      noValidate
      className="rounded-card border border-border bg-raised p-5 shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />

        <TextAreaField
          id="interaction-body"
          label="Görüşme notu"
          value={body}
          onChange={setBody}
          error={errors.body ?? null}
          disabled={pending}
          placeholder="Ne konuşuldu, ne karara bağlandı?"
          hint="Kaydettiğiniz görüşmeyi yapay zekâ okur ve sorularınızı cevaplarken kullanır."
        />

        <FieldGrid>
          <TextField
            id="interaction-date"
            label="Görüşme tarihi"
            type="date"
            value={occurredOn}
            onChange={setOccurredOn}
            error={errors.occurredOn ?? null}
            disabled={pending}
          />

          {contacts.length === 0 ? null : (
            <SelectField
              id="interaction-contact"
              label="Yetkili"
              value={contactId}
              onChange={setContactId}
              disabled={pending}
              options={[
                { value: NO_CONTACT, label: 'Belirtilmedi' },
                ...contacts.map((contact) => ({ value: contact.id, label: contact.fullName })),
              ]}
            />
          )}
        </FieldGrid>
      </div>

      <FormActions>
        <PrimaryButton type="submit" disabled={pending || body.trim() === ''}>
          {pending ? 'Kaydediliyor…' : 'Görüşmeyi kaydet'}
        </PrimaryButton>
      </FormActions>
    </form>
  );
}
