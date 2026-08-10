'use client';

import {
  createTaskRequestSchema,
  TASK_STATUS_LABELS,
  taskStatusSchema,
  type CreateTaskRequest,
  type Task,
} from '@business-os/contracts';
import { useState } from 'react';

import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  EmptyState,
  PillButton,
  PrimaryButton,
  SectionLabel,
} from '@/components/module-kit/chrome';
import {
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
import {
  CardAction,
  CardActions,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { DueMark, TaskStatusPill } from './marks';

const STATUS_OPTIONS = taskStatusSchema.options.map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

/**
 * Proje detayındaki görev bölümü.
 *
 * `ContactSection` / `OpportunitySection` ile aynı şekil: bölüm etiketi +
 * ekleme düğmesi + satır içi form + kart listesi.
 *
 * ============================================================================
 * ⚠️ ATAMA ALANI BU SLICE'TA YOK
 * ============================================================================
 * `assigneeUserId` API'de var ve doğrulanıyor (ADR-0033 §4), ama bir ÜYE
 * SEÇİCİ ister — tenant'ın üyelerini listeleyen bir uç ve aranabilir bir açılır
 * liste. O uç bugün YOK (`GET /me/memberships` yalnızca KENDİ üyeliklerini
 * döner, ekibin tamamını değil) ve uydurma bir "UUID yapıştır" alanı
 * kullanılamaz bir arayüz olurdu.
 *
 * Sonuç: bu ekrandan açılan her görev ATANMAMIŞ olur. Yapısal katkıcının
 * "ATANMAMIS" sinyali (Slice 4) bu yüzden bugün her gecikmiş görevde görünür —
 * doğru ama eksik bir tablo. Bilinen sınır olarak kayda geçti.
 */
export function TaskSection({
  tasks,
  readOnly,
  busy,
  onCreate,
  onToggle,
  onDelete,
}: {
  tasks: readonly Task[];
  readOnly: boolean;
  busy: boolean;
  onCreate: (body: CreateTaskRequest) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SectionLabel>Görevler</SectionLabel>
        {readOnly || open ? null : (
          <PillButton
            onClick={() => {
              setOpen(true);
            }}
          >
            Görev ekle
          </PillButton>
        )}
      </div>

      {open ? (
        <TaskForm
          pending={busy}
          onSubmit={(body) => {
            onCreate(body);
            setOpen(false);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          title="Görev yok"
          hint={
            readOnly
              ? 'Ekibinizden biri görev eklediğinde burada görünecek.'
              : 'Bu projede yapılacak işleri buraya ekleyin. Son tarihi geçen görevler yapay zekânın uyarılarına girer.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                readOnly={readOnly}
                busy={busy}
                onToggle={() => {
                  onToggle(task);
                }}
                onDelete={() => {
                  onDelete(task);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskCard({
  task,
  readOnly,
  busy,
  onToggle,
  onDelete,
}: {
  task: Task;
  readOnly: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status === 'done';

  return (
    <RecordCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitle>{task.title}</CardTitle>
          <TaskStatusPill status={task.status} />
        </div>

        {readOnly ? null : (
          <CardActions>
            {/*
              Tek tıkla "bitti/geri al" — görev durumu bir formu hak etmeyecek
              kadar sık değişir. Üç durumun üçüncüsü (`in_progress`) buradan
              seçilemez; onu değiştirmek için bugün bir yol yok ve bu bilinen
              bir sınırdır (aşağıdaki `TaskForm` yalnızca OLUŞTURMADA durum
              seçtiriyor).
            */}
            <CardAction
              onClick={onToggle}
              ariaLabel={done ? `${task.title} görevini geri aç` : `${task.title} görevini bitir`}
            >
              {done ? 'Geri aç' : 'Bitti'}
            </CardAction>
            <ConfirmDelete
              pending={busy}
              ariaLabel={`${task.title} görevini sil`}
              question={`"${task.title}" görevi kalıcı olarak silinecek.`}
              onConfirm={onDelete}
            />
          </CardActions>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <DueMark day={task.dueOn} done={done} />
        {task.assigneeUserId === null ? null : (
          // Ad çözülemiyor (üye dizini yok); yalnızca ATANMIŞ olduğu söylenir.
          // Ham UUID yazmak kullanıcıya hiçbir şey anlatmazdı.
          <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase">
            atanmış
          </span>
        )}
      </div>
    </RecordCard>
  );
}

interface TaskFormState {
  title: string;
  status: string;
  dueOn: string;
}

const EMPTY: TaskFormState = { title: '', status: 'todo', dueOn: '' };

function TaskForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (body: CreateTaskRequest) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TaskFormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function change(field: keyof TaskFormState) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    };
  }

  function submit(): void {
    const parsed = createTaskRequestSchema.safeParse({
      title: form.title.trim(),
      status: form.status,
      dueOn: form.dueOn === '' ? null : form.dueOn,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title="Yeni görev">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4">
          <TextField
            id="task-title"
            label="Görev"
            required
            value={form.title}
            onChange={change('title')}
            error={errors.title ?? null}
            placeholder="Örn. Ana sayfa tasarımı"
            disabled={pending}
          />

          <FieldGrid>
            <SelectField
              id="task-status"
              label="Durum"
              value={form.status}
              onChange={change('status')}
              options={STATUS_OPTIONS}
              disabled={pending}
            />
            <TextField
              id="task-due-on"
              label="Son tarih"
              type="date"
              value={form.dueOn}
              onChange={change('dueOn')}
              error={errors.dueOn ?? null}
              disabled={pending}
            />
          </FieldGrid>
        </div>

        <FormActions>
          <GhostButton onClick={onCancel} disabled={pending}>
            Vazgeç
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Kaydediliyor…' : 'Görevi ekle'}
          </PrimaryButton>
        </FormActions>
      </form>
    </InlinePanel>
  );
}
