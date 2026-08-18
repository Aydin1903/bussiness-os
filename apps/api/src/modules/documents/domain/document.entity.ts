import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import {
  InvalidDocumentEmbeddingDimensionsError,
  InvalidDocumentsTimestampError,
  UnsupportedDocumentTypeError,
} from './documents.error';

/**
 * ALLOWLIST — v1 yalnizca PDF ve DOCX kabul eder (ADR-0037 §6.1).
 *
 * ⚠️ Sozluk hem BURADA hem migration `0027`nin `documents_mime_type_allowed`
 * CHECK'inde yazilidir ve ikisi senkron kalmak zorundadir. Ayrim bilincli:
 * CHECK, uygulamayi ATLAYAN yollari baglar (`appointments_status_valid` ile
 * ayni karar, ikinci kez).
 */
export const PDF_MIME_TYPE = 'application/pdf';
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const SUPPORTED_MIME_TYPES = [PDF_MIME_TYPE, DOCX_MIME_TYPE] as const;

export type DocumentMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Dosya turunu ICERIKTEN tespit eder (ADR-0037 §6.1).
 *
 * ============================================================================
 * ⚠️ UZANTIYA VE `Content-Type` BASLIGINA GUVENILMEZ
 * ============================================================================
 * Ikisi de istemci tarafindan SERBESTCE yazilabilir. Bir ayristiriciya yanlis
 * turde bir govde vermek, ayristiricinin saldiri yuzeyini acmanin en kisa
 * yoludur — ve `sozlesme.pdf` adli bir dosyanin gercekte ne oldugunu yalnizca
 * ICERIGI soyler.
 *
 * ============================================================================
 * NASIL
 * ============================================================================
 * - **PDF**: `%PDF-` ile baslar (imza standardin kendisinde tanimli).
 * - **DOCX**: bir ZIP'tir (`PK\x03\x04`) — ama xlsx ve pptx de oyledir.
 *   Ayirt etmek icin ZIP'in ICINDEKI giris adlarina bakilir: DOCX'te
 *   `word/document.xml` girisi HER ZAMAN vardir ve ZIP bicimi dosya adlarini
 *   yerel baslikta SIKISTIRMADAN saklar, yani ham tamponda duz metin olarak
 *   aranabilir.
 *
 * ⚠️ Bu bir HEURISTIKTIR, tam bir ZIP ayristirmasi degil. Yanlis pozitif
 * ihtimali dusuk ve sonucu zararsizdir: `TextExtractorPort` dosyayi acamaz ve
 * cikarim BOS doner — yani §6.3'un zaten ele alinmis "metni okunamadi" durumu.
 * Yanlis negatif (gercek bir DOCX'in reddedilmesi) 415 uretir, yani SESSIZ
 * degildir.
 *
 * @returns taninan tur ya da `null` (allowlist disi).
 */
export function detectDocumentMimeType(bytes: Buffer): DocumentMimeType | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return PDF_MIME_TYPE;
  }

  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (isZip) {
    // Yalnizca bas taraf taranir: `word/document.xml` girisi DOCX'te merkezi
    // dizinden cok once, ilk yerel basliklarda gorunur. Tum dosyayi taramak 20
    // MB'lik bir tamponda gereksiz is olurdu.
    const head = bytes.subarray(0, Math.min(bytes.length, ZIP_SCAN_BYTES)).toString('latin1');
    if (head.includes('word/document.xml')) {
      return DOCX_MIME_TYPE;
    }
  }

  return null;
}

/** DOCX imzasi icin taranan bas kisim. */
const ZIP_SCAN_BYTES = 8192;

/**
 * Turu DOGRULAR ve daraltir; allowlist disiysa reddeder.
 *
 * ⚠️ Kontrol SINIRDA yapilir (use case), adapter'da DEGIL: adapter'in isi metni
 * cikarmaktir, kabul kurali bir IS KURALIDIR.
 */
export function requireSupportedMimeType(bytes: Buffer): DocumentMimeType {
  const detected = detectDocumentMimeType(bytes);

  if (detected === null) {
    throw new UnsupportedDocumentTypeError();
  }

  return detected;
}

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0037 §8.1).
 *
 * ```
 * [Belge · Ofis Kira Sozlesmesi 2026.pdf · sozlesme] ... parcanin metni ...
 * ```
 *
 * ============================================================================
 * ⚠️ BAGLI VARLIK ADI KONMAZ — ADR-0035 §6.1'DEN BILINCLI SAPMA
 * ============================================================================
 * Randevu, bagli CRM kisisinin ADINI basliga koymus ve bedelini (bayatlama)
 * `reindex` ile odemisti. Burada ayni sey YAPILMAZ cunku ADR-0033'un kurali IKI
 * bagli varlik oldugunda yon gosteriyor:
 *
 *     "ikinci bir denormalize ad ikinci bir bayatlama yuzeyi demektir"
 *     — basliga YALNIZCA BIR ad girer.
 *
 * Belgenin IKI opsiyonel baglantisi var (§4). Ikisini birden koymak kurali
 * dogrudan ihlal eder; BIRINI secmek KEYFIDIR. Ucuncu yol secildi: HICBIRI.
 *
 * Yerine konan `originalFilename` kaydin KENDI kolonudur, baska bir modulden
 * kopyalanmaz ve HICBIR ZAMAN bayatlamaz.
 *
 * ⚠️ BEDELI ACIKCA: "Ahmet'le olan sozlesmede ne yaziyordu" sorusu, ad dosya
 * adinda ya da etikette gecmiyorsa ESLESMEZ. Telafi kullanicinin elindedir
 * (dosyayi anlamli adlandirmak) — ve bu, bilinen bir sinir olarak kayitlidir.
 *
 * ⚠️ `reindex` YINE DE ILK GUNDEN VAR: etiket bu basligin PARCASIDIR ve
 * degistirilebilir; ayrica embedding cokmesi parcasiz belge birakir.
 */
export function withDocumentHeader(input: {
  originalFilename: string;
  /** `null` = etiketsiz; baslik onsuz kurulur. */
  label: string | null;
  content: string;
}): string {
  const tag = input.label === null ? '' : ` · ${input.label}`;

  return `[Belge · ${input.originalFilename}${tag}] ${input.content}`;
}

/**
 * Embedding boyutunu DOGRULAR.
 *
 * `DocumentChunk.create` bunu kullanir; kural bir IS KURALIDIR (`vector(1536)`
 * kolonuyla baglidir) ve adapter'a guvenmek yerine SINIRDA kontrol etmek,
 * yanlis yapilandirilmis bir modeli VERI YAZILMADAN yakalar.
 */
export function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new InvalidDocumentEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, embedding.length);
  }
}

/**
 * Saklanan bir dosyanin METADATA'si (ADR-0037 §1).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez.
 *
 * ============================================================================
 * ⚠️ DOSYANIN KENDISI BU ENTITY'DE DEGIL
 * ============================================================================
 * Entity yalnizca `storageKey` tasir. Byte'lar nesne deposundadir ve oraya
 * erisim `StoragePort` uzerindendir — `domain` katmani framework'suzdur ve bir
 * ag istemcisi TASIYAMAZ.
 *
 * ============================================================================
 * ⚠️ VERSIYON GECMISI YOK (ADR-0037 §7)
 * ============================================================================
 * Yeni bir dosya yuklendiginde `storageKey` DEGISIR, eski nesne SILINIR ve TUM
 * parcalar yeniden uretilir. Bu, `FinanceTransaction` ve `Appointment` icin
 * verilen ayni karardir: engellemek kullaniciyi
 * "Sozlesme_v2_SON_FINAL.pdf" adiyla ikinci bir belge acmaya, yani versiyon
 * karmasasini yazilimin DISINDA ve DAHA KOTU bir bicimde kurmaya iterdi.
 *
 * ⚠️ Bedeli: eski dosya GERI GETIRILEMEZ.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * Alti modulde ayni bilinen sinir.
 */
export interface DocumentFields {
  /** Kullaniciya GOSTERILEN ad; anahtarda temizlenmis hali durur. */
  readonly originalFilename: string;
  /** R2'deki nesnenin anahtari — ⚠️ istemciden ASLA alinmaz. */
  readonly storageKey: string;
  readonly mimeType: DocumentMimeType;
  readonly sizeBytes: number;

  /**
   * Kullanicinin kendi yazdigi SERBEST etiket (ADR-0037 §2).
   *
   * ⚠️ Sabit enum de tenant sozlugu de YOK. `null` ile bos dize AYNI SEYDIR ve
   * ikisi de `null`a normalize edilir: "girilmedi" ile "bos girildi" arasinda
   * bir fark yoktur.
   *
   * ⚠️ ETIKET BAGLAM BASLIGINA GIRER (§8.1), yani degistirilmesi parcalari
   * BAYATLATIR — use case bunu bilir ve etiket degisiminde yeniden uretir.
   */
  readonly label: string | null;

  /**
   * Cross-modul YUMUSAK referanslar — FK YOK, BIRBIRINDEN BAGIMSIZ (§4).
   *
   * ⚠️ VARLIK KONTROLU BURADA DEGIL: bir veritabani sorgusu gerektirir ve
   * `domain` katmani framework'suzdur. Kontrol use case'tedir.
   *
   * `null` MESRUDUR ve YAYGINDIR: bir sirket ana kira sozlesmesi ne bir kisiye
   * ne bir projeye aittir.
   */
  readonly crmContactId: string | null;
  readonly projectId: string | null;
}

/** KISMI guncelleme govdesi — yalnizca METADATA (dosya ayri uctan degisir). */
export type DocumentPatch = {
  readonly [K in keyof Pick<DocumentFields, 'label' | 'crmContactId' | 'projectId'>]?:
    DocumentFields[K] | undefined;
};

/** Dosya degisimi — dortlu birlikte degisir (§7). */
export interface DocumentFileReplacement {
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly mimeType: DocumentMimeType;
  readonly sizeBytes: number;
}

export interface DocumentState extends DocumentFields {
  readonly id: string;
  readonly tenantId: string;
  /** ⚠️ Yalnizca YUKLEYENI tutar; denetim izi DEGILDIR (§1). */
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Document {
  private constructor(private readonly state: DocumentState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: DocumentFields;
    now: Date;
  }): Document {
    return new Document({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: DocumentState): Document {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidDocumentsTimestampError();
    }
    return new Document(state);
  }

  /**
   * KISMI metadata guncellemesi; gonderilmeyen alana DOKUNULMAZ.
   *
   * ⚠️ `null` = TEMIZLE, `undefined` = DOKUNMA. `??` KULLANILMAZ: `null`
   * gonderen bir istek sessizce yok sayilirdi ve kullanici baglantiyi
   * kaldirdigini sanip kaldirmamis olurdu (`Appointment.update`in ayni karari).
   */
  update(changes: DocumentPatch, now: Date): Document {
    const current = this.state;

    const merged: DocumentFields = {
      originalFilename: current.originalFilename,
      storageKey: current.storageKey,
      mimeType: current.mimeType,
      sizeBytes: current.sizeBytes,
      label: changes.label === undefined ? current.label : changes.label,
      crmContactId:
        changes.crmContactId === undefined ? current.crmContactId : changes.crmContactId,
      projectId: changes.projectId === undefined ? current.projectId : changes.projectId,
    };

    return new Document({ ...current, ...normalize(merged), updatedAt: now });
  }

  /**
   * Dosyayi DEGISTIRIR (ADR-0037 §7) — versiyon acmaz, ustune yazar.
   *
   * ⚠️ `storageKey` HER ZAMAN YENIDIR (§5.2): ayni anahtarin uzerine yazmak,
   * nesne deposunun tutarlilik modeline ve araya giren onbelleklere guvenmek
   * demektir; kullanici yeni dosyayi yukler, ESKISINI indirir ve fark etmez.
   *
   * ⚠️ Eski anahtarin SILINMESI use case'in isidir; entity nesne deposunu
   * bilmez. Bu metot yalnizca "artik hangi nesneye isaret ediyorum" sorusunu
   * gunceller.
   */
  replaceFile(replacement: DocumentFileReplacement, now: Date): Document {
    return new Document({
      ...this.state,
      originalFilename: replacement.originalFilename,
      storageKey: replacement.storageKey,
      mimeType: replacement.mimeType,
      sizeBytes: replacement.sizeBytes,
      updatedAt: now,
    });
  }

  toState(): DocumentState {
    return this.state;
  }
}

/**
 * Belgenin AI icin okunabilir PARCASI (ADR-0037 §3).
 *
 * ⚠️ CHUNK ENTITY GERI DONDU: Randevu'da (ADR-0035 §3) boyle bir tip YOKTU
 * cunku vektor satirin kendi kolonundaydi. Burada `NoteChunk` /
 * `CommentaryChunk` deseni BESINCI kez uygulaniyor.
 */
export interface DocumentChunkState {
  readonly id: string;
  readonly tenantId: string;
  readonly documentId: string;
  readonly chunkIndex: number;
  /** BAGLAM BASLIGI DAHIL gomulen metin (§8.1). */
  readonly content: string;
  readonly embedding: readonly number[];
}

export class DocumentChunk {
  private constructor(private readonly state: DocumentChunkState) {}

  static create(input: DocumentChunkState): DocumentChunk {
    // Boyut kontrolu BURADA yapilir, adapter'da degil: adapter'in isi
    // tasimaktir, boyut bir DOMAIN kuralidir ve `vector(1536)` kolonuyla
    // birebir baglidir.
    assertEmbeddingDimensions(input.embedding);
    return new DocumentChunk(input);
  }

  toState(): DocumentChunkState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: DocumentFields): DocumentFields {
  return {
    originalFilename: fields.originalFilename.trim(),
    storageKey: fields.storageKey,
    mimeType: fields.mimeType,
    sizeBytes: fields.sizeBytes,
    label: blankToNull(fields.label),
    // ⚠️ BURADA DOGRULANMAZ: gorunurluk kontrolu bir veritabani sorgusu
    // gerektirir ve `domain` katmani framework'suzdur. Kontrol use case'tedir
    // (`#assertReferencesVisible`).
    crmContactId: fields.crmContactId,
    projectId: fields.projectId,
  };
}

/** Bos dizeler `null`a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
