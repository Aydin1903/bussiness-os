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

/**
 * Chunk'i OLMAYAN not — yeniden indekslenecek is (ADR-0029 bilinen sinir).
 *
 * `body` TAM doner (listedeki `preview`'in aksine): yeniden chunk'lamak icin
 * metnin tamami gerekli. Bu yuzden `limit` KUCUK tutulur.
 */
export interface UnindexedNote {
  readonly id: string;
  readonly body: string;
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

  /**
   * Chunk'i olmayan notlarin SAYISI.
   *
   * `notes LEFT JOIN note_chunks WHERE note_chunks.id IS NULL` — ADR-0029'un
   * "LEFT JOIN ile tespit edilebilir kaliyor" notunun karsiligi.
   *
   * ⚠️ AYRI BIR "is listesi" TABLOSU YOK ve bilincli: chunk'in YOKLUGU is
   * listesinin KENDISIDIR. Deneme sayaci/backoff, OTOMATIK ve sonsuz bir
   * donguyu dizginlemek icin vardir (outbox, gunluk rapor); burada tetikleyici
   * ACIK bir istektir ve oran sinirina tabidir — sayac tablosu cozdugu bir
   * problem olmadan bakim yuku olurdu.
   */
  countUnindexed(): Promise<number>;

  /** Chunk'i olmayan notlar, TAM govdeleriyle. En yeni once. */
  listUnindexed(limit: number): Promise<UnindexedNote[]>;
}
