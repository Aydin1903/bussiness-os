'use client';

import { createTaskRequestSchema, type CreateTaskRequest, type Task } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { createTask, deleteTask, listTasks, updateTask } from '@/lib/api/projects';
import { errorMessage } from '@/lib/api/error-message';
import { ProjectsWall } from './projects-wall';
import { Desk, DeskBody, DeskHead, Room, RoomScroll, RoomTop } from '@/components/room/room';

import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import { EmptyState, Pager, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  fieldErrors,
  NO_FIELD_ERRORS,
  type FieldErrors,
} from '@/components/module-kit/field-errors';
import { FormActions, GhostButton, InlinePanel, TextField } from '@/components/module-kit/form-kit';
import {
  CardAction,
  CardActions,
  CardHeader,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { ProjectTabs } from './chrome';
import { DueMark, TaskStatusPill } from './marks';
import { ScopeFilter, type TaskScope } from './scope-filter';

export const PAGE_SIZE = 20;

const FORBIDDEN =
  'Bu işlem için yetkiniz yok. Görevleri yalnızca sahip, yönetici veya üye değiştirebilir.';

interface ListState {
  readonly items: readonly Task[];
  readonly total: number;
}

/**
 * İKİ KAPSAM, İKİ SORGU.
 *
 * `inbox`   → `withoutProject=true`. Hiçbir projeye ait olmayan işler
 *             ("faturayı gönder"). ADR-0033 §3'ün karakteristik kararı bu
 *             ekranda görünür hâle gelir.
 * `overdue` → `overdue=true`, TÜM projeler dahil. "Şirkette ne gecikti"
 *             sorusu proje sınırı tanımaz; yapısal katkıcının (Slice 4) AI'a
 *             anlattığı tabloyu insanın da görebildiği yer burasıdır.
 *
 * ⚠️ İkisi BİRLİKTE gönderilmez. Backend `projectId`+`withoutProject`
 * çiftini reddediyor ama `withoutProject`+`overdue` teknik olarak geçerli;
 * yine de birleştirilmedi — "projesiz VE gecikmiş" üçüncü bir soru olurdu ve
 * kullanıcı hangi kümeye baktığını kaybederdi.
 */
function useTaskList(scope: TaskScope, offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listTasks({
      limit: PAGE_SIZE,
      offset,
      ...(scope === 'inbox' ? { withoutProject: true } : { overdue: true }),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          // Liste TEMİZLENMEZ: "0 görev" bir ölçüm değil, ölçememenin sonucu.
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
  }, [scope, offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

/**
 * `/app/projects/tasks` — Yapılacaklar.
 *
 * `FollowUpsScreen` ile aynı sınıfta bir ekran: türetilmiş bir liste
 * görünümü, kendi verisi yok. Farkı, buranın YAZILABİLİR olması — projesiz
 * görev açmanın tek yeri burasıdır (proje detayındaki form her zaman o
 * projeye bağlar).
 */
export function TasksScreen() {
  const readOnly = isReadOnly(useCurrentRole());
  const [scope, setScope] = useState<TaskScope>('inbox');
  const [offset, setOffset] = useState(0);
  const { state, error, loading, reload } = useTaskList(scope, offset);

  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function pickScope(next: TaskScope): void {
    setScope(next);
    // Kapsam değişince sayfa BAŞA döner: 3. sayfada 2 sonucu olan bir kümeye
    // geçmek kullanıcıyı boş bir sayfada bırakırdı.
    setOffset(0);
  }

  async function run(work: () => Promise<unknown>, onError: (message: string | null) => void) {
    setBusy(true);
    onError(null);
    try {
      await work();
      reload();
    } catch (caught) {
      onError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Yapılacaklar"
          meta={
            <TaskCount
              scope={scope}
              loading={loading}
              failed={error !== null}
              total={state.total}
            />
          }
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              <ProjectTabs />
              {readOnly || creating ? null : (
                <PrimaryButton
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  Yeni görev
                </PrimaryButton>
              )}
            </div>
          }
        />

        <ProjectsWall />

        <Desk>
          <DeskHead title="Yapılacaklar" />
          <DeskBody>
            <div className="mb-5">
              <ScopeFilter scope={scope} onPick={pickScope} />
            </div>

            {creating ? (
              <InlineTaskForm
                pending={busy}
                error={formError}
                onSubmit={(body) => {
                  void run(() => createTask(body), setFormError).then(() => {
                    setCreating(false);
                  });
                }}
                onCancel={() => {
                  setCreating(false);
                  setFormError(null);
                }}
              />
            ) : null}

            <div className="flex flex-col gap-3">
              <FormError message={error} />
              <FormError message={actionError} />
            </div>

            <Rise delay={RISE.body}>
              {state.items.length === 0 ? (
                <EmptyContent
                  scope={scope}
                  loading={loading}
                  failed={error !== null}
                  readOnly={readOnly}
                  onCreate={() => {
                    setCreating(true);
                  }}
                />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {state.items.map((task) => (
                    <li key={task.id}>
                      <InboxTaskCard
                        task={task}
                        readOnly={readOnly}
                        busy={busy}
                        onToggle={() => {
                          void run(
                            () =>
                              updateTask(task.id, {
                                status: task.status === 'done' ? 'todo' : 'done',
                              }),
                            setActionError,
                          );
                        }}
                        onDelete={() => {
                          void run(() => deleteTask(task.id), setActionError);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Rise>

            <Pager
              offset={offset}
              count={state.items.length}
              total={state.total}
              loading={loading}
              onPrevious={() => {
                setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset((previous) => previous + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/** Sayı, liste ÇEKİLEMEDİYSE çizilmez — "0 görev" bir ölçüm değildir. */
function TaskCount({
  scope,
  loading,
  failed,
  total,
}: {
  scope: TaskScope;
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (failed) {
    return <>Görev listeniz şu an açılamıyor</>;
  }
  if (loading) {
    return <>Görevleriniz</>;
  }

  return scope === 'inbox' ? (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> projesiz görev · bir projeye ait
      olmayan işler
    </>
  ) : (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> gecikmiş görev · tüm projeler dahil
    </>
  );
}

/**
 * Boş durum — kapsama göre FARKLI konuşur.
 *
 * "Gecikmiş yok" bir BAŞARIDIR, bir eksiklik değil; onu "henüz kayıt yok" gibi
 * göstermek yanlış bir eksiklik hissi verirdi.
 */
function EmptyContent({
  scope,
  loading,
  failed,
  readOnly,
  onCreate,
}: {
  scope: TaskScope;
  loading: boolean;
  failed: boolean;
  readOnly: boolean;
  onCreate: () => void;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    return null;
  }

  if (scope === 'overdue') {
    return (
      <EmptyState
        title="Geciken iş yok"
        hint="Son tarihi geçmiş ve hâlâ açık bir görev bulunmuyor. Yapay zekâ da bu tabloyu okuyor; burası boşken uyarı üretmez."
      />
    );
  }

  return (
    <EmptyState
      title="Projesiz görev yok"
      hint={
        readOnly
          ? 'Ekibinizden biri projesiz bir görev eklediğinde burada görünecek.'
          : 'Bir projeye ait olmayan işleri buraya ekleyin — "faturayı gönder", "domaini yenile" gibi. Zorunlu bir proje seçmek için sahte projeler açmanız gerekmez.'
      }
      {...(readOnly ? {} : { action: <PillButton onClick={onCreate}>Görev ekle</PillButton> })}
    />
  );
}

/**
 * Kutu kartı — proje detayındaki karttan TEK farkı, projesine bağlantı
 * verebilmesi.
 *
 * ⚠️ `projectId` `null` ise bağlantı ÇİZİLMEZ. "Gecikmiş" kapsamında liste
 * projeli görevleri de içerir ve `LEFT JOIN` sayesinde projesizler de düşmez;
 * ikisi aynı listede yaşadığı için ayrım görünür olmalı.
 */
function InboxTaskCard({
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
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitle>{task.title}</CardTitle>
          <TaskStatusPill status={task.status} />
        </div>

        {readOnly ? null : (
          <CardActions>
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
      </CardHeader>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <DueMark day={task.dueOn} done={done} />
        {task.assigneeUserId === null ? (
          // ⚠️ "ATANMAMIŞ" gerçek bir aksiyon sinyalidir — özellikle gecikmiş
          // kapsamında: geciken ve sahibi olmayan iş. Ad çözülemiyor (üye
          // dizini henüz yok); ham UUID yazmak hiçbir şey anlatmazdı.
          <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase">
            atanmamış
          </span>
        ) : (
          <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase">
            atanmış
          </span>
        )}
      </div>
    </RecordCard>
  );
}

interface FormState {
  title: string;
  dueOn: string;
}

/**
 * Projesiz görev formu.
 *
 * ⚠️ `projectId` GÖNDERİLMEZ ve bu ekranın var olma sebebi budur: proje
 * detayındaki form her görevi o projeye bağlar; buradan açılan görev
 * "Yapılacaklar" kutusuna düşer (ADR-0033 §3).
 *
 * Durum seçici YOK: bir yapılacak maddesi `todo` başlar. Üç durumluk bir
 * açılır liste, tek satırlık bir iş için gereksiz ağırlık olurdu.
 */
function InlineTaskForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateTaskRequest) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({ title: '', dueOn: '' });
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function submit(): void {
    const parsed = createTaskRequestSchemaSafe({
      title: form.title.trim(),
      dueOn: form.dueOn === '' ? null : form.dueOn,
    });

    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.value);
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
          <FormError message={error} />

          <TextField
            id="inbox-task-title"
            label="Görev"
            required
            value={form.title}
            onChange={(value) => {
              setForm((previous) => ({ ...previous, title: value }));
            }}
            error={errors.title ?? null}
            placeholder="Örn. Faturayı gönder"
            disabled={pending}
          />

          <TextField
            id="inbox-task-due-on"
            label="Son tarih"
            type="date"
            value={form.dueOn}
            onChange={(value) => {
              setForm((previous) => ({ ...previous, dueOn: value }));
            }}
            error={errors.dueOn ?? null}
            hint="Son tarihi geçen görevler yapay zekânın uyarılarına girer."
            disabled={pending}
          />
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

/** Zod sonucunu tek yerde ele alır; çağıran `safeParse` şeklini bilmez. */
function createTaskRequestSchemaSafe(
  body: unknown,
): { ok: true; value: CreateTaskRequest } | { ok: false; errors: FieldErrors } {
  const parsed = createTaskRequestSchema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, errors: fieldErrors(parsed.error) };
}
