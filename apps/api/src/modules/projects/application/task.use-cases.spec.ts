import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type TenantAccessQuery, type TenantAccessResult } from '../../tenant/tenant.public';
import { Project } from '../domain/project.entity';
import { TaskAssigneeNotMemberError, TaskProjectNotFoundError } from '../domain/projects.error';
import { type ProjectRepository } from './project.repository.port';
import { type TaskRepository } from './task.repository.port';
import { TaskUseCases } from './task.use-cases';

/**
 * `TaskUseCases` — bu slice'in GERCEKTEN YENI mantigi.
 *
 * CRUD'un kendisi `ProjectUseCases` ile ayni ve orada kanitlandi; buradaki
 * testler iki dogrulama zincirine odaklaniyor (ADR-0033 §3, §4):
 * proje VAR MI, ve atanan kisi bu tenant'in AKTIF UYESI MI.
 */

const NOW = new Date('2026-08-10T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const PROJECT = '018f3a2b-7c4d-7e1f-8a2b-00000000000c';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => '018f3a2b-7c4d-7e1f-8a2b-00000000000d' };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function granted(): TenantAccessResult {
  return { granted: true, tenantId: TENANT, role: 'member' };
}

function build(overrides: { access?: TenantAccessResult; project?: Project | null }) {
  const save = vi.fn<(task: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const resolveMemberAccess = vi
    .fn<TenantAccessQuery['resolveMemberAccess']>()
    .mockResolvedValue(overrides.access ?? granted());
  const findProject = vi
    .fn<ProjectRepository['findById']>()
    .mockResolvedValue(overrides.project === undefined ? existingProject() : overrides.project);

  const useCases = new TaskUseCases({
    repository: { save } as unknown as TaskRepository,
    projectRepository: { findById: findProject } as unknown as ProjectRepository,
    tenantAccess: { resolveMemberAccess },
    transactionManager,
    idGenerator,
    clock,
  });

  return { useCases, save, resolveMemberAccess, findProject };
}

function existingProject(): Project {
  return Project.create({
    id: PROJECT,
    tenantId: TENANT,
    fields: {
      name: 'Web sitesi',
      status: 'in_progress',
      description: null,
      startedOn: null,
      dueOn: null,
      companyId: null,
    },
    now: NOW,
  });
}

function fields(assigneeUserId: string | null = null) {
  return { title: 'Ana sayfa', status: 'todo', dueOn: null, assigneeUserId } as const;
}

describe('TaskUseCases — atama dogrulamasi (ADR-0033 §4)', () => {
  it('atanan kisi UYE DEGILSE gorev YAZILMAZ', async () => {
    const { useCases, save } = build({ access: { granted: false, reason: 'no-membership' } });

    await expect(
      useCases.create({ tenantId: TENANT, projectId: PROJECT, fields: fields(USER) }),
    ).rejects.toThrow(TaskAssigneeNotMemberError);

    // Asil iddia: yalnizca hata degil, YAZMA DA olmadi. Kontrolun
    // transaction'dan once olmasinin sebebi budur.
    expect(save).not.toHaveBeenCalled();
  });

  it('uyelik PASIFSE de reddedilir (fail closed)', async () => {
    const { useCases } = build({ access: { granted: false, reason: 'membership-inactive' } });

    await expect(
      useCases.create({ tenantId: TENANT, projectId: PROJECT, fields: fields(USER) }),
    ).rejects.toThrow(TaskAssigneeNotMemberError);
  });

  it('tenant PASIFSE de reddedilir (fail closed)', async () => {
    const { useCases } = build({ access: { granted: false, reason: 'tenant-inactive' } });

    await expect(
      useCases.create({ tenantId: TENANT, projectId: PROJECT, fields: fields(USER) }),
    ).rejects.toThrow(TaskAssigneeNotMemberError);
  });

  it('ATANMAMIS gorevde uyelik SORGUSU HIC yapilmaz', async () => {
    const { useCases, resolveMemberAccess } = build({});

    await useCases.create({ tenantId: TENANT, projectId: PROJECT, fields: fields(null) });

    // Bedava olmayan bir sorgu; gereksiz yere atilmamali.
    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });

  it('atanan kisi UYEYSE gorev yazilir', async () => {
    const { useCases, save, resolveMemberAccess } = build({});

    const state = await useCases.create({
      tenantId: TENANT,
      projectId: PROJECT,
      fields: fields(USER),
    });

    expect(resolveMemberAccess).toHaveBeenCalledWith({ userId: USER, tenantId: TENANT });
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.assigneeUserId).toBe(USER);
  });

  it('guncellemede `assigneeUserId` GONDERILMEZSE uyelik sorgusu yapilmaz', async () => {
    const { useCases, resolveMemberAccess } = build({});

    await useCases
      .update({ tenantId: TENANT, id: 'x', changes: { title: 'Yeni' } })
      .catch(() => undefined);

    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });

  it('guncellemede `assigneeUserId: null` (atamayi kaldir) sorgu gerektirmez', async () => {
    const { useCases, resolveMemberAccess } = build({});

    await useCases
      .update({ tenantId: TENANT, id: 'x', changes: { assigneeUserId: null } })
      .catch(() => undefined);

    expect(resolveMemberAccess).not.toHaveBeenCalled();
  });
});

describe('TaskUseCases — proje dogrulamasi (ADR-0033 §3)', () => {
  it('VAR OLMAYAN projeye baglanan gorev REDDEDILIR', async () => {
    const { useCases, save } = build({ project: null });

    await expect(
      useCases.create({ tenantId: TENANT, projectId: PROJECT, fields: fields() }),
    ).rejects.toThrow(TaskProjectNotFoundError);

    expect(save).not.toHaveBeenCalled();
  });

  it('PROJESIZ gorevde proje sorgusu HIC yapilmaz', async () => {
    const { useCases, findProject, save } = build({});

    const state = await useCases.create({ tenantId: TENANT, projectId: null, fields: fields() });

    // "Yapilacaklar" kutusu: ebeveyn yok, dolayisiyla dogrulanacak bir sey de yok.
    expect(findProject).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(state.projectId).toBeNull();
  });
});
