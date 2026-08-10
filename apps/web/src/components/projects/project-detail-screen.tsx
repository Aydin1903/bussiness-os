'use client';

import type { CreateTaskRequest, ProgressNote, ProjectDetail, Task } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  createProgressNote,
  createTask,
  deleteTask,
  getProject,
  listProgressNotes,
  listTasks,
  updateTask,
} from '@/lib/api/projects';
import { errorMessage } from '@/lib/api/error-message';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { ModuleBody, ModuleHeader, RISE } from '@/components/module-kit/chrome';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { StatusPill } from './marks';
import { ProgressNoteSection } from './progress-note-section';
import { TaskSection } from './task-section';

/** Detayda sayfalama YOK: bir projenin görev/not sayısı bu sınırın altındadır. */
const SECTION_LIMIT = 100;

interface DetailState {
  readonly project: ProjectDetail;
  readonly tasks: readonly Task[];
  readonly notes: readonly ProgressNote[];
}

/**
 * Üç ucu PARALEL çeker (`use-company-detail.ts` deseni).
 *
 * ⚠️ Projenin kendisi ÖLÜMCÜLDÜR: gelmezse ekranda gösterilecek bir şey yok.
 * Görevler ve notlar ise KISMİ başarısızlığa izin verir — biri gelmezse o
 * bölüm boş görünür ama sayfa açılır. Üçünü de ölümcül saymak, tek bir yavaş
 * sorgunun sayfayı tamamen kapatması demekti.
 */
function useProjectDetail(projectId: string) {
  const [state, setState] = useState<DetailState | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      getProject(projectId),
      listTasks({ limit: SECTION_LIMIT, offset: 0, projectId }),
      listProgressNotes({ limit: SECTION_LIMIT, offset: 0, projectId }),
    ])
      .then(([project, tasks, notes]) => {
        if (!active) {
          return;
        }
        setState({ project, tasks: tasks.items, notes: notes.items });
        setFatalError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setFatalError(errorMessage(caught));
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
  }, [projectId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, fatalError, loading, reload };
}

/**
 * `/app/projects/[projectId]` — proje detayı.
 *
 * `CompanyDetailScreen` ile aynı iskelet: başlık şeridi (geri bağlantısı +
 * durum) → kaydırılan gövde → bölümler. Yeni tasarım YOKTUR.
 */
export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const readOnly = isReadOnly(useCurrentRole());
  const { state, fatalError, loading, reload } = useProjectDetail(projectId);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, onError: (message: string) => void) {
    setBusy(true);
    onError('');
    try {
      await work();
      reload();
    } catch (caught) {
      onError(
        errorMessage(caught, undefined, {
          403: 'Bu işlem için yetkiniz yok.',
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (fatalError !== null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModuleHeader title="Proje" subtitle="Bu proje açılamadı" right={<BackLink />} />
        <ModuleBody>
          <FormError message={fatalError} />
        </ModuleBody>
      </div>
    );
  }

  if (state === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModuleHeader title="Proje" subtitle="Yükleniyor…" right={<BackLink />} />
        <ModuleBody>
          <p className="text-[12.5px] text-fg-3">{loading ? 'Yükleniyor…' : null}</p>
        </ModuleBody>
      </div>
    );
  }

  const { project, tasks, notes } = state;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        title={project.name}
        subtitle={<DetailSubtitle project={project} />}
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill status={project.status} />
            <BackLink />
          </div>
        }
      />

      <ModuleBody>
        <div className="flex flex-col gap-3">
          <FormError message={actionError === '' ? null : actionError} />
        </div>

        <Rise delay={RISE.body}>
          <div className="flex flex-col gap-8">
            <TaskSection
              tasks={tasks}
              readOnly={readOnly}
              busy={busy}
              onCreate={(body: CreateTaskRequest) => {
                void run(() => createTask({ ...body, projectId }), setActionError);
              }}
              onToggle={(task) => {
                void run(
                  () => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
                  setActionError,
                );
              }}
              onDelete={(task) => {
                void run(() => deleteTask(task.id), setActionError);
              }}
            />

            <ProgressNoteSection
              notes={notes}
              readOnly={readOnly}
              busy={busy}
              error={noteError === '' ? null : noteError}
              onCreate={(body) => {
                void run(() => createProgressNote({ projectId, body }), setNoteError);
              }}
            />
          </div>
        </Rise>
      </ModuleBody>
    </div>
  );
}

/**
 * Başlık altı — müşteri adı ve tarihler.
 *
 * `companyName` `null` ise HİÇBİR ŞEY yazılmaz. Üç sebebi olabilir (iç proje,
 * silinmiş şirket, `company:read` yokluğu) ve üçü AYIRT EDİLMEZ — ayırmak bir
 * şirketin var olduğunu sızdırırdı (ADR-0033 §2).
 */
function DetailSubtitle({ project }: { project: ProjectDetail }) {
  const parts: string[] = [];

  if (project.companyName !== null) {
    parts.push(project.companyName);
  }
  if (project.dueOn !== null) {
    parts.push(`bitiş ${project.dueOn}`);
  }

  return <>{parts.length === 0 ? 'Bu projenin işleri ve geçmişi' : parts.join(' · ')}</>;
}

function BackLink() {
  return (
    <Link
      href="/app/projects"
      className="text-[12.5px] font-medium tracking-[-0.008em] text-fg-3 transition-colors duration-150 hover:text-fg"
    >
      ← Projeler
    </Link>
  );
}
