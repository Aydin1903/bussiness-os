import { type TenantId } from './tenant-id.value-object';
import { type UserId } from '../../../shared/user-id.value-object';
import {
  BlankNoteTitleError,
  EmptyNoteBodyError,
  InvalidNoteTimestampError,
} from './knowledge.error';
import { type NoteId } from './note-id.value-object';

/**
 * Kurumsal hafizanin atomu (ADR-0029 §1).
 *
 * ============================================================================
 * BU ENTITY EMBEDDING BILMEZ
 * ============================================================================
 * Not, kullanicinin yazdigi metindir. Onun AI icin okunabilir hale getirilmis
 * bicimi (`NoteChunk`) AYRI bir entity ve AYRI bir yasam dongusudur: model
 * degisince chunk'lar yeniden uretilir, not degismez. ADR-0029 bu ayrimi hem
 * tabloda hem port sinirinda (`EmbeddingPort` / `LLMPort`) uyguluyor; burada da
 * uygulanir — `Note` icinde `embedding` diye bir alan YOKTUR.
 * ============================================================================
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez. `Tenant`/`User` ile ayni disiplin.
 *
 * `TenantId` bu modulun KENDI domain'indedir (tenant modulunden import EDILMEZ —
 * Mutlak Kural 6; bkz. o dosyanin yorumu). `authorUserId` icin `shared/`'daki
 * notr `UserId` kullanilir: kimlik globaldir ve kernel'de yasar (ADR-0014).
 */

export interface CreateNoteInput {
  readonly id: NoteId;
  readonly tenantId: TenantId;
  readonly authorUserId: UserId;
  /** OPSIYONEL (ADR-0029): kullanici hizlica bir dusunce birakabilmeli. */
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
}

/** Notun tam durumu — `fromPersistence()` sozlesmesi. */
export interface NoteState {
  readonly id: NoteId;
  readonly tenantId: TenantId;
  readonly authorUserId: UserId;
  readonly title: string | null;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Note {
  readonly id: NoteId;
  readonly tenantId: TenantId;
  readonly authorUserId: UserId;

  #title: string | null;
  #body: string;
  #createdAt: Date;
  #updatedAt: Date;

  /** Dogrulama YAPMAZ; yalnizca dogrulanmis degerleri atar. */
  private constructor(state: NoteState) {
    this.id = state.id;
    this.tenantId = state.tenantId;
    this.authorUserId = state.authorUserId;
    this.#title = state.title;
    this.#body = state.body;
    this.#createdAt = state.createdAt;
    this.#updatedAt = state.updatedAt;
  }

  /**
   * Yeni bir not olusturur — notu yaratmanin TEK yolu.
   *
   * `updatedAt = createdAt`: yeni bir not "hic guncellenmemis"tir. Not
   * guncelleme bu slice'ta YOKTUR (ADR-0030 "Bilinen sinirlar"); geldiginde
   * chunk'lari yeniden uretmek de gerekecek.
   */
  static create(input: CreateNoteInput): Note {
    assertValidDate(input.createdAt);

    const title = normalizeTitle(input.title);
    const body = input.body.trim();
    if (body === '') {
      throw new EmptyNoteBodyError();
    }

    return new Note({
      id: input.id,
      tenantId: input.tenantId,
      authorUserId: input.authorUserId,
      title,
      body,
      createdAt: copyDate(input.createdAt),
      updatedAt: copyDate(input.createdAt),
    });
  }

  /** Kalici kayittan yeniden kurar. */
  static fromPersistence(state: NoteState): Note {
    assertValidDate(state.createdAt);
    assertValidDate(state.updatedAt);

    return new Note({
      ...state,
      createdAt: copyDate(state.createdAt),
      updatedAt: copyDate(state.updatedAt),
    });
  }

  get title(): string | null {
    return this.#title;
  }

  get body(): string {
    return this.#body;
  }

  /** Date mutable oldugu icin kopya doner. */
  get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }
}

/**
 * Baslik: `null` gecerlidir (baslik yok), `''` DEGILDIR.
 *
 * Ikisini ayni saymak, "basligi yok" ile "basligi bos" arasindaki farki
 * kaybettirirdi — ve veritabani kisiti (`notes_title_not_blank`) zaten bos
 * basligi reddediyor. Sinirda yakalamak, hatayi SQL'e inmeden gorunur kilar.
 */
function normalizeTitle(title: string | null): string | null {
  if (title === null) {
    return null;
  }

  const trimmed = title.trim();
  if (trimmed === '') {
    throw new BlankNoteTitleError();
  }
  return trimmed;
}

/**
 * `new Date('gecersiz')` hata firlatmaz, `Invalid Date` uretir ve tum
 * karsilastirmalarda sessizce `false` doner. Sinirda yakalanmazsa veritabanina
 * `null` olarak dusen bir zaman degeri olusur.
 */
function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidNoteTimestampError('gecerli bir tarih degil');
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
