import { describe, expect, it, vi } from 'vitest';

import {
  MissingTenantContextError,
  type TransactionManager,
} from '../../../shared/transaction-manager.port';
import {
  type AuditLogFilter,
  type AuditLogPage,
  type AuditLogRepository,
} from './audit-log.repository.port';
import { ListAuditEntriesUseCase } from './list-audit-entries.use-case';

const EMPTY_PAGE: AuditLogPage = { items: [], total: 0 };
const RESOURCE_ID = '018f3a2b-7c4d-7e1f-9b3c-0000000000b7';

const FILTER: AuditLogFilter = {
  resourceType: 'hr.employee',
  resourceId: RESOURCE_ID,
  limit: 20,
  offset: 0,
};

/**
 * ⚠️ Sahte transaction manager, YANLIS metotlar cagrildiginda HATA FIRLATIR.
 *
 * MT §13.1: `tenantId` use case imzasinda YOKTUR — cagiran bir tenant SECEMEZ.
 * Bir denetim kaydi ucunda bu, diger tablolardan daha kritiktir: yanlis
 * tenant'in denetim gecmisi, o tenant'ta KIMIN NE YAPTIGINI sizdiran bir
 * listedir. Yanlis metot secilirse test kirmizi yanar.
 */
function transactionManager(overrides: {
  current?: <T>(fn: () => Promise<T>) => Promise<T>;
}): TransactionManager {
  return {
    runInTransaction: () =>
      Promise.reject(new Error('Tenant context i olmayan transaction KULLANILMAMALI.')),
    runInTenantTransaction: () =>
      Promise.reject(new Error('Cagirandan tenantId ALINMAMALI (MT §13.1).')),
    runInCurrentTenantTransaction: overrides.current ?? ((fn) => fn()),
  };
}

describe('ListAuditEntriesUseCase', () => {
  it('⚠️ ISTEGIN tenant context i altinda calisir — cagirandan tenant ALMAZ', async () => {
    let ranInTenant = false;

    const useCase = new ListAuditEntriesUseCase({
      repository: { list: vi.fn(() => Promise.resolve(EMPTY_PAGE)) },
      transactionManager: transactionManager({
        current: (fn) => {
          ranInTenant = true;
          return fn();
        },
      }),
    });

    await useCase.execute(FILTER);

    expect(ranInTenant).toBe(true);
  });

  it('filtreyi repository ye OLDUGU GIBI gecirir', async () => {
    const list = vi.fn(() => Promise.resolve(EMPTY_PAGE));

    const useCase = new ListAuditEntriesUseCase({
      repository: { list },
      transactionManager: transactionManager({}),
    });

    await useCase.execute(FILTER);

    expect(list).toHaveBeenCalledWith(FILTER);
  });

  it('sayfayi oldugu gibi dondurur', async () => {
    const page: AuditLogPage = {
      items: [
        {
          id: '018f3a2b-7c4d-7e1f-8a2b-000000000001',
          occurredAt: new Date('2026-08-24T09:15:00.000Z'),
          actorUserId: '018f3a2b-7c4d-7e1f-9b3c-0000000000d1',
          resourceType: 'hr.employee',
          resourceId: RESOURCE_ID,
          action: 'updated',
          fieldName: 'job_title',
        },
      ],
      total: 1,
    };

    const useCase = new ListAuditEntriesUseCase({
      repository: { list: vi.fn(() => Promise.resolve(page)) },
      transactionManager: transactionManager({}),
    });

    await expect(useCase.execute(FILTER)).resolves.toEqual(page);
  });

  it('⚠️ FAIL CLOSED — tenant context yoksa BOS LISTE degil HATA doner', async () => {
    // Bir denetim listesinde sessiz bos sonuc en kotu bozulmadir: okuyan kisi
    // "hicbir degisiklik olmamis" diye okur ve kayit tutuluyor olmasina ragmen
    // tutulmuyormus gibi gorunur.
    const list = vi.fn(() => Promise.resolve(EMPTY_PAGE));
    const repository: AuditLogRepository = { list };

    const useCase = new ListAuditEntriesUseCase({
      repository,
      transactionManager: transactionManager({
        current: () => Promise.reject(new MissingTenantContextError()),
      }),
    });

    await expect(useCase.execute(FILTER)).rejects.toThrow(MissingTenantContextError);
    expect(list).not.toHaveBeenCalled();
  });
});
