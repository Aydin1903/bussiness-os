import {
  FutureEntryDateError,
  InvalidPointAmountError,
  InvalidPointDirectionError,
  PointEntryNoteTooLongError,
} from './loyalty.error';

/**
 * ⚠️ ARITMETIK EKSEN — isaretli puan DEGIL (ADR-0051 §1.4).
 *
 * ADR-0034 §5 (gelir/gider) ve ADR-0039 §3 (giris/cikis) kararlarinin UCUNCU
 * uygulamasi: `points` HER ZAMAN POZITIFTIR, yon ayri bir alanda yasar.
 * Isaretli bir miktar secilseydi, isaret koymayi unutan TEK bir yazma yolu bir
 * harcamayi kazanc gibi toplardi ve hata SESSIZ ve MAKUL GORUNEN yanlis bir
 * sayi uretirdi.
 *
 * ⚠️ Bu liste veritabanindaki `point_entries_direction_valid` CHECK'i ve
 * Zod semasi ile SENKRON kalmak zorundadir — ucu de bu sabitten turetiliyor
 * ki ayrisma IMKANSIZ olsun.
 */
export const POINT_DIRECTIONS = ['earn', 'spend'] as const;
export type PointDirection = (typeof POINT_DIRECTIONS)[number];

/**
 * ⚠️ Bir ETIKETIN ust siniri — bir ANLATININ degil (ADR-0051 §3.1).
 *
 * `TARGET_CHUNK_CHARS`ten TURETILMEZ ve bu, Kampanya/Randevu/Geri
 * Bildirim'den AYRILDIGIMIZ NOKTADIR: o sinirlar bir metnin TEK PARCA
 * kalmasini garanti etmek icindi (chunk tablosu acmamak icin). ⚠️ Burada
 * embed edilecek HICBIR SEY YOKTUR, yani chunking ile bir iliski de yoktur.
 *
 * 160 karakter bir etiket icin comerttir ("Eylul kampanyasi hediye puani,
 * kasa fisi #4471") ve bir anlati icin dardir — sinirin isi tam olarak bu
 * ayrimi ZORLAMAKTIR.
 */
export const MAX_POINT_ENTRY_NOTE_CHARS = 160;

export interface PointEntryState {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly direction: PointDirection;
  readonly points: number;
  readonly note: string | null;
  readonly occurredAt: Date;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

/**
 * Defterin tek satiri — ⚠️ DEGISTIRILEMEZ (ADR-0051 §2.3, katman 1).
 *
 * ⚠️ Burada bir `update` metodu YOKTUR ve olmamalidir. Bir satiri degistirmek
 * BUGUNKU BAKIYEYI SESSIZCE YENIDEN YAZAR — 500 puanlik bir hesap bir satir
 * duzeltilince 200 olur ve kimse bilmez. Ayni gerekce tekil silmeyi de
 * kapatir (`loyalty_point:delete` diye bir izin YOKTUR).
 *
 * ⚠️ DUZELTME TERS YONDE BIR SATIRDIR (ADR-0041'in "iskonto ALANI yok"
 * karariyla ayni sekil) ve `is_correction` gibi bir bayrak YOKTUR: Stok'ta o
 * bayragi SISTEM koyuyordu (`recordCount` yolu), burada her satiri bir insan
 * yaziyor ve bayrak KULLANICININ KENDI HATASI HAKKINDAKI BEYANINA dayanirdi.
 * ⚠️ Durust bedeli: "bu bir duzeltmeydi" bilgisi yalnizca `note`ta yasar ve
 * SORGULANAMAZ.
 */
export class PointEntry {
  private constructor(private readonly state: PointEntryState) {}

  static create(input: {
    id: string;
    tenantId: string;
    accountId: string;
    createdByUserId: string;
    direction: string;
    points: number;
    note: string | null;
    occurredAt: Date;
    now: Date;
  }): PointEntry {
    const direction = normalizeDirection(input.direction);
    const points = normalizePoints(input.points);
    const note = normalizeNote(input.note);

    // ⚠️ GELECEGE YAZILAMAZ (§1.6). Kontrol BURADADIR, veritabaninda DEGIL:
    // `CHECK (occurred_at <= now())` yazilamaz cunku `now()` STABIL DEGILDIR ve
    // PostgreSQL kisitlarda IMMUTABLE ifade ister.
    //
    // ⚠️ Kiyas `now`a yapilir, `new Date()`e DEGIL: saat bir port'tan
    // (`Clock`) gelir, yoksa test edilemez bir kural olurdu.
    if (input.occurredAt.getTime() > input.now.getTime()) {
      throw new FutureEntryDateError();
    }

    return new PointEntry({
      id: input.id,
      tenantId: input.tenantId,
      accountId: input.accountId,
      direction,
      points,
      note,
      occurredAt: input.occurredAt,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
    });
  }

  static fromPersistence(state: PointEntryState): PointEntry {
    return new PointEntry(state);
  }

  /**
   * ⚠️ BAKIYEYE ETKI — turetmenin TEK tanimi burada ve SQL'de birden yazilidir.
   *
   * SQL tarafi (`BALANCE_SUM`) toplu okumalar icin zorunludur (N+1 olmasin
   * diye); bu metot ise TEK BIR SATIRIN etkisini soyler ve birim testlerinde
   * kullanilir. ⚠️ Ikisi ayrisirsa bakiye ekranda bir sey, veritabaninda baska
   * bir sey olur — bir entegrasyon testi (`loyalty-http`) ikisini AYNI VERIYLE
   * karsilastirir.
   */
  signedPoints(): number {
    return this.state.direction === 'earn' ? this.state.points : -this.state.points;
  }

  toState(): PointEntryState {
    return this.state;
  }
}

function normalizeDirection(value: string): PointDirection {
  const found = POINT_DIRECTIONS.find((direction) => direction === value);
  if (found === undefined) {
    throw new InvalidPointDirectionError(value);
  }
  return found;
}

function normalizePoints(value: number): number {
  // ⚠️ `Number.isSafeInteger`: `1.5` ve `NaN` kadar `1e21` de reddedilir.
  // Kesirli bir puan bir YUVARLAMA sorusu acardi (§1.5) ve o soru v2'nindir.
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidPointAmountError(value);
  }
  return value;
}

function normalizeNote(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const note = value.trim();
  // ⚠️ "girilmedi" ile "bos girildi" AYNI SEYDIR — veritabanindaki
  // `point_entries_note_not_blank` kisitiyla ayni karar.
  if (note === '') {
    return null;
  }
  if (note.length > MAX_POINT_ENTRY_NOTE_CHARS) {
    throw new PointEntryNoteTooLongError(note.length, MAX_POINT_ENTRY_NOTE_CHARS);
  }
  return note;
}
