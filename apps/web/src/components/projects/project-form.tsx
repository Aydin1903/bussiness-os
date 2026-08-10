'use client';

import {
  createProjectRequestSchema,
  PROJECT_STATUS_LABELS,
  projectStatusSchema,
  type CreateProjectRequest,
  type ProjectListRow,
} from '@business-os/contracts';
import { useState } from 'react';

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
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { PrimaryButton } from '@/components/module-kit/chrome';
import { FormError } from '@/components/ui/form-error';

/** Formun ham hâli — hepsi metin; `null`'a çevirme gönderim anında yapılır. */
interface FormState {
  name: string;
  status: string;
  description: string;
  startedOn: string;
  dueOn: string;
}

const EMPTY: FormState = {
  name: '',
  status: 'planning',
  description: '',
  startedOn: '',
  dueOn: '',
};

function fromProject(project: ProjectListRow): FormState {
  return {
    name: project.name,
    status: project.status,
    description: project.description ?? '',
    startedOn: project.startedOn ?? '',
    dueOn: project.dueOn ?? '',
  };
}

const STATUS_OPTIONS = projectStatusSchema.options.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}));

/**
 * Proje oluşturma/düzenleme formu — `CompanyForm` ile birebir aynı desen.
 *
 * TEK BİLEŞEN, İKİ İŞ: oluşturma ve düzenleme aynı alanları, aynı doğrulamayı
 * ve aynı düzeni kullanır; ikiye bölmek iki dosyanın zamanla ayrışması demekti.
 *
 * ============================================================================
 * ⚠️ `companyId` BU FORMDA YOK
 * ============================================================================
 * Alan API'de VAR (Slice 4) ve çalışıyor, ama bir müşteri SEÇİCİ ister: şirket
 * listesini çekip aranabilir bir açılır liste çizmek. Bu, kendi başına bir
 * bileşen ve bu slice'ın kapsamı değil. Uydurma bir "UUID yapıştır" alanı
 * koymak, kullanılamayacak bir arayüz üretmek olurdu.
 *
 * Bağlı bir projenin müşteri adı listede ve detayda GÖRÜNÜR; yalnızca
 * ARAYÜZDEN BAĞLAMA henüz yok. Bilinen sınır olarak kayda geçti.
 */
export function ProjectForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Verilirse DÜZENLEME, verilmezse OLUŞTURMA. */
  initial?: ProjectListRow;
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateProjectRequest) => void;
  onCancel: () => void;
}) {
  const editing = initial !== undefined;
  const [form, setForm] = useState<FormState>(() => (initial ? fromProject(initial) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function change(field: keyof FormState) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    };
  }

  function submit(): void {
    const body = {
      name: form.name.trim(),
      status: form.status,
      description: emptyToNull(form.description),
      startedOn: emptyToNull(form.startedOn),
      dueOn: emptyToNull(form.dueOn),
    };

    const parsed = createProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title={editing ? 'Projeyi düzenle' : 'Yeni proje'}>
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
            id="project-name"
            label="Proje adı"
            required
            value={form.name}
            onChange={change('name')}
            error={errors.name ?? null}
            placeholder="Örn. Web sitesi yenileme"
            disabled={pending}
          />

          <FieldGrid>
            <SelectField
              id="project-status"
              label="Durum"
              value={form.status}
              onChange={change('status')}
              options={STATUS_OPTIONS}
              disabled={pending}
            />
            <div />
            <TextField
              id="project-started-on"
              label="Başlangıç"
              type="date"
              value={form.startedOn}
              onChange={change('startedOn')}
              error={errors.startedOn ?? null}
              disabled={pending}
            />
            <TextField
              id="project-due-on"
              label="Bitiş"
              type="date"
              value={form.dueOn}
              onChange={change('dueOn')}
              error={errors.dueOn ?? null}
              // Backend de aynı kısıtı taşır (`projects_due_after_started`);
              // buradaki ipucu onu ÖNCEDEN söyler, sürpriz 422 yerine.
              hint="Bitiş, başlangıçtan önce olamaz."
              disabled={pending}
            />
          </FieldGrid>

          <TextAreaField
            id="project-description"
            label="Açıklama"
            rows={3}
            value={form.description}
            onChange={change('description')}
            error={errors.description ?? null}
            disabled={pending}
          />
        </div>

        <FormActions>
          <GhostButton onClick={onCancel} disabled={pending}>
            Vazgeç
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Projeyi kaydet'}
          </PrimaryButton>
        </FormActions>
      </form>
    </InlinePanel>
  );
}
