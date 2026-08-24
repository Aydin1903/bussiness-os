import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type AuditLogFilter,
  type AuditLogPage,
  type AuditLogRepository,
} from './audit-log.repository.port';

export interface ListAuditEntriesDependencies {
  readonly repository: AuditLogRepository;
  readonly transactionManager: TransactionManager;
}

/**
 * Denetim kayitlarini listeler (ADR-0043 §6.4).
 *
 * Use case INCEDIR ve olmalidir: burada bir is kurali yoktur. Tek isi
 * transaction sinirini cizmektir (MT §13.3 kural 2) — ve o sinir
 * `runInCurrentTenantTransaction`tir, yani ISTEGIN tenant context'i.
 *
 * ⚠️ `tenantId` imzada YOKTUR (MT §13.1): cagiran bir tenant SECEMEZ.
 * Daraltmayi RLS yapar. Bir denetim kaydi ucunda bu, diger tablolardan daha
 * kritiktir — yanlis tenant'in denetim gecmisi, o tenant'ta KIMIN NE YAPTIGINI
 * sizdiran bir listedir.
 *
 * ⚠️ FAIL CLOSED: tenant context yoksa sorgu SESSIZCE BOS DONMEZ, hata verir
 * (`MissingTenantContextError`). Bir denetim listesinde sessiz bos sonuc en
 * kotu bozulmadir: okuyan kisi "hicbir degisiklik olmamis" diye okur.
 */
export class ListAuditEntriesUseCase {
  constructor(private readonly deps: ListAuditEntriesDependencies) {}

  async execute(filter: AuditLogFilter): Promise<AuditLogPage> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(filter),
    );
  }
}
