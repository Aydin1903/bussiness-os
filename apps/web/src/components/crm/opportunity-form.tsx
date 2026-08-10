'use client';

import {
  createOpportunityRequestSchema,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_ORDER,
  type Contact,
  type CreateOpportunityRequest,
  type Opportunity,
} from '@business-os/contracts';
import { useState } from 'react';

import { FormError } from '@/components/ui/form-error';
import { PrimaryButton } from '@/components/module-kit/chrome';
import {
  emptyToNull,
  fieldErrors,
  NO_FIELD_ERRORS,
  type FieldErrors,
} from '@/components/module-kit/field-errors';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';

const NO_CONTACT = '';

interface FormState {
  title: string;
  stage: string;
  estimatedValue: string;
  currency: string;
  nextFollowUpOn: string;
  contactId: string;
}

const EMPTY: FormState = {
  title: '',
  stage: 'potential',
  estimatedValue: '',
  currency: '',
  nextFollowUpOn: '',
  contactId: NO_CONTACT,
};

function fromOpportunity(opportunity: Opportunity): FormState {
  return {
    title: opportunity.title,
    stage: opportunity.stage,
    estimatedValue: opportunity.estimatedValue ?? '',
    currency: opportunity.currency ?? '',
    nextFollowUpOn: opportunity.nextFollowUpOn ?? '',
    contactId: opportunity.contactId ?? NO_CONTACT,
  };
}

/**
 * Fırsat oluşturma/düzenleme formu.
 *
 * ============================================================================
 * AŞAMA SIRASI DAYATILMAZ
 * ============================================================================
 * Seçim kutusu beş aşamayı da her zaman açık tutar; `lost` → `in_discussion`
 * geçerli bir istektir ve backend 200 döner. Engellemek kullanıcıyı aşamayı
 * hiç güncellememeye iter, veri bayatlar ve AI bayat veriyle cevap verir
 * (gerekçe `Opportunity` entity yorumunda).
 *
 * ============================================================================
 * TUTAR VARSA PARA BİRİMİ ZORUNLU — sunucunun kuralı, burada ERKEN söylenir
 * ============================================================================
 * Bu bir DOMAIN kuralıdır (`assertCurrency`) ve son sözü sunucu söyler: uç,
 * ihlalde 422 döner. Burada tekrarlanmasının tek sebebi, kullanıcının hatayı
 * ağ turundan önce görmesi. Şema tarafına (`contracts`) KONMADI: orası
 * backend'in DTO'sunu yansıtır ve DTO'da bu kural yoktur — koysaydık sözleşme
 * artık bir ayna olmaktan çıkardı.
 */
export function OpportunityForm({
  companyId,
  contacts,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  contacts: readonly Contact[];
  /** Verilirse DÜZENLEME, verilmezse OLUŞTURMA. */
  initial?: Opportunity;
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateOpportunityRequest) => void;
  onCancel: () => void;
}) {
  const editing = initial !== undefined;
  const [form, setForm] = useState<FormState>(() => (initial ? fromOpportunity(initial) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function change(field: keyof FormState) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    };
  }

  function submit(): void {
    const estimatedValue = emptyToNull(form.estimatedValue);
    const currency = emptyToNull(form.currency);

    if (estimatedValue !== null && currency === null) {
      setErrors({ currency: 'Tutar girdiyseniz para birimi de gerekli' });
      return;
    }

    const body = {
      companyId,
      contactId: form.contactId === NO_CONTACT ? null : form.contactId,
      title: form.title.trim(),
      stage: form.stage,
      estimatedValue,
      currency,
      nextFollowUpOn: emptyToNull(form.nextFollowUpOn),
    };

    const parsed = createOpportunityRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title={editing ? 'Fırsatı düzenle' : 'Yeni fırsat'}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4">
          <FormError message={error} />

          <TextField
            id="opportunity-title"
            label="Fırsat başlığı"
            required
            value={form.title}
            onChange={change('title')}
            error={errors.title ?? null}
            placeholder="Örn. Yıllık bakım sözleşmesi"
            disabled={pending}
          />

          <FieldGrid>
            <SelectField
              id="opportunity-stage"
              label="Aşama"
              value={form.stage}
              onChange={change('stage')}
              disabled={pending}
              options={OPPORTUNITY_STAGE_ORDER.map((stage) => ({
                value: stage,
                label: OPPORTUNITY_STAGE_LABELS[stage],
              }))}
            />
            <TextField
              id="opportunity-follow-up"
              label="Sonraki takip"
              type="date"
              value={form.nextFollowUpOn}
              onChange={change('nextFollowUpOn')}
              error={errors.nextFollowUpOn ?? null}
              disabled={pending}
              hint="Boş bırakılırsa takipler listesine girmez."
            />
            <TextField
              id="opportunity-value"
              label="Tahmini değer"
              value={form.estimatedValue}
              onChange={change('estimatedValue')}
              error={errors.estimatedValue ?? null}
              placeholder="250000.00"
              disabled={pending}
            />
            <TextField
              id="opportunity-currency"
              label="Para birimi"
              value={form.currency}
              onChange={change('currency')}
              error={errors.currency ?? null}
              placeholder="TRY"
              disabled={pending}
            />
          </FieldGrid>

          {contacts.length === 0 ? null : (
            <SelectField
              id="opportunity-contact"
              label="İlgili yetkili"
              value={form.contactId}
              onChange={change('contactId')}
              disabled={pending}
              options={[
                { value: NO_CONTACT, label: 'Belirtilmedi' },
                ...contacts.map((contact) => ({ value: contact.id, label: contact.fullName })),
              ]}
            />
          )}
        </div>

        <FormActions>
          <GhostButton onClick={onCancel} disabled={pending}>
            Vazgeç
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Fırsatı oluştur'}
          </PrimaryButton>
        </FormActions>
      </form>
    </InlinePanel>
  );
}
