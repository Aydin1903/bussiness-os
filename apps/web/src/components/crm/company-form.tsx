'use client';

import {
  createCompanyRequestSchema,
  type Company,
  type CreateCompanyRequest,
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

/** Formun ham hâli — hepsi metin; `null`'a çevirme gönderim anında yapılır. */
interface FormState {
  name: string;
  industry: string;
  email: string;
  phone: string;
  website: string;
}

const EMPTY: FormState = { name: '', industry: '', email: '', phone: '', website: '' };

/** Düzenlemede alanlar mevcut değerlerle dolar; `null` alanlar boş metin olur. */
function fromCompany(company: Company): FormState {
  return {
    name: company.name,
    industry: company.industry ?? '',
    email: company.email ?? '',
    phone: company.phone ?? '',
    website: company.website ?? '',
  };
}

/**
 * Şirket oluşturma/düzenleme formu — satır içi panelde.
 *
 * ============================================================================
 * TEK BİLEŞEN, İKİ İŞ
 * ============================================================================
 * Oluşturma ve düzenleme AYNI alanları, AYNI doğrulamayı ve AYNI düzeni
 * kullanır; ikiye bölmek iki dosyanın zamanla ayrışması demekti (birine
 * eklenen alan diğerine eklenmez). Fark yalnızca başlangıç değeri ve düğme
 * metnidir.
 *
 * ⚠️ Gönderilen gövde her iki durumda da TAM'dır. Düzenlemede backend `PATCH`
 * beklediği için bu, dokunulmayan alanların da mevcut değerleriyle geri
 * yazılması anlamına gelir — ama değer AYNI olduğu için sonuç değişmez ve
 * "hangi alan değişti" muhasebesi tutulmaz. Alan bazlı diff, iki kullanıcının
 * aynı kaydı düzenlediği bir senaryoda anlamlı olurdu; o senaryonun karşılığı
 * (optimistic locking) backend'de YOK, dolayısıyla burada onu taklit etmek
 * yanlış bir güven verirdi.
 */
export function CompanyForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Verilirse DÜZENLEME, verilmezse OLUŞTURMA. */
  initial?: Company;
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateCompanyRequest) => void;
  onCancel: () => void;
}) {
  const editing = initial !== undefined;
  const [form, setForm] = useState<FormState>(() => (initial ? fromCompany(initial) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function change(field: keyof FormState) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    };
  }

  function submit(): void {
    const body = {
      name: form.name.trim(),
      industry: emptyToNull(form.industry),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      website: emptyToNull(form.website),
    };

    const parsed = createCompanyRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title={editing ? 'Müşteriyi düzenle' : 'Yeni müşteri'}>
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
            id="company-name"
            label="Müşteri adı"
            required
            value={form.name}
            onChange={change('name')}
            error={errors.name ?? null}
            placeholder="Örn. Kuzey Mimarlık"
            disabled={pending}
          />

          <FieldGrid>
            <TextField
              id="company-industry"
              label="Sektör"
              value={form.industry}
              onChange={change('industry')}
              error={errors.industry ?? null}
              disabled={pending}
            />
            <TextField
              id="company-website"
              label="Web sitesi"
              type="url"
              value={form.website}
              onChange={change('website')}
              error={errors.website ?? null}
              disabled={pending}
            />
            <TextField
              id="company-email"
              label="E-posta"
              type="email"
              value={form.email}
              onChange={change('email')}
              error={errors.email ?? null}
              disabled={pending}
            />
            <TextField
              id="company-phone"
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
            {pending ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Müşteriyi kaydet'}
          </PrimaryButton>
        </FormActions>
      </form>
    </InlinePanel>
  );
}
