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
import { RISE } from '@/components/module-kit/chrome';
import { Desk, DeskBody, DeskHead, Room, RoomScroll, RoomTop } from '@/components/room/room';
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
      <Room>
        <RoomScroll>
          <RoomTop name="Proje" meta="Bu proje açılamadı" action={<BackLink />} />
          <Desk>
            <DeskHead title="Proje kaydı" />
            <DeskBody>
              <FormError message={fatalError} />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (state === null) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Proje" meta="Yükleniyor…" action={<BackLink />} />
          <Desk>
            <DeskHead title="Proje kaydı" />
            <DeskBody>
              <p className="text-[12.5px] text-fg-3">{loading ? 'Yükleniyor…' : null}</p>
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  const { project, tasks, notes } = state;

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name={project.name}
          meta={<DetailSubtitle project={project} />}
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill status={project.status} />
              <BackLink />
            </div>
          }
        />

        {/*
        ⚠️ BU ODANIN DUVARI YOKTUR — şirket detayıyla aynı gerekçe.
        Duvar odanın DURUMUNU özetler; bir proje sayfasında özetlenecek bir
        durum değil TEK BİR KAYIT vardır. Projeler'in genel "yürüyen iş"
        sayısını buraya koymak, bakılan projeyle ilgisi olmayan bir dev rakam
        olurdu.
      */}
        <Desk>
          <DeskHead title="Proje kaydı" />
          <DeskBody>
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
                      () =>
                        updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
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
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
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
