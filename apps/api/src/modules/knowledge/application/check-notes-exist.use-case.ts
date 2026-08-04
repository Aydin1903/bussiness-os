import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type NoteRepository } from './note.repository.port';

export interface CheckNotesExistResult {
  readonly hasNotes: boolean;
}

export interface CheckNotesExistDependencies {
  readonly noteRepository: NoteRepository;
  readonly transactionManager: TransactionManager;
}

/**
 * Aktif tenant'in hic notu olup olmadigini soyler (ADR-0030 §3).
 *
 * ============================================================================
 * NEDEN BIR USE CASE — "sadece bir SELECT" olmasina ragmen
 * ============================================================================
 * Controller'in repository'yi dogrudan cagirmasi katman kuralini bozardi
 * (`presentation -> application -> domain`). Daha somut bir sebep var: sorgunun
 * bir TENANT TRANSACTION'I icinde calismasi ZORUNLU. RLS politikasi
 * `current_setting('app.current_tenant_id')` okur ve context yoksa sorgu
 * SESSIZCE BOS DONMEZ, HATA VERIR (MT §12.6 madde 4).
 *
 * Transaction sinirinin sahibi use case'tir (MT §13.3 kural 2); bu kurali
 * "kucuk" diye bir kez esnetmek, kuralin kendisini kaybettirir.
 *
 * ============================================================================
 * BU BIR "onboarding tamamlandi mi" SORUSU DEGILDIR
 * ============================================================================
 * Sorulan sey yalnizca "bu tenant'in notu var mi". Wizard'in gosterilip
 * gosterilmeyecegi ISTEMCI kararidir (ADR-0030 §3: onboarding tumuyle bir
 * frontend akisidir) ve "kullanici gecti" durumu istemcide tutulur.
 *
 * Backend'e "onboarding durumu" diye bir kavram KOYULMADI: koyulsaydi kalici
 * bir tenant durumu olur, migration ister ve gercek sorusu ("hafiza bos mu")
 * ile arasindaki fark ilk degisiklikte belirsizlesirdi.
 * ============================================================================
 */
export class CheckNotesExistUseCase {
  constructor(private readonly deps: CheckNotesExistDependencies) {}

  async execute(): Promise<CheckNotesExistResult> {
    const hasNotes = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.noteRepository.existsForTenant(),
    );

    return { hasNotes };
  }
}
