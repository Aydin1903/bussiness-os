/**
 * Knowledge modulunun domain hatalari.
 *
 * ARCHITECTURE 4: domain katmani framework bilmez — burada HTTP durum kodu,
 * NestJS exception'i veya RFC 7807 govdesi YOKTUR. Ceviriyi presentation
 * katmani yapar (`tenant.error.ts` / `identity.error.ts` ile ayni desen).
 */
export abstract class KnowledgeDomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    // new.target: alt sinifin adi. Aksi halde tum hatalar "Error" olarak
    // loglanir ve stack trace'te ayirt edilemez.
    this.name = new.target.name;
  }
}

export class InvalidNoteIdError extends KnowledgeDomainError {
  readonly code = 'NOTE_ID_INVALID';

  constructor(value: string) {
    super(`Not id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidNoteChunkIdError extends KnowledgeDomainError {
  readonly code = 'NOTE_CHUNK_ID_INVALID';

  constructor(value: string) {
    super(`Not parcasi id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

/** Not govdesi bos veya yalnizca bosluk. */
export class EmptyNoteBodyError extends KnowledgeDomainError {
  readonly code = 'NOTE_BODY_EMPTY';

  constructor() {
    super('Not govdesi bos olamaz.');
  }
}

/**
 * Not basligi VERILDI ama bos.
 *
 * `null` (baslik yok) ile `''` (baslik var ama bos) FARKLIDIR: ilki gecerli
 * (ADR-0029 basligi opsiyonel yapar), ikincisi bir cagiran hatasidir.
 */
export class BlankNoteTitleError extends KnowledgeDomainError {
  readonly code = 'NOTE_TITLE_BLANK';

  constructor() {
    super('Not basligi verildiyse bos olamaz; baslik istemiyorsaniz null gecin.');
  }
}

export class InvalidNoteTimestampError extends KnowledgeDomainError {
  readonly code = 'NOTE_TIMESTAMP_INVALID';

  constructor(reason: string) {
    super(`Not zaman damgasi gecersiz: ${reason}`);
  }
}

/** Chunk sirasi negatif — bozuk bir bolme sonucu. */
export class InvalidChunkIndexError extends KnowledgeDomainError {
  readonly code = 'CHUNK_INDEX_INVALID';

  constructor(value: number) {
    super(`Parca sirasi negatif olamaz: ${String(value)}`);
  }
}

export class EmptyChunkContentError extends KnowledgeDomainError {
  readonly code = 'CHUNK_CONTENT_EMPTY';

  constructor() {
    super('Parca icerigi bos olamaz.');
  }
}

/**
 * Embedding vektoru beklenen boyutta degil.
 *
 * `note_chunks.embedding` kolonu `vector(1536)` olarak TANIMLIDIR (migration
 * 0011); yanlis boyut veritabaninda da reddedilir. Burada YAKALAMAK, hatayi
 * SQL katmanina inmeden ve hangi chunk'ta oldugu belliyken gorunur kilar.
 */
export class InvalidEmbeddingDimensionsError extends KnowledgeDomainError {
  readonly code = 'EMBEDDING_DIMENSIONS_INVALID';

  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}
