'use client';

import {
  createContactRequestSchema,
  type Contact,
  type CreateContactRequest,
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
  TextField,
} from '@/components/module-kit/form-kit';

interface FormState {
  fullName: string;
  title: string;
  email: string;
  phone: string;
}

const EMPTY: FormState = { fullName: '', title: '', email: '', phone: '' };

function fromContact(contact: Contact): FormState {
  return {
    fullName: contact.fullName,
    title: contact.title ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
  };
}

/**
 * Kişi oluşturma/düzenleme formu.
 *
 * ============================================================================
 * `companyId` FORMDA YOK — ve bu bilinçli
 * ============================================================================
 * Kişi her zaman bir şirketin detay sayfasından eklenir, dolayısıyla şirket
 * ZATEN bellidir; bir seçim kutusu koymak, kullanıcıya bildiği bir şeyi tekrar
 * sordurmak olurdu.
 *
 * Düzenlemede ise gövdeye HİÇ girmez: backend `updateContactSchema`'sı
 * `companyId`'yi kabul etmez. Kişiyi başka şirkete taşımak bir TAŞIMA
 * işlemidir ve bu ekranın işi değildir.
 */
export function ContactForm({
  companyId,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  companyId: string;
  /** Verilirse DÜZENLEME, verilmezse OLUŞTURMA. */
  initial?: Contact;
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateContactRequest) => void;
  onCancel: () => void;
}) {
  const editing = initial !== undefined;
  const [form, setForm] = useState<FormState>(() => (initial ? fromContact(initial) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function change(field: keyof FormState) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    };
  }

  function submit(): void {
    const body = {
      companyId,
      fullName: form.fullName.trim(),
      title: emptyToNull(form.title),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
    };

    const parsed = createContactRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title={editing ? 'Yetkiliyi düzenle' : 'Yeni yetkili'}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4">
          <FormError message={error} />

          <FieldGrid>
            <TextField
              id="contact-full-name"
              label="Ad soyad"
              required
              value={form.fullName}
              onChange={change('fullName')}
              error={errors.fullName ?? null}
              disabled={pending}
            />
            <TextField
              id="contact-title"
              label="Ünvan"
              value={form.title}
              onChange={change('title')}
              error={errors.title ?? null}
              disabled={pending}
            />
            <TextField
              id="contact-email"
              label="E-posta"
              type="email"
              value={form.email}
              onChange={change('email')}
              error={errors.email ?? null}
              disabled={pending}
            />
            <TextField
              id="contact-phone"
              label="Telefon"
              type="tel"
              value={form.phone}
              onChange={change('phone')}
              error={errors.phone ?? null}
              disabled={pending}
            />
          </FieldGrid>
        </div>

        <FormActions>
          <GhostButton onClick={onCancel} disabled={pending}>
            Vazgeç
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Yetkiliyi ekle'}
          </PrimaryButton>
        </FormActions>
      </form>
    </InlinePanel>
  );
}
