import { type Readable } from 'node:stream';

import { chunkText } from '../../../shared/chunking';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { buildStorageKey, type StoragePort } from '../../../shared/storage.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ContactDirectory } from '../../crm/crm.public';
import { type ProjectDirectory } from '../../projects/projects.public';
import { DOCUMENT_EMBEDDING_ACTION } from '../documents.rate-limits';
import {
  Document,
  DocumentChunk,
  requireSupportedMimeType,
  withDocumentHeader,
  type DocumentPatch,
  type DocumentState,
} from '../domain/document.entity';
import {
  DocumentContactNotFoundError,
  DocumentNotFoundError,
  DocumentProjectNotFoundError,
  DocumentTooLargeError,
  DocumentTooManyChunksError,
} from '../domain/documents.error';
import {
  type DocumentRepository,
  type DocumentRow,
  type DocumentWithChunkCount,
  type ListPage,
} from './document.repository.port';
import { type TextExtractorPort } from './text-extractor.port';

/** Anahtar duzenindeki `<module>` segmenti (ADR-0009). */
const STORAGE_MODULE = 'documents';

export interface DocumentDependencies {
  readonly repository: DocumentRepository;
  readonly storagePort: StoragePort;
  readonly textExtractor: TextExtractorPort;
  /**
   * CROSS-MODUL okuma yuzeyleri (ADR-0037 §4).
   *
   * ⚠️ IKISI DE PUBLIC INTERFACE'tir ve izin kapilari ONLARIN icindedir. Bu
   * modul `contact:read` / `project:read` kelimelerini BILMEZ.
   *
   * ⚠️ IKISI DE HAZIR GELDI: `ContactDirectory`yi Randevu (ADR-0035 §4),
   * `ProjectDirectory`yi Finans (ADR-0034 §4) yazdi. Bu modul YALNIZCA
   * TALIPTIR — `crm.public.ts` ve `projects.public.ts` tek satir degismedi.
   */
  readonly contactDirectory: ContactDirectory;
  readonly projectDirectory: ProjectDirectory;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** ⚠️ KUCUK kova: bir istek ONLARCA embedding uretebilir (§10). */
  readonly rateLimit: number;
  readonly reindexBatchSize: number;
  readonly maxFileBytes: number;
  /** ASIL maliyet freni (§6.1). */
  readonly maxChunks: number;
}

/** Yuklenen dosya — HTTP tasima bicimine bagimli DEGIL. */
export interface UploadedFile {
  readonly originalFilename: string;
  readonly bytes: Buffer;
}

export interface DocumentResult {
  readonly document: DocumentState;
  /** ⚠️ `0` MESRUDUR: taranmis PDF (§6.3). Arayuz bunu SOYLEMEK zorundadir. */
  readonly chunkCount: number;
}

/**
 * Belge yasam dongusu (ADR-0037).
 *
 * ============================================================================
 * ⚠️ PROJEDE ILK KEZ: IKI DOGRULUK KAYNAGI, ARALARINDA ATOMIKLIK YOK
 * ============================================================================
 * Bugune kadar her modulun tum durumu PostgreSQL'deydi ve bir transaction
 * hepsini kapsiyordu. Burada dosya R2'de, metadata veritabaninda. Aralarinda
 * ATOMIK ISLEM YOKTUR — soru "tutarsizlik olur mu" degil, HANGI tutarsizligin
 * olacagidir.
 *
 * **Karar: her zaman YETIM NESNE tarafinda kalinir; NESNESIZ KAYIT asla**
 * (ADR-0037 §5.3):
 *
 *     YUKLEME : dogrula -> metni cikar -> R2'ye YAZ -> DB satirini AC
 *     SILME   : DB satirini SIL       -> R2 nesnesini sil
 *
 * Gerekce simetrik degildir: yetim nesne GORUNMEZ bir maliyettir (fatura),
 * nesnesiz kayit ise GORUNUR bir bozukluktur — kullanici listede duran belgeye
 * tiklar, indiremez ve hata HER DENEMEDE tekrarlanir.
 *
 * ============================================================================
 * UC ASAMA, ARADA AG CAGRILARI (ADR-0029 §4 deseni — BESINCI kez)
 * ============================================================================
 *     T0  oran siniri sayaci        -> transaction (kendi basina, commit)
 *     --  MIME + boyut + cikarim    -> BELLEKTE, transaction YOK
 *     --  R2'ye yazma               -> AG · transaction YOK
 *     T1  belge kaydi               -> transaction
 *     --  embedding (N parca)       -> AG · transaction YOK
 *     T2  parcalar                  -> transaction
 *
 * Pahali bir ag cagrisi boyunca veritabani baglantisi TUTULMAZ.
 *
 * ⚠️ "PARCASIZ BELGE" MUMKUNDUR ve IKI SEBEBI VAR — ikisi de mesru:
 *   1. Metin cikarilamadi (taranmis PDF, §6.3) — kalici bir durum, `chunkCount:
 *      0` ile SOYLENIR,
 *   2. Embedding coktu — gecici, `POST /documents/reindex` onarir.
 * ⚠️ Veritabani ikisini AYIRT EDEMEZ (bkz. `UnindexedDocument`).
 */
export class DocumentUseCases {
  constructor(private readonly deps: DocumentDependencies) {}

  /**
   * Belge yukler (ADR-0037 §5.3, §6).
   *
   * ⚠️ SIRA BU METODUN EN ONEMLI OZELLIGIDIR ve yorumlar onu adim adim izler.
   */
  async create(input: {
    tenantId: string;
    userId: string;
    role: string;
    file: UploadedFile;
    label: string | null;
    crmContactId: string | null;
    projectId: string | null;
  }): Promise<DocumentResult> {
    // --- Dogrulama: HICBIR SEY YAZILMADAN ------------------------------------
    // ⚠️ MIME ICERIKTEN tespit edilir; uzantiya ve istemcinin gonderdigi
    // baslikga GUVENILMEZ (§6.1). Allowlist disiysa 415.
    const mimeType = requireSupportedMimeType(input.file.bytes);
    this.#assertSizeAllowed(input.file.bytes);

    // ⚠️ CROSS-MODUL kontroller transaction'in DISINDA ve ONCESINDE: dizinler
    // KENDI transaction'larini acar (ic ice transaction kismi commit riski
    // uretir — `AppointmentUseCases.create`in ayni karari).
    await this.#assertReferencesVisible(input.crmContactId, input.projectId, input.role);

    // --- T0: oran siniri -----------------------------------------------------
    // ⚠️ CIKARIMDAN ONCE: reddedilecek bir istek ne CPU ne para harcamali.
    //
    // ⚠️ RANDEVU'DAN FARK — burada pay KOSULSUZ odenir. Orada "notsuz randevu
    // hicbir sey harcamaz" diye kosullanmisti cunku not olup olmadigi ONCEDEN
    // BILINIYORDU. Burada bilinemez: bir PDF'in metin tasiyip tasimadigi ancak
    // CIKARIMDAN SONRA belli olur ve cikarimin kendisi de pahali bir istir
    // (20 MB'a kadar bellekte ayristirma). Taranmis bir PDF de pay oder —
    // durustce kaydediliyor, cunku alternatif payi cikarimdan SONRA odetmekti
    // ve o, sinirsiz cikarim yapilabilen bir yan kapi acardi.
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    // ⚠️ CIKARIM YUKLEMEDEN ONCE (§6.1): parca sinirini asan bir dosya R2'ye
    // HIC YAZILMAZ ve ortada temizlenecek bir yetim nesne kalmaz.
    const parts = await this.#extractParts({ bytes: input.file.bytes, mimeType });

    const id = this.deps.idGenerator.nextId();
    const storageKey = buildStorageKey({
      tenantId: input.tenantId,
      module: STORAGE_MODULE,
      resourceId: id,
      // ⚠️ HER YUKLEME YENI BIR ANAHTAR (§5.2) — ustune yazma YOK.
      uniqueSuffix: this.deps.idGenerator.nextId(),
      filename: input.file.originalFilename,
    });

    // --- R2: ONCE NESNE ------------------------------------------------------
    // Buradan sonra bir hata olursa geriye YETIM NESNE kalir — kabul edilen
    // taraf (§5.3).
    await this.deps.storagePort.put({
      key: storageKey,
      body: input.file.bytes,
      contentType: mimeType,
    });

    const document = Document.create({
      id,
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: {
        originalFilename: input.file.originalFilename,
        storageKey,
        mimeType,
        sizeBytes: input.file.bytes.length,
        label: input.label,
        crmContactId: input.crmContactId,
        projectId: input.projectId,
      },
      now: this.deps.clock.now(),
    });

    // --- T1: metadata --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(document),
    );

    const state = document.toState();

    // --- Ag + T2: parcalar ---------------------------------------------------
    const chunkCount = await this.#buildAndSaveChunks({ document: state, parts });

    return { document: state, chunkCount };
  }

  /**
   * Sayfali liste — adlar TEK TOPLU sorguyla cozulur (satir basina cagri N+1
   * olurdu).
   */
  async list(input: {
    limit: number;
    offset: number;
    label: string | null;
    crmContactId: string | null;
    projectId: string | null;
    role: string;
  }): Promise<ListPage<DocumentRow>> {
    // ⚠️ `role` AYRILIYOR ve porta GECMIYOR. Repository yetki BILMEZ, yalnizca
    // veri dondurur; rol yalnizca cross-modul dizinlerin izin kapilari icindir.
    const { role, ...query } = input;

    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(query),
    );

    return { items: await this.#withResolvedNames(page.items, role), total: page.total };
  }

  /** Tek kayit + cozulmus adlar + parca sayisi. */
  async getById(input: { id: string; role: string }): Promise<DocumentRow> {
    const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findRowById(input.id),
    );

    if (row === null) {
      throw new DocumentNotFoundError();
    }

    const [resolved] = await this.#withResolvedNames([row], input.role);

    if (resolved === undefined) {
      throw new DocumentNotFoundError();
    }

    return resolved;
  }

  /**
   * Dosyayi INDIRIR — akis olarak (ADR-0037 §5.4).
   *
   * ============================================================================
   * ⚠️ ANAHTAR VERITABANINDAN GELIR — ISTEMCIDEN ASLA
   * ============================================================================
   * Nesne deposunda RLS YOKTUR (§5.2). Tenant izolasyonunun oradaki tek mekanik
   * dayanagi anahtarin ONEKIDIR. Istemciden gelen bir anahtarla nesne okumak,
   * bir tenant'in digerinin anahtarini TAHMIN ederek okuyabilmesi demekti.
   *
   * Buradaki zincir bunu yapisal olarak imkansiz kilar: `findById` RLS altinda
   * calisir, yani baska tenant'in satiri zaten GORUNMEZ ve 404 doner.
   *
   * ⚠️ IMZALI URL URETILMEZ (§5.4): erisim karari ADR-0025'in policy
   * engine'inden cikip bir DIZEYE devredilirdi.
   */
  //
  // ⚠️ DONUS TIPI `Readable`, `NodeJS.ReadableStream` DEGIL: controller onu
  // `StreamableFile`a sarmalar ve o, Node'un `Readable`ini ISTER. Genis tip
  // yazildiginda derleme hatasi veriyordu — ve o hata IYI bir seydi, cunku
  // alternatifi bir tip zorlamasiyla susturmakti.
  async download(id: string): Promise<{ document: DocumentState; body: Readable }> {
    const document = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (document === null) {
      throw new DocumentNotFoundError();
    }

    const state = document.toState();
    const body = await this.deps.storagePort.get(state.storageKey);

    return { document: state, body };
  }

  /**
   * KISMI metadata guncellemesi — DOSYA DEGISMEZ (ADR-0037 §10).
   *
   * ============================================================================
   * ⚠️ ETIKET DEGISIRSE PARCALAR YENIDEN URETILIR — VE BU PAHALIDIR
   * ============================================================================
   * Etiket BAGLAM BASLIGININ PARCASIDIR (§8.1). Degistirilip parcalar oldugu
   * gibi birakilsaydi arama ESKI etiketi gormeye devam ederdi ve hata SESSIZ
   * olurdu.
   *
   * ⚠️ RANDEVU'DAN AYRISTIGI YER BURASI. Orada baslikta bagli KISI ADI vardi ve
   * o ad BASKA BIR MODULDE degisiyordu — Randevu degisimi GOREMEZ, bu yuzden
   * bayatlama kabul edilip telafisi `reindex`e birakildi. Burada etiket BU
   * MODULDE ve TAM BU ANDA degisiyor: gordugumuz bir degisimi gormezden gelmek,
   * telafi edilebilir bir bayatlama degil BILEREK URETILEN bir yanlis olurdu.
   *
   * Bedeli durustce: dosya R2'den YENIDEN INDIRILIR, metni yeniden cikarilir ve
   * TUM parcalar yeniden gomulur. Yani "yalnizca etiketi degistirdim" diyen bir
   * `PATCH`, en kotu durumda `maxChunks` kadar embedding cagrisi uretir ve
   * ORAN SINIRI PAYI ODER.
   *
   * ⚠️ Daha ucuz bir yol degerlendirildi ve REDDEDILDI: saklanan `content`ten
   * eski basligi dize islemiyle soyup yenisini yapistirmak. Reddin sebebi
   * kirilganliktir — baslik bicimi degistigi gun bu islem SESSIZCE yanlis metin
   * uretirdi, ve vektor zaten yeniden uretilmek zorunda (icerik degisiyor).
   *
   * ⚠️ Baglanti degisimi (`crmContactId` / `projectId`) parcalara DOKUNMAZ:
   * onlar baslikta YOKTUR (§8.1).
   */
  async update(input: {
    id: string;
    tenantId: string;
    userId: string;
    role: string;
    changes: DocumentPatch;
  }): Promise<DocumentResult> {
    // ⚠️ Cross-modul kontrol transaction'in DISINDA, ONCESINDE ve YALNIZCA
    // gonderilen alanlar icin. Mevcut (belki sarkan) bir isaretciyi her
    // guncellemede yeniden dogrulamak, silinmis bir kisiye bagli bir belgenin
    // ETIKETINI degistirmeyi imkansiz kilardi.
    await this.#assertReferencesVisible(
      input.changes.crmContactId === undefined ? null : input.changes.crmContactId,
      input.changes.projectId === undefined ? null : input.changes.projectId,
      input.role,
    );

    const before = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(input.id),
    );

    if (before === null) {
      throw new DocumentNotFoundError();
    }

    const updated = before.update(input.changes, this.deps.clock.now());
    const next = updated.toState();
    const labelChanged = next.label !== before.toState().label;

    // ⚠️ Pay YALNIZCA gercekten yeniden gomulecekse odenir (§10) — baglanti
    // degistiren bir `PATCH` hicbir sey harcamaz.
    if (labelChanged) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(updated),
    );

    if (!labelChanged) {
      const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
        this.deps.repository.findRowById(next.id),
      );
      return { document: next, chunkCount: row?.chunkCount ?? 0 };
    }

    const chunkCount = await this.#regenerateFromStorage(next);
    return { document: next, chunkCount };
  }

  /**
   * Dosyayi DEGISTIRIR — versiyon acmaz (ADR-0037 §7).
   *
   * Eski nesne SILINIR, parcalar TUMUYLE yeniden uretilir. Kismi guncelleme
   * YOKTUR.
   *
   * ⚠️ ESKI NESNENIN SILINMESI EN SONA BIRAKILIR ve HATASI YUTULUR — gerekce
   * `#deleteObjectBestEffort`te.
   */
  async replaceFile(input: {
    id: string;
    tenantId: string;
    userId: string;
    file: UploadedFile;
  }): Promise<DocumentResult> {
    const mimeType = requireSupportedMimeType(input.file.bytes);
    this.#assertSizeAllowed(input.file.bytes);

    const before = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(input.id),
    );

    if (before === null) {
      throw new DocumentNotFoundError();
    }

    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const parts = await this.#extractParts({ bytes: input.file.bytes, mimeType });

    const previous = before.toState();
    const storageKey = buildStorageKey({
      tenantId: previous.tenantId,
      module: STORAGE_MODULE,
      resourceId: previous.id,
      // ⚠️ YENI ANAHTAR — eskisinin uzerine YAZILMAZ (§5.2): uzerine yazmak,
      // kullanicinin yeni dosyayi yukleyip ESKISINI indirmesi demekti.
      uniqueSuffix: this.deps.idGenerator.nextId(),
      filename: input.file.originalFilename,
    });

    await this.deps.storagePort.put({
      key: storageKey,
      body: input.file.bytes,
      contentType: mimeType,
    });

    const updated = before.replaceFile(
      {
        originalFilename: input.file.originalFilename,
        storageKey,
        mimeType,
        sizeBytes: input.file.bytes.length,
      },
      this.deps.clock.now(),
    );

    // Metadata ve parca temizligi AYNI transaction'da: arada bir hata olursa
    // ortaya "yeni dosyayi isaret eden ama ESKI dosyanin parcalarini tasiyan"
    // bir kayit cikardi — arama bulunmayan bir icerigi bulurdu.
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.repository.save(updated);
      await this.deps.repository.deleteChunks(previous.id);
    });

    // ⚠️ ESKI NESNE ARTIK REFERANSSIZ — silinir. Basarisiz olursa yetim kalir
    // ve bu KABUL EDILEN taraftir.
    await this.#deleteObjectBestEffort(previous.storageKey);

    const next = updated.toState();
    const chunkCount = await this.#buildAndSaveChunks({ document: next, parts });

    return { document: next, chunkCount };
  }

  /**
   * SERT silme — DB satiri, parcalar (cascade) ve R2 nesnesi (ADR-0037 §5.3).
   *
   * ⚠️ SIRA: ONCE DB, SONRA R2. Ters sira "nesnesiz kayit" uretirdi — kullanici
   * listede duran belgeye tiklar, indiremez ve hata HER DENEMEDE tekrarlanir.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR (§1); `document:delete`in ayri
   * bir izin olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  async delete(id: string): Promise<void> {
    // Anahtar SILMEDEN ONCE okunmali: satir gidince onu ogrenmenin yolu kalmaz
    // ve nesne SONSUZA KADAR yetim olurdu (adresi hicbir yerde yazmaz).
    const document = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (document === null) {
      throw new DocumentNotFoundError();
    }

    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new DocumentNotFoundError();
    }

    await this.#deleteObjectBestEffort(document.toState().storageKey);
  }

  /**
   * Parcasiz belgeleri onarir (ADR-0037 §10).
   *
   * Is listesi TURETILMISTIR (`LEFT JOIN ... WHERE chunk IS NULL`); ayri bir
   * "onarilacaklar" tablosu ve deneme sayaci YOKTUR — altinci kez ayni karar.
   *
   * Oran siniri yazma yoluyla AYNI kovayi paylasir: ayri bir kova, onarimi
   * BUTCESIZ BIR YAN KAPIYA cevirirdi (ADR-0029'un gerekcesi, altinci kez) — ve
   * burada bu, oncekilerden DAHA onemli: tek cagri `reindexBatchSize` ×
   * `maxChunks` kadar embedding uretebilir.
   *
   * ⚠️ TARANMIS BELGELER HER SEFERINDE YENIDEN DENENIR ve `repaired` sayilir.
   * Veritabani "parcasi yok" ile "parcasi OLAMAZ" arasindaki farki bilemez
   * (bkz. `UnindexedDocument`); bir "denendi, metin yok" isareti tutmak ikinci
   * bir dogruluk kaynagi acardi. Bedeli bir CIKARIM maliyetidir — embedding
   * cagrisi uretmez (bos metin, sifir parca).
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
  }): Promise<{ repaired: number; failed: number }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her belge AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk dosya yuzunden onarilan her seyi
        // geri alirdi.
        await this.#regenerateFromStorage({
          id: item.documentId,
          tenantId: input.tenantId,
          storageKey: item.storageKey,
          originalFilename: item.originalFilename,
          label: item.label,
        });
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  // ==========================================================================
  // Yardimcilar
  // ==========================================================================

  /** ⚠️ 413 — sunucu BELLEGI siniri, R2 siniri degil (§6.1). */
  #assertSizeAllowed(bytes: Buffer): void {
    if (bytes.length > this.deps.maxFileBytes) {
      throw new DocumentTooLargeError(bytes.length, this.deps.maxFileBytes);
    }
  }

  /**
   * Metni cikarir, parcalar ve PARCA SINIRINI zorlar (§6.1).
   *
   * ⚠️ BOS SONUC MESRUDUR (§6.3): taranmis bir PDF'ten metin cikmaz ve bu bir
   * ariza degildir. Bos dizi doner; belge yine kaydedilir, yalnizca parcasi
   * olmaz ve `chunkCount: 0` acikca bildirilir.
   *
   * ⚠️ SESSIZ KIRPMA YASAK: sinir asilirsa ilk N parca alinip gerisi ATILMAZ,
   * istek REDDEDILIR (422).
   */
  async #extractParts(input: {
    bytes: Buffer;
    mimeType: Parameters<TextExtractorPort['extract']>[0]['mimeType'];
  }): Promise<string[]> {
    const text = await this.deps.textExtractor.extract(input);

    if (text.trim() === '') {
      return [];
    }

    const parts = chunkText(text);

    if (parts.length > this.deps.maxChunks) {
      throw new DocumentTooManyChunksError(parts.length, this.deps.maxChunks);
    }

    return parts;
  }

  /**
   * Parcalari gomer ve YAZAR (T2).
   *
   * Her parca BAGLAM BASLIGI alir (§8.1) — baslik gomulen metnin PARCASIDIR,
   * yalnizca gosterim degil.
   */
  async #buildAndSaveChunks(input: {
    document: Pick<DocumentState, 'id' | 'tenantId' | 'originalFilename' | 'label'>;
    parts: readonly string[];
  }): Promise<number> {
    if (input.parts.length === 0) {
      return 0;
    }

    const chunks: DocumentChunk[] = [];

    for (const [index, part] of input.parts.entries()) {
      const content = withDocumentHeader({
        originalFilename: input.document.originalFilename,
        label: input.document.label,
        content: part,
      });

      chunks.push(
        DocumentChunk.create({
          id: this.deps.idGenerator.nextId(),
          tenantId: input.document.tenantId,
          documentId: input.document.id,
          chunkIndex: index,
          content,
          embedding: await this.#embed(content),
        }),
      );
    }

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveChunks(chunks),
    );

    return chunks.length;
  }

  /**
   * Dosyayi R2'den indirip parcalari YENIDEN uretir.
   *
   * Uc yol bunu kullanir: etiket degisimi, `reindex` ve (dolayli olarak) dosya
   * degisimi. ⚠️ Mevcut parcalar ONCE silinir: `UNIQUE (tenant_id, document_id,
   * chunk_index)` kisiti (migration `0028`) aksi halde ikinci uretimi reddeder
   * — yani idempotentlik BEDAVA gelmiyor, ONCE TEMIZLEYEREK saglaniyor.
   */
  async #regenerateFromStorage(
    document: Pick<DocumentState, 'id' | 'tenantId' | 'storageKey' | 'originalFilename' | 'label'>,
  ): Promise<number> {
    const bytes = await this.#readObject(document.storageKey);
    const mimeType = requireSupportedMimeType(bytes);
    const parts = await this.#extractParts({ bytes, mimeType });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteChunks(document.id),
    );

    return this.#buildAndSaveChunks({ document, parts });
  }

  /** Akisi tampona toplar — cikarim dosyanin TAMAMINI ister. */
  async #readObject(key: string): Promise<Buffer> {
    const stream = await this.deps.storagePort.get(key);
    const parts: Buffer[] = [];

    for await (const part of stream) {
      parts.push(Buffer.isBuffer(part) ? part : Buffer.from(String(part)));
    }

    return Buffer.concat(parts);
  }

  /**
   * Nesneyi siler; HATASINI YUTAR — ve bu bilincli bir karardir.
   *
   * ============================================================================
   * ⚠️ NEDEN HATA YUZEYE CIKMIYOR
   * ============================================================================
   * Bu metot yalnizca DB tarafi ZATEN COMMIT OLDUKTAN sonra cagrilir (silme ve
   * dosya degisimi). Hatayi yukari birakmak, kullaniciya BASARILI OLMUS bir
   * islemin BASARISIZ oldugunu soylemek olurdu:
   *
   *   - silme: satir gitti, kullanici 502 gorur, tekrar dener ve 404 alir —
   *     ikinci kez, bu kez yanlis bir sebeple;
   *   - dosya degisimi: yeni dosya yerinde ve kayitli, ama kullanici
   *     basarisiz sandigi icin YENIDEN yukler ve IKINCI bir yetim uretir.
   *
   * Geriye kalan sey YETIM NESNEDIR — ADR-0037 §5.3'un acikca KABUL ETTIGI
   * taraf. Bedeli bir faturadir, bir bozukluk degil.
   *
   * ⚠️ v1'de yetim nesneleri toplayan bir sey YOKTUR (bilinen sinir). Cozum
   * retention karariyla (ROADMAP §8.5) AYNI GUN verilmelidir — o is satirla
   * birlikte NESNEYI DE silmek zorundadir.
   */
  async #deleteObjectBestEffort(key: string): Promise<void> {
    try {
      await this.deps.storagePort.delete(key);
    } catch {
      // Bilincli olarak yutuluyor (gerekce yukarida).
    }
  }

  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: DOCUMENT_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Verilen isaretciler cagiran icin GORUNUR mu (ADR-0037 §4).
   *
   * `null` gecerlidir ve kontrol edilmez: bir belge ne bir kisiye ne bir
   * projeye bagli olmak ZORUNDA degildir.
   *
   * ⚠️ IKI AYRI HATA TIPI — tek bir "bulunamadi" yerine. Iki referans
   * BAGIMSIZDIR ve ikisini birden gonderen bir istekte tek bir mesaj HANGI
   * alanin sorunlu oldugunu soylemezdi.
   *
   * ⚠️ Her birinde uc durum AYIRT EDILMEZ: kaynak yok, baska tenant'in, ya da
   * ilgili izin yok. Dizinler ucunu de haritada YOK olarak dondurur.
   */
  async #assertReferencesVisible(
    crmContactId: string | null,
    projectId: string | null,
    role: string,
  ): Promise<void> {
    if (crmContactId !== null) {
      const names = await this.deps.contactDirectory.findNames({ ids: [crmContactId], role });
      if (!names.has(crmContactId)) {
        throw new DocumentContactNotFoundError();
      }
    }

    if (projectId !== null) {
      const names = await this.deps.projectDirectory.findNames({ ids: [projectId], role });
      if (!names.has(projectId)) {
        throw new DocumentProjectNotFoundError();
      }
    }
  }

  /**
   * Satirlara kisi ve proje adini ekler — IKI toplu sorgu (her dizin icin bir).
   *
   * ⚠️ IZINSIZ CAGIRAN ICIN SORGU HIC ACILMAZ: dizinler kapiyi kendi iclerinde
   * uygular ve bos harita doner, yani her satir `null` alir. Belgelerin KENDISI
   * yine gorunur (`document:read` dort rolde de var) — gizlenen sey yalnizca
   * BASKA MODULLERE ait adlardir.
   */
  async #withResolvedNames(
    rows: readonly DocumentWithChunkCount[],
    role: string,
  ): Promise<DocumentRow[]> {
    const states = rows.map((row) => ({
      state: row.document.toState(),
      chunkCount: row.chunkCount,
    }));

    const contactIds = [
      ...new Set(
        states.flatMap(({ state }) => (state.crmContactId === null ? [] : [state.crmContactId])),
      ),
    ];
    const projectIds = [
      ...new Set(
        states.flatMap(({ state }) => (state.projectId === null ? [] : [state.projectId])),
      ),
    ];

    const [contactNames, projectNames] = await Promise.all([
      this.deps.contactDirectory.findNames({ ids: contactIds, role }),
      this.deps.projectDirectory.findNames({ ids: projectIds, role }),
    ]);

    return states.map(({ state, chunkCount }) => ({
      ...state,
      contactName:
        state.crmContactId === null ? null : (contactNames.get(state.crmContactId) ?? null),
      projectName: state.projectId === null ? null : (projectNames.get(state.projectId) ?? null),
      chunkCount,
    }));
  }
}
