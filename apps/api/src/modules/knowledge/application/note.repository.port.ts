import { type Note } from '../domain/note.entity';

/** DI token'i. */
export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');

/**
 * `knowledge.notes` kaliciligi icin application port'u (ADR-0029 §1).
 *
 * DAR TUTULUR (MT §12.4.3'teki `users` disiplini): `findAll` benzeri bir metot
 * YOKTUR. Her okuma ucu KENDI dar metodunu ekler — genel amacli bir sorgu
 * yuzeyi acmak, ilerideki her ihtiyaci ayni metoda yigmaya davet olurdu.
 */
export interface NoteRepository {
  /** Notu kaydeder. Aktif tenant transaction'i GEREKTIRIR. */
  save(note: Note): Promise<void>;

  /**
   * Aktif tenant'in EN AZ BIR notu var mi (ADR-0030 §3 tetikleme kosulu).
   *
   * ⚠️ SAYMAZ. Onboarding'in tek sordugu "hic mi yok"tur; `COUNT(*)` binlerce
   * notu olan bir tenant'ta tum tabloyu tarardi. `LIMIT 1` ilk satirda durur.
   *
   * Tenant daraltmasi RLS'tedir — bu yuzden imza tenant ALMAZ; aktif
   * transaction'in context'i neyse o.
   */
  existsForTenant(): Promise<boolean>;
}
