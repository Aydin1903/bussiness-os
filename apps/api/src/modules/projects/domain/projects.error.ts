/** Projeler domain hatalari (ADR-0033). */
export abstract class ProjectsDomainError extends Error {
  abstract readonly code: string;
}

export class BlankProjectNameError extends ProjectsDomainError {
  readonly code = 'PROJECT_NAME_BLANK';
  constructor() {
    super('Proje adi bos olamaz.');
  }
}

export class InvalidProjectStatusError extends ProjectsDomainError {
  readonly code = 'PROJECT_STATUS_INVALID';
  constructor(status: string) {
    super(`Gecersiz proje durumu: ${status}`);
  }
}

/**
 * Bitis tarihi baslangictan once.
 *
 * Yalnizca IKISI DE doluyken kontrol edilir: tek basina bir bitis tarihi
 * ("Cuma'ya kadar, ne zaman basladigi belirsiz") mesru bir durumdur.
 *
 * Veritabaninda da ayni kisit vardir (`0020`); burada yakalanmasi istemciye
 * 500 yerine anlamli bir 422 dondurur — `CurrencyRequiredError` ile ayni desen.
 */
export class ProjectDueBeforeStartError extends ProjectsDomainError {
  readonly code = 'PROJECT_DUE_BEFORE_START';
  constructor() {
    super('Bitis tarihi baslangic tarihinden once olamaz.');
  }
}

/**
 * Kayit bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS, baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner
 * ve buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini, `CompanyNotFound`
 * ile ayni gerekce).
 * ============================================================================
 */
export class ProjectNotFoundError extends ProjectsDomainError {
  readonly code = 'PROJECT_NOT_FOUND';
  constructor() {
    super('Proje bulunamadi.');
  }
}

export class InvalidProjectsTimestampError extends ProjectsDomainError {
  readonly code = 'PROJECTS_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}

export class BlankTaskTitleError extends ProjectsDomainError {
  readonly code = 'TASK_TITLE_BLANK';
  constructor() {
    super('Gorev basligi bos olamaz.');
  }
}

export class InvalidTaskStatusError extends ProjectsDomainError {
  readonly code = 'TASK_STATUS_INVALID';
  constructor(status: string) {
    super(`Gecersiz gorev durumu: ${status}`);
  }
}

/** `ProjectNotFoundError` ile ayni "yok mu senin degil mi" disiplini. */
export class TaskNotFoundError extends ProjectsDomainError {
  readonly code = 'TASK_NOT_FOUND';
  constructor() {
    super('Gorev bulunamadi.');
  }
}

/** Gorev, var olmayan (ya da gorunmeyen) bir projeye baglanamaz. */
export class TaskProjectNotFoundError extends ProjectsDomainError {
  readonly code = 'TASK_PROJECT_NOT_FOUND';
  constructor() {
    super('Gorevin baglanacagi proje bulunamadi.');
  }
}

/**
 * Atanan kisi bu tenant'in aktif uyesi degil (ADR-0033 §4).
 *
 * ============================================================================
 * MESAJ "KULLANICI YOK" ILE "UYE DEGIL"I AYIRT ETMEZ — bilincli
 * ============================================================================
 * Ayirmak, bir e-posta ya da id'nin sistemde KAYITLI OLDUGUNU sizdirirdi;
 * `CompanyNotFoundError`in "yok mu senin degil mi" disiplininin ayni
 * uygulamasi (P2). Cagiran icin iki durumun sonucu zaten aynidir: bu kisiye
 * gorev atanamaz.
 *
 * 404 DEGIL 422: istekteki KAYNAK (gorev) yok degil — govdedeki bir ALAN
 * gecersiz. `TaskProjectNotFoundError`den farki budur; orada gercekten
 * bulunamayan bir kaynak vardir.
 */
export class TaskAssigneeNotMemberError extends ProjectsDomainError {
  readonly code = 'TASK_ASSIGNEE_NOT_MEMBER';
  constructor() {
    super('Gorev yalnizca bu sirketin aktif bir uyesine atanabilir.');
  }
}

export class BlankProgressNoteBodyError extends ProjectsDomainError {
  readonly code = 'PROGRESS_NOTE_BODY_BLANK';
  constructor() {
    super('Ilerleme notu bos olamaz.');
  }
}

/** Not, var olmayan (ya da gorunmeyen) bir projeye baglanamaz. */
export class ProgressNoteProjectNotFoundError extends ProjectsDomainError {
  readonly code = 'PROGRESS_NOTE_PROJECT_NOT_FOUND';
  constructor() {
    super('Notun baglanacagi proje bulunamadi.');
  }
}

/**
 * Gorev bulunamadi YA DA baska bir projeye ait.
 *
 * ============================================================================
 * IKI DURUM AYIRT EDILMEZ — bilincli
 * ============================================================================
 * "Gorev yok" ile "gorev baska projede" ayri mesajlar dondurseydi, bir gorev
 * id'sinin tenant icinde VAR OLDUGU sizardi. Cagiran icin sonuc zaten aynidir:
 * bu notu o goreve baglayamaz.
 *
 * Kontrolun kendisi gerekli: olmasaydi A projesine ait bir not, B projesindeki
 * bir goreve baglanabilirdi ve iki proje birbirinin gecmisine sizardi.
 */
export class ProgressNoteTaskNotFoundError extends ProjectsDomainError {
  readonly code = 'PROGRESS_NOTE_TASK_NOT_FOUND';
  constructor() {
    super('Notun baglanacagi gorev bu projede bulunamadi.');
  }
}

/**
 * Embedding boyutu beklenenden farkli.
 *
 * `vector(1536)` kolonuyla birebir baglidir; saglayici/model degisirse bu hata
 * ONCE burada gorunur (`NoteChunk`/`InteractionChunk` ile ayni disiplin).
 */
export class InvalidEmbeddingDimensionsError extends ProjectsDomainError {
  readonly code = 'PROGRESS_NOTE_EMBEDDING_DIMENSIONS_INVALID';
  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}
