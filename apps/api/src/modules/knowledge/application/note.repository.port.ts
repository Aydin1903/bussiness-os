import { type Note } from '../domain/note.entity';

/**
 * Liste satiri — govde KIRPILMIS.
 *
 * ⚠️ Tam `body` DONMEZ ve bu bilincli: bir not 500.000 karaktere kadar
 * cikabilir; 20 notun tam govdesi tek yanitta megabaytlarca veri demektir.
 * Liste ekraninin ihtiyaci onizlemedir. Tam metin bir NOT DETAY ucunun isidir
 * ve o uc henuz yok (bilinen sinir, ADR-0029).
 */
export interface NoteListItem {
  readonly id: string;
  readonly title: string | null;
  /** Govdenin ilk parcasi. Uzunsa `…` ile biter. */
  readonly preview: string;
  /** Tam govdenin karakter sayisi — istemci "kirpildi mi" bilir. */
  readonly bodyLength: number;
  readonly createdAt: Date;
}

export interface NoteListPage {
  readonly items: readonly NoteListItem[];
  /** Tenant'in TOPLAM not sayisi (sayfadaki degil). */
  readonly total: number;
}

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

  /**
   * Aktif tenant'in notlarini SAYFALI doner — en yeni once.
   *
   * Siralama `created_at DESC, id DESC`. Tie-breaker SART: onboarding yedi notu
   * saniyeler icinde yazar ve `created_at` esitliginde sira sayfadan sayfaya
   * degisebilirdi (`messages` tablosundaki ayni ders). Kararsiz siralama,
   * sayfalamada bir notun iki kez gorunmesi ya da hic gorunmemesi demektir.
   *
   * Tenant daraltmasi RLS'tedir; imza tenant ALMAZ.
   */
  listForTenant(input: {
    readonly limit: number;
    readonly offset: number;
    /** Onizlemenin en fazla karakter sayisi. */
    readonly previewLength: number;
  }): Promise<NoteListPage>;
}
