'use client';

import type { CreateProjectRequest, ProjectListRow } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { createProject, deleteProject, listProjects, updateProject } from '@/lib/api/projects';
import { errorMessage } from '@/lib/api/error-message';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import { CountMark } from '@/components/module-kit/marks';
import {
  EmptyState,
  ModuleBody,
  ModuleHeader,
  Pager,
  PillButton,
  PrimaryButton,
  RISE,
} from '@/components/module-kit/chrome';
import {
  CardAction,
  CardActions,
  CardMeta,
  CardTitleLink,
  RecordCard,
} from '@/components/module-kit/record-card';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { DueMark, StatusPill } from './marks';
import { ProjectForm } from './project-form';

export const PAGE_SIZE = 20;

/** `403` için ORTAK metin — izin adı değil, NE YAPILAMAYACAĞI söylenir. */
const FORBIDDEN =
  'Bu işlem için yetkiniz yok. Projeleri yalnızca sahip, yönetici veya üye değiştirebilir.';

interface ListState {
  readonly items: readonly ProjectListRow[];
  readonly total: number;
}

/** Liste çekme — görünümden ayrı (`useCompanyList` deseni). */
function useProjectList(offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listProjects({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          // Hata GÖRÜNÜR olur ve liste TEMİZLENMEZ: "0 proje" bir ölçüm değil,
          // ölçememenin sonucudur.
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
  }, [offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

type FormTarget = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; project: ProjectListRow };

/**
 * `/app/projects` — projeler.
 *
 * `CompaniesScreen` ile birebir aynı iskelet ve aynı hareket kademeleri. Yeni
 * tasarım YOKTUR; bu ekranın varlığı, modül kitinin gerçekten genel olduğunun
 * kanıtıdır.
 */
export function ProjectsScreen() {
  const readOnly = isReadOnly(useCurrentRole());
  const [offset, setOffset] = useState(0);
  const { state, error, loading, reload } = useProjectList(offset);

  const [form, setForm] = useState<FormTarget>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function closeForm(): void {
    setForm({ kind: 'none' });
    setFormError(null);
  }

  async function save(body: CreateProjectRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      if (form.kind === 'edit') {
        await updateProject(form.project.id, body);
      } else {
        await createProject(body);
      }
      closeForm();
      reload();
    } catch (caught) {
      setFormError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setDeletingId(id);
    setActionError(null);
    try {
      await deleteProject(id);

      // Sayfanın son kaydı silindiyse bir sayfa geri gidilir; aksi halde
      // kullanıcı BOŞ bir sayfada kalır ve listesi silinmiş sanar.
      if (state.items.length === 1 && offset > 0) {
        setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
      } else {
        reload();
      }
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: 'Silme yetkiniz yok. Proje silmeyi yalnızca sahip veya yönetici yapabilir.',
        }),
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        title="Projeler"
        subtitle={<ProjectCount loading={loading} failed={error !== null} total={state.total} />}
        right={
          // ⚠️ Sekme şeridi HENÜZ ÇİZİLMİYOR: ikinci rota (`/app/projects/tasks`)
          // bu slice'ta yazılmadı ve tek sekmeli bir şerit anlamsız olurdu.
          // Gerekçe `chrome.tsx`'te (`CrmTabs`'ın 8a kararının aynısı).
          <div className="flex flex-wrap items-center gap-2.5">
            {readOnly || form.kind !== 'none' ? null : (
              <PrimaryButton
                onClick={() => {
                  setForm({ kind: 'new' });
                }}
              >
                Yeni proje
              </PrimaryButton>
            )}
          </div>
        }
      />

      <ModuleBody>
        {form.kind === 'none' ? null : (
          <ProjectForm
            {...(form.kind === 'edit' ? { initial: form.project } : {})}
            pending={saving}
            error={formError}
            onSubmit={(body) => {
              void save(body);
            }}
            onCancel={closeForm}
          />
        )}

        <div className="flex flex-col gap-3">
          <FormError message={error} />
          <FormError message={actionError} />
        </div>

        <Rise delay={RISE.body}>
          {state.items.length === 0 ? (
            <EmptyContent
              loading={loading}
              failed={error !== null}
              readOnly={readOnly}
              onCreate={() => {
                setForm({ kind: 'new' });
              }}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {state.items.map((project) => (
                <li key={project.id}>
                  <ProjectCard
                    project={project}
                    readOnly={readOnly}
                    deleting={deletingId === project.id}
                    onEdit={() => {
                      setForm({ kind: 'edit', project });
                    }}
                    onDelete={() => {
                      void remove(project.id);
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
      </ModuleBody>
    </div>
  );
}

/** Liste ÇEKİLEMEDİYSE sayı çizilmez — "0 proje" bir ölçüm değildir. */
function ProjectCount({
  loading,
  failed,
  total,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (failed) {
    return <>Proje listeniz şu an açılamıyor</>;
  }
  if (loading) {
    return <>Projeleriniz</>;
  }

  return (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> proje · işin nerede olduğu burada
      görünür
    </>
  );
}

function EmptyContent({
  loading,
  failed,
  readOnly,
  onCreate,
}: {
  loading: boolean;
  failed: boolean;
  readOnly: boolean;
  onCreate: () => void;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    // Hata zaten yukarıda yazıldı; burada İKİNCİ bir iddia ortaya atılmaz.
    return null;
  }

  return (
    <EmptyState
      title="Henüz proje yok"
      hint={
        readOnly
          ? 'Ekibinizden biri proje açtığında burada görünecek.'
          : 'İlk projenizi açın. Görevlerinizi ve ilerleme notlarınızı ona bağlarsınız; yazdığınız her notu yapay zekâ okur ve sorularınızda kullanır.'
      }
      {...(readOnly ? {} : { action: <PillButton onClick={onCreate}>İlk projeyi aç</PillButton> })}
    />
  );
}

function ProjectCard({
  project,
  readOnly,
  deleting,
  onEdit,
  onDelete,
}: {
  project: ProjectListRow;
  readOnly: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <RecordCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitleLink href={`/app/projects/${project.id}`}>{project.name}</CardTitleLink>
          <StatusPill status={project.status} />
        </div>

        {readOnly ? null : (
          <CardActions>
            <CardAction onClick={onEdit} ariaLabel={`${project.name} projesini düzenle`}>
              Düzenle
            </CardAction>
            <ConfirmDelete
              pending={deleting}
              ariaLabel={`${project.name} projesini sil`}
              question={`"${project.name}" ve ona bağlı tüm görevler ile ilerleme notları kalıcı olarak silinecek. Notlar yapay zekânın hafızasından da çıkar.`}
              onConfirm={onDelete}
            />
          </CardActions>
        )}
      </div>

      {/*
        Müşteri adı `companyName`den gelir ve `null` ÜÇ anlama gelebilir: iç
        proje, silinmiş şirket, ya da `company:read` yokluğu. Üçü de aynı
        şekilde çizilir (hiç çizilmez) ve bu KASITLIDIR — ayırmak bir şirketin
        var olduğunu sızdırırdı (ADR-0033 §2).
      */}
      <CardMeta items={[project.companyName, project.description]} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CountMark count={project.openTaskCount} singular="açık görev" />
        {project.overdueTaskCount > 0 ? (
          // Sayaç UYANIK: gecikmiş iş, bakılması gereken tek şeydir.
          <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium tracking-[0.09em] text-ink uppercase tabular">
            <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
            {project.overdueTaskCount} gecikmiş
          </span>
        ) : null}
        <DueMark day={project.dueOn} done={project.status === 'completed'} />
      </div>
    </RecordCard>
  );
}
