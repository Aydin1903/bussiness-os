import { normalizeCurrency } from './document-money';
import {
  BlankCustomerNameError,
  DateBeforeIssueDateError,
  DocumentNotEditableError,
  DocumentNotesTooLongError,
  InvalidDocumentDateError,
  InvalidStatusTransitionError,
  InvoicingTimestampError,
} from './invoicing.error';

/**
 * Belge turu — TEK TABLO, IKI TUR (ADR-0041 §1.1).
 *
 * ⚠️ Emsal ADR-0034 §5'tir (`finance.transactions` + `direction`) ve risk
 * oradakinden ZAYIFTIR: `direction` unutulursa SESSIZ ve makul gorunen yanlis
 * bir SAYI cikar; `kind` unutulursa yanlis listede satir gorunur ve ekranda
 * DERHAL goze carpar.
 */
export type SalesDocumentKind = 'quote' | 'invoice';

/** Teklif durumlari (§1.2). */
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

/** Fatura durumlari (§1.2). */
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';

export type SalesDocumentStatus = QuoteStatus | InvoiceStatus;

/** Belge notunun SERT karakter siniri — bir GIRDI kurali. */
export const MAX_DOCUMENT_NOTES_CHARS = 2000;

/**
 * ⚠️ GECERLI DURUM KUMESI `kind`'A BAGLIDIR ve bu, TEK TABLO karariniin
 * bedelini odeyen yerdir. Ayni kisit VERITABANINDA da vardir
 * (`sales_documents_status_valid`), yani uygulamayi ATLAYAN her yol da baglanir.
 */
const STATUSES: Readonly<Record<SalesDocumentKind, readonly SalesDocumentStatus[]>> = {
  quote: ['draft', 'sent', 'accepted', 'rejected'],
  invoice: ['draft', 'issued', 'cancelled'],
};

/**
 * ⚠️ GERI DONUS YOKTUR (§1.2).
 *
 * `sent` bir teklif `draft`a, `issued` bir fatura `draft`a DONMEZ: bu gecisler
 * belgenin DISARI CIKTIGI andir ve geri almak, musteride duran bir kagidi yok
 * saymaktir. Yanlissa cozum `rejected`/`cancelled` + YENI BELGEDIR.
 */
const TRANSITIONS: Readonly<Record<SalesDocumentStatus, readonly SalesDocumentStatus[]>> = {
  draft: ['sent', 'issued'],
  sent: ['accepted', 'rejected'],
  issued: ['cancelled'],
  accepted: [],
  rejected: [],
  cancelled: [],
};

export interface SalesDocumentFields {
  /**
   * ⚠️ BELGEYE BASILAN AD — dizinden okunan "bugunku ad" DEGIL (§1.5).
   *
   * Projede bes kez "ad denormalize edilmez" karari verildi; burada KOLONDA
   * saklaniyor ve gerekce kuralin kapsaminin dogru okunmasidir:
   * denormalizasyon yasagi TURETILEBILIR bilgi icindir, gonderilmis bir
   * belgedeki ad ise O AN DONDURULMUSTUR.
   */
  readonly customerName: string;
  /** ⚠️ CIPLAK `uuid`, FK YOK. `null` mesrudur: CRM'de kayitli olmayan musteri. */
  readonly companyId: string | null;
  readonly contactId: string | null;
  readonly issuedOn: string;
  /** ⚠️ YALNIZCA teklif. */
  readonly validUntil: string | null;
  /** ⚠️ YALNIZCA fatura. */
  readonly dueOn: string | null;
  /** ⚠️ BELGE BASINA TEK (§1.4). */
  readonly currency: string;
  /** ⚠️ EMBED EDILMEZ (§5): cogunlukla MATBU kosul metni. */
  readonly notes: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<...>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip "alan YOK"
 * der, "alan var ama `undefined`" DEMEZ. Ayrim anlamlidir: `undefined` =
 * dokunma, `null` = temizle.
 */
export type SalesDocumentPatch = {
  readonly [K in keyof SalesDocumentFields]?: SalesDocumentFields[K] | undefined;
};

export interface SalesDocumentState extends SalesDocumentFields {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: SalesDocumentKind;
  readonly status: SalesDocumentStatus;
  /** ⚠️ TASLAKTA `null` (§1.6): numara belge DISARI CIKTIGI an uretilir. */
  readonly number: string | null;
  /** ⚠️ Ok FATURA -> TEKLIF (§3). Teklifte DAIMA `null`. */
  readonly convertedFromId: string | null;
  readonly createdByUserId: string;
  /**
   * ⚠️ AKTOR DAMGALARI — BIR DENETIM IZI DEGILDIR (§8.2).
   *
   * `platform/audit` bu iste ACILMADI. Sorunun buyuk kismi §2 ile ortadan
   * kalkiyor: gonderilmis belgenin tutari DEGISMEZ, yani "kim degistirdi" diye
   * bir soru YOKTUR — olay OLMAZ. Geriye kalan DURUM GECISLERIDIR ve cevabi
   * bu dort alandir.
   *
   * ⚠️ Bir OLAY GUNLUGU DEGIL: bir olay gunlugu "ne oldu"yu SIRASIYLA anlatir,
   * damga yalnizca SON DURUMU soyler. Taslak duzenlemeleri IZLENMEZ.
   */
  readonly sentAt: Date | null;
  readonly sentByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly decidedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Teklif / fatura taslagi (ADR-0041 §1, §2, §3).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez.
 *
 * ============================================================================
 * ⚠️ SATIRLAR BU ENTITY'DE TASINMAZ
 * ============================================================================
 * Bu bir "aggregate root + cocuklar" kurulumu DEGILDIR ve bu bilinclidir: bir
 * belgenin satirlari, listeleme yollarinda HIC OKUNMAZ (liste ekrani yalnizca
 * baslik gosterir) ve onlari entity'ye baglamak her okumada bir `JOIN`
 * zorunlulugu dogururdu.
 *
 * Baglayici olan sey `assertEditable()`tir: satir YAZAN HER YOL once onu cagirir
 * — ve VERITABANI trigger'i o cagriyi unutan bir yolu da yakalar (§2, ucuncu
 * katman).
 */
export class SalesDocument {
  private constructor(private readonly state: SalesDocumentState) {}

  static create(input: {
    id: string;
    tenantId: string;
    kind: SalesDocumentKind;
    createdByUserId: string;
    convertedFromId: string | null;
    fields: SalesDocumentFields;
    now: Date;
  }): SalesDocument {
    return new SalesDocument({
      id: input.id,
      tenantId: input.tenantId,
      kind: input.kind,
      // ⚠️ Her belge `draft` DOGAR. "Dogrudan gonderilmis olarak olustur" diye
      // bir yol YOKTUR: gonderim bir EYLEMDIR ve aktorunu damgalar (§8.2).
      status: 'draft',
      number: null,
      convertedFromId: input.convertedFromId,
      createdByUserId: input.createdByUserId,
      sentAt: null,
      sentByUserId: null,
      decidedAt: null,
      decidedByUserId: null,
      ...normalize(input.kind, input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(state: SalesDocumentState): SalesDocument {
    if (state.updatedAt < state.createdAt) {
      throw new InvoicingTimestampError();
    }
    return new SalesDocument(state);
  }

  get id(): string {
    return this.state.id;
  }

  get kind(): SalesDocumentKind {
    return this.state.kind;
  }

  get status(): SalesDocumentStatus {
    return this.state.status;
  }

  get currency(): string {
    return this.state.currency;
  }

  /**
   * ⚠️ KORUMANIN BIRINCI KATMANI (§2).
   *
   * Baslik VE kalem yazan her yol once buradan gecer. Ucuncu katman
   * (`sales_document_lines_immutable_after_send` trigger'i) bu cagriyi unutan
   * bir yolu da yakalar — cunku kalemler AYRI BIR TABLODADIR ve baslik
   * uzerindeki bir kontrol onlari KAPSAMAZ.
   */
  assertEditable(): void {
    if (this.state.status !== 'draft') {
      throw new DocumentNotEditableError(this.state.status);
    }
  }

  /**
   * KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil).
   *
   * @throws {DocumentNotEditableError} Belge `draft` degilse.
   */
  update(changes: SalesDocumentPatch, now: Date): SalesDocument {
    this.assertEditable();

    const current = this.state;
    const merged: SalesDocumentFields = {
      customerName: changes.customerName ?? current.customerName,
      // ⚠️ `??` DEGIL: `null` = TEMIZLE ve mesrudur. `changes.x ?? current.x`
      // yazilsaydi `null` gonderen bir istek SESSIZCE yok sayilirdi.
      companyId: pick(changes.companyId, current.companyId),
      contactId: pick(changes.contactId, current.contactId),
      issuedOn: changes.issuedOn ?? current.issuedOn,
      validUntil: pick(changes.validUntil, current.validUntil),
      dueOn: pick(changes.dueOn, current.dueOn),
      currency: changes.currency ?? current.currency,
      notes: pick(changes.notes, current.notes),
    };

    return new SalesDocument({
      ...current,
      ...normalize(current.kind, merged),
      updatedAt: now,
    });
  }

  /**
   * Belgeyi DISARI CIKARIR: teklif `sent`, fatura `issued`.
   *
   * ⚠️ `sent` SISTEMIN BIR EYLEMI DEGIL, KULLANICININ BEYANIDIR (§1.2): bu
   * modul e-posta ATMAZ. Durum, _"bu belgeyi musteriye ilettim"_ demektir.
   *
   * @param number Sunucunun urettigi belge numarasi (§1.6).
   */
  release(input: { number: string; userId: string; now: Date }): SalesDocument {
    const target: SalesDocumentStatus = this.state.kind === 'quote' ? 'sent' : 'issued';
    this.#assertTransition(target);

    return new SalesDocument({
      ...this.state,
      status: target,
      number: input.number,
      sentAt: input.now,
      sentByUserId: input.userId,
      updatedAt: input.now,
    });
  }

  /**
   * Teklifin sonucunu isaretler: `accepted` | `rejected`.
   *
   * ⚠️ Aktoru DAMGALAR (§8.2): "kabul edildi"yi kimin, ne zaman isaretledigi
   * satirin uzerinde durur.
   */
  decide(input: { outcome: 'accepted' | 'rejected'; userId: string; now: Date }): SalesDocument {
    this.#assertTransition(input.outcome);

    return new SalesDocument({
      ...this.state,
      status: input.outcome,
      decidedAt: input.now,
      decidedByUserId: input.userId,
      updatedAt: input.now,
    });
  }

  /**
   * Kesilmis faturayi iptal eder.
   *
   * ⚠️ SATIR DURUR, SILINMEZ — numarasi da durur (§1.6): bosluk GORUNUR,
   * tekrar GORUNMEZ.
   */
  cancel(input: { userId: string; now: Date }): SalesDocument {
    this.#assertTransition('cancelled');

    return new SalesDocument({
      ...this.state,
      status: 'cancelled',
      decidedAt: input.now,
      decidedByUserId: input.userId,
      updatedAt: input.now,
    });
  }

  toState(): SalesDocumentState {
    return this.state;
  }

  #assertTransition(target: SalesDocumentStatus): void {
    const allowed = TRANSITIONS[this.state.status];

    // ⚠️ IKI KOSUL: gecis izinli olmali VE hedef bu TURUN durum kumesinde
    // bulunmali. Ikincisi olmadan bir teklif `issued` olabilirdi — `draft`in
    // izinli hedefleri iki tur icin ORTAK yazildi (`sent` ve `issued`).
    if (!allowed.includes(target) || !STATUSES[this.state.kind].includes(target)) {
      throw new InvalidStatusTransitionError(this.state.status, target);
    }
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(kind: SalesDocumentKind, fields: SalesDocumentFields): SalesDocumentFields {
  const customerName = fields.customerName.trim();
  if (customerName === '') {
    throw new BlankCustomerNameError();
  }

  const issuedOn = assertCalendarDay(fields.issuedOn);

  // ⚠️ TUR-BAGIMLI ALANLAR BURADA TEMIZLENIR, reddedilmez: bir faturaya
  // `validUntil` gonderen istemci bir HATA yapmistir ama istegin geri kalani
  // gecerlidir. Veritabani kisiti (`sales_documents_quote_only_fields`) ayni
  // kurali ZORLAR — burada sessizce dusurmek, o kisitin 500 uretmesini onler.
  const validUntil = kind === 'quote' ? optionalDay(fields.validUntil) : null;
  const dueOn = kind === 'invoice' ? optionalDay(fields.dueOn) : null;

  if (validUntil !== null && validUntil < issuedOn) {
    throw new DateBeforeIssueDateError('Gecerlilik tarihi');
  }

  if (dueOn !== null && dueOn < issuedOn) {
    throw new DateBeforeIssueDateError('Vade tarihi');
  }

  const notes = fields.notes?.trim() ?? '';
  if (notes.length > MAX_DOCUMENT_NOTES_CHARS) {
    throw new DocumentNotesTooLongError(notes.length, MAX_DOCUMENT_NOTES_CHARS);
  }

  return {
    customerName,
    companyId: fields.companyId,
    contactId: fields.contactId,
    issuedOn,
    validUntil,
    dueOn,
    currency: normalizeCurrency(fields.currency),
    notes: notes === '' ? null : notes,
  };
}

/**
 * `YYYY-MM-DD` kalibini VE gercek bir takvim gunu OLDUGUNU dogrular.
 *
 * ⚠️ Zod yalnizca KALIBI dogrular; `2026-02-31` o kalibi GECER. Kontrol
 * edilmeseydi deger veritabanina kadar gider ve kullanici 422 yerine 500
 * alirdi (`assertCalendarDay`in projede DORDUNCU uygulamasi).
 */
function assertCalendarDay(value: string): string {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new InvalidDocumentDateError(value);
  }

  // `Date.UTC` ile geri okumak, `2026-02-31` gibi TASAN tarihleri yakalar:
  // JS onu 3 Mart'a tasir ve dize ARTIK ESLESMEZ.
  const [year = 0, month = 0, day = 0] = trimmed.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new InvalidDocumentDateError(value);
  }

  return trimmed;
}

function optionalDay(value: string | null): string | null {
  return value === null ? null : assertCalendarDay(value);
}

/** `undefined` = dokunma, `null` = temizle. */
function pick<T>(change: T | null | undefined, current: T | null): T | null {
  return change === undefined ? current : change;
}
