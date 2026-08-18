import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { StorageFailedError, type StoragePort } from '../../../shared/storage.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ContactDirectory } from '../../crm/crm.public';
import { type ProjectDirectory } from '../../projects/projects.public';
import { Document, PDF_MIME_TYPE, type DocumentFields } from '../domain/document.entity';
import {
  DocumentContactNotFoundError,
  DocumentNotFoundError,
  DocumentProjectNotFoundError,
  DocumentTooLargeError,
  DocumentTooManyChunksError,
  UnsupportedDocumentTypeError,
} from '../domain/documents.error';
import { type DocumentRepository } from './document.repository.port';
import { DocumentUseCases } from './document.use-cases';
import { type TextExtractorPort } from './text-extractor.port';

/**
 * `DocumentUseCases` (ADR-0037).
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN ODAGI "SIRA"DIR — CRUD DEGIL
 * ============================================================================
 * CRUD'un kendisi bes onceki modulde kanitlandi. Bu modulde GERCEKTEN YENI olan
 * sey, PROJEDE ILK KEZ IKI DOGRULUK KAYNAGININ (PostgreSQL + nesne deposu)
 * aralarinda ATOMIKLIK OLMADAN kullanilmasidir. ADR-0037 §5.3 hangi
 * tutarsizligin kabul edildigini yaziyor:
 *
 *     her zaman YETIM NESNE tarafinda kalinir; NESNESIZ KAYIT asla.
 *
 * Asagidaki testlerin cogu tam olarak o cumleyi kilitler — ve hicbiri
 * entegrasyon testinden uretilemez, cunku hata yollari gercek bir R2/MinIO
 * kurulumunda KASTEN bozulmayi gerektirirdi.
 */

const NOW = new Date('2026-08-18T09:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const CONTACT = '018f3a2b-7c4d-7e1f-9c4d-0000000000e1';
const PROJECT = '018f3a2b-7c4d-7e1f-9c4d-0000000000f1';
const RATE_LIMIT = 5;
const VECTOR = Array.from({ length: 1536 }, () => 0.1);

const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\n', 'latin1');
const NOT_A_DOCUMENT = Buffer.from('duz metin, PDF degil', 'utf8');

const clock: Clock = { now: () => NOW };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function fields(overrides: Partial<DocumentFields> = {}): DocumentFields {
  return {
    originalFilename: 'Kira Sozlesmesi.pdf',
    storageKey: `tenants/${TENANT}/documents/${ID}/eski-Kira-Sozlesmesi.pdf`,
    mimeType: PDF_MIME_TYPE,
    sizeBytes: PDF_BYTES.length,
    label: null,
    crmContactId: null,
    projectId: null,
    ...overrides,
  };
}

function existing(overrides: Partial<DocumentFields> = {}): Document {
  return Document.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

function build(
  overrides: {
    found?: Document | null;
    /** Cikarilacak metin; bos dize = TARANMIS belge (§6.3). */
    extracted?: string;
    extractFails?: boolean;
    contactNames?: ReadonlyMap<string, string>;
    projectNames?: ReadonlyMap<string, string>;
    rateLimitCount?: number;
    putFails?: boolean;
    deleteObjectFails?: boolean;
    getFails?: boolean;
    maxChunks?: number;
    maxFileBytes?: number;
    deleted?: number;
    unindexed?: {
      documentId: string;
      storageKey: string;
      originalFilename: string;
      label: string | null;
      mimeType: string;
    }[];
  } = {},
) {
  /** Cagri SIRASINI kaydeder — bu dosyanin asil olcum araci. */
  const calls: string[] = [];

  const save = vi.fn<DocumentRepository['save']>().mockImplementation(() => {
    calls.push('db:save');
    return Promise.resolve();
  });
  const findById = vi
    .fn<DocumentRepository['findById']>()
    .mockResolvedValue(overrides.found === undefined ? existing() : overrides.found);
  const findRowById = vi.fn<DocumentRepository['findRowById']>().mockResolvedValue({
    document: existing(),
    chunkCount: 2,
  });
  const deleteById = vi.fn<DocumentRepository['deleteById']>().mockImplementation(() => {
    calls.push('db:delete');
    return Promise.resolve(overrides.deleted ?? 1);
  });
  const deleteChunks = vi.fn<DocumentRepository['deleteChunks']>().mockImplementation(() => {
    calls.push('db:deleteChunks');
    return Promise.resolve();
  });
  const saveChunks = vi.fn<DocumentRepository['saveChunks']>().mockImplementation(() => {
    calls.push('db:saveChunks');
    return Promise.resolve();
  });
  const list = vi
    .fn<DocumentRepository['list']>()
    .mockResolvedValue({ items: [{ document: existing(), chunkCount: 1 }], total: 1 });
  const findUnindexed = vi
    .fn<DocumentRepository['findUnindexed']>()
    .mockResolvedValue(overrides.unindexed ?? []);
  const findSimilarChunks = vi.fn<DocumentRepository['findSimilarChunks']>().mockResolvedValue([]);

  const put = vi.fn<StoragePort['put']>().mockImplementation(() => {
    calls.push('r2:put');
    return overrides.putFails === true
      ? Promise.reject(new StorageFailedError('put cokti'))
      : Promise.resolve();
  });
  const deleteObject = vi.fn<StoragePort['delete']>().mockImplementation(() => {
    calls.push('r2:delete');
    return overrides.deleteObjectFails === true
      ? Promise.reject(new StorageFailedError('delete cokti'))
      : Promise.resolve();
  });
  const get = vi.fn<StoragePort['get']>().mockImplementation(() => {
    calls.push('r2:get');
    return overrides.getFails === true
      ? Promise.reject(new StorageFailedError('nesne bulunamadi'))
      : Promise.resolve(Readable.from(PDF_BYTES));
  });

  const extract = vi.fn<TextExtractorPort['extract']>().mockImplementation(() => {
    calls.push('extract');
    return overrides.extractFails === true
      ? Promise.reject(new Error('bozuk dosya'))
      : Promise.resolve(overrides.extracted ?? 'Fesih bildirimi otuz gun oncesinden yapilir.');
  });

  const embed = vi.fn<EmbeddingPort['embed']>().mockResolvedValue(VECTOR);

  const findContactNames = vi
    .fn<ContactDirectory['findNames']>()
    .mockResolvedValue(overrides.contactNames ?? new Map([[CONTACT, 'Ahmet Yilmaz']]));
  const findProjectNames = vi
    .fn<ProjectDirectory['findNames']>()
    .mockResolvedValue(overrides.projectNames ?? new Map([[PROJECT, 'Ofis Tasima']]));

  const registerRequest = vi
    .fn<RateLimitRepository['registerRequest']>()
    .mockResolvedValue(overrides.rateLimitCount ?? 1);

  let sequence = 0;
  const idGenerator: IdGenerator = {
    nextId: () => {
      sequence += 1;
      return `${ID.slice(0, -1)}${String(sequence)}`;
    },
  };

  const useCases = new DocumentUseCases({
    repository: {
      save,
      findById,
      findRowById,
      list,
      deleteById,
      deleteChunks,
      saveChunks,
      findUnindexed,
      findSimilarChunks,
    },
    storagePort: { put, get, delete: deleteObject },
    textExtractor: { extract },
    contactDirectory: { findNames: findContactNames },
    projectDirectory: { findNames: findProjectNames },
    rateLimitRepository: { registerRequest },
    embeddingPort: { embed },
    transactionManager,
    idGenerator,
    clock,
    rateLimit: RATE_LIMIT,
    reindexBatchSize: 5,
    maxFileBytes: overrides.maxFileBytes ?? 20 * 1024 * 1024,
    maxChunks: overrides.maxChunks ?? 300,
  });

  return {
    useCases,
    calls,
    save,
    findById,
    deleteById,
    deleteChunks,
    saveChunks,
    put,
    get,
    deleteObject,
    extract,
    embed,
    findContactNames,
    findProjectNames,
    findUnindexed,
  };
}

function upload(bytes: Buffer = PDF_BYTES) {
  return { originalFilename: 'Kira Sozlesmesi.pdf', bytes };
}

describe('create — ⚠️ SIRA (ADR-0037 §5.3)', () => {
  it('⚠️ NESNE DB SATIRINDAN ONCE yazilir', async () => {
    // ============================================================================
    // BU, MODULUN EN ONEMLI DAVRANISIDIR
    // ============================================================================
    // Ters sira "NESNESIZ KAYIT" uretirdi: kullanici listede duran belgeye
    // tiklar, indiremez ve hata HER DENEMEDE tekrarlanir. Bu sirada ise yarida
    // kalan bir istek YETIM NESNE birakir — gorunmez ve temizlenebilir.
    const { useCases, calls } = build();

    await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      file: upload(),
      label: null,
      crmContactId: null,
      projectId: null,
    });

    expect(calls.indexOf('r2:put')).toBeLessThan(calls.indexOf('db:save'));
  });

  it('⚠️ CIKARIM YUKLEMEDEN ONCE — reddedilen dosya R2 YE HIC GIRMEZ', async () => {
    // Parca siniri asildiginda dogrulama, nesne yazilmadan patlar. Aksi halde
    // her reddedilen dosya bir yetim nesne birakirdi — yani sinir, temizlemesi
    // gereken cop uretirdi.
    const { useCases, put, calls } = build({ maxChunks: 1, extracted: 'a '.repeat(5000) });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        file: upload(),
        label: null,
        crmContactId: null,
        projectId: null,
      }),
    ).rejects.toThrow(DocumentTooManyChunksError);

    expect(put).not.toHaveBeenCalled();
    expect(calls).not.toContain('r2:put');
  });

  it('⚠️ desteklenmeyen tur: cikarim BILE calismaz', async () => {
    const { useCases, extract, put } = build();

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        file: upload(NOT_A_DOCUMENT),
        label: null,
        crmContactId: null,
        projectId: null,
      }),
    ).rejects.toThrow(UnsupportedDocumentTypeError);

    expect(extract).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('boyut siniri asilirsa 413 e goturen hata, HICBIR yan etki YOK', async () => {
    const { useCases, extract, put } = build({ maxFileBytes: 4 });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        file: upload(),
        label: null,
        crmContactId: null,
        projectId: null,
      }),
    ).rejects.toThrow(DocumentTooLargeError);

    expect(extract).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('⚠️ ORAN SINIRI cikarimdan ONCE odenir — reddedilen istek CPU harcamaz', async () => {
    const { useCases, extract } = build({ rateLimitCount: RATE_LIMIT + 1 });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        file: upload(),
        label: null,
        crmContactId: null,
        projectId: null,
      }),
    ).rejects.toThrow(RateLimitExceededError);

    expect(extract).not.toHaveBeenCalled();
  });

  it('⚠️ TARANMIS belge: 0 parca, ama KAYIT ACILIR (§6.3)', async () => {
    // Bu bir ariza degil, veri turunun dogal sonucudur — dosyada gercekten
    // metin yoktur. Sessiz olmamasini saglayan sey `chunkCount: 0`in ACIKCA
    // donmesidir; arayuz bunu soylemek ZORUNDADIR.
    const { useCases, save, saveChunks, embed } = build({ extracted: '   ' });

    const result = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      file: upload(),
      label: null,
      crmContactId: null,
      projectId: null,
    });

    expect(result.chunkCount).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
    // Bos metin icin embedding cagrisi YAPILMAZ: para harcayan, hicbir sey
    // aramayan bir vektor olurdu.
    expect(embed).not.toHaveBeenCalled();
    expect(saveChunks).not.toHaveBeenCalled();
  });

  it('parcalar BAGLAM BASLIGI ile gomulur (§8.1)', async () => {
    const { useCases, embed } = build({ extracted: 'Fesih bildirimi otuz gun oncesinden.' });

    await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      file: upload(),
      label: 'sozlesme',
      crmContactId: null,
      projectId: null,
    });

    expect(embed).toHaveBeenCalledWith(
      '[Belge · Kira Sozlesmesi.pdf · sozlesme] Fesih bildirimi otuz gun oncesinden.',
    );
  });

  it('anahtar `tenants/<tenantId>/documents/` onekiyle uretilir (§5.2)', async () => {
    const { useCases, put } = build();

    await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      file: upload(),
      label: null,
      crmContactId: null,
      projectId: null,
    });

    expect(put.mock.calls[0]?.[0].key).toMatch(
      new RegExp(`^tenants/${TENANT}/documents/[^/]+/[^/]+$`),
    );
  });
});

describe('create — cross-modul referanslar (§4)', () => {
  it('goremedigin KISIYE baglanamaz', async () => {
    const { useCases, put } = build({ contactNames: new Map() });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'viewer',
        file: upload(),
        label: null,
        crmContactId: CONTACT,
        projectId: null,
      }),
    ).rejects.toThrow(DocumentContactNotFoundError);

    // Dogrulama yazmadan ONCE: hicbir yan etki olusmadi.
    expect(put).not.toHaveBeenCalled();
  });

  it('goremedigin PROJEYE baglanamaz — AYRI bir hata tipi', async () => {
    const { useCases } = build({ projectNames: new Map() });

    await expect(
      useCases.create({
        tenantId: TENANT,
        userId: USER,
        role: 'viewer',
        file: upload(),
        label: null,
        crmContactId: null,
        projectId: PROJECT,
      }),
    ).rejects.toThrow(DocumentProjectNotFoundError);
  });

  it('⚠️ IKISI DE `null` ise HICBIR dizin cagrilmaz', async () => {
    // Bir belge ne bir kisiye ne bir projeye bagli olmak ZORUNDA degildir
    // (sirket ana kira sozlesmesi). Gereksiz bir dizin cagrisi, izin
    // kontrolunu bosuna calistirirdi.
    const { useCases, findContactNames, findProjectNames } = build();

    await useCases.create({
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      file: upload(),
      label: null,
      crmContactId: null,
      projectId: null,
    });

    expect(findContactNames).not.toHaveBeenCalled();
    expect(findProjectNames).not.toHaveBeenCalled();
  });
});

describe('delete — ⚠️ SIRA ve YETIM TOLERANSI (§5.3)', () => {
  it('⚠️ DB SATIRI NESNEDEN ONCE silinir', async () => {
    const { useCases, calls } = build();

    await useCases.delete(ID);

    expect(calls.indexOf('db:delete')).toBeLessThan(calls.indexOf('r2:delete'));
  });

  it('⚠️ NESNE SILINEMESE BILE ISLEM BASARILI — yetim KABUL EDILEN taraftir', async () => {
    // ============================================================================
    // ⚠️ BU TEST BIR "YUTULAN HATA"YI KORUYOR — ve gerekcesi kayitli
    // ============================================================================
    // Bu noktada DB tarafi ZATEN COMMIT OLMUSTUR. Hatayi yukari birakmak,
    // kullaniciya BASARILI OLMUS bir islemin basarisiz oldugunu soylemek
    // olurdu: satir gitti, kullanici 502 gorur, tekrar dener ve 404 alir.
    //
    // Geriye kalan sey yetim nesnedir — bir fatura, bir bozukluk degil.
    const { useCases } = build({ deleteObjectFails: true });

    await expect(useCases.delete(ID)).resolves.toBeUndefined();
  });

  it('bulunamayan belge 404 e duser ve NESNEYE DOKUNULMAZ', async () => {
    const { useCases, deleteObject } = build({ found: null });

    await expect(useCases.delete(ID)).rejects.toThrow(DocumentNotFoundError);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('⚠️ ANAHTAR SILMEDEN ONCE okunur — yoksa nesne SONSUZA KADAR yetim kalirdi', async () => {
    const { useCases, findById, deleteObject } = build();

    await useCases.delete(ID);

    expect(findById).toHaveBeenCalledWith(ID);
    expect(deleteObject).toHaveBeenCalledWith(
      `tenants/${TENANT}/documents/${ID}/eski-Kira-Sozlesmesi.pdf`,
    );
  });
});

describe('replaceFile — VERSIYON YOK (§7)', () => {
  it('YENI anahtar uretir ve ESKI nesneyi siler', async () => {
    const { useCases, put, deleteObject } = build();

    await useCases.replaceFile({
      id: ID,
      tenantId: TENANT,
      userId: USER,
      file: { originalFilename: 'Yeni.pdf', bytes: PDF_BYTES },
    });

    const newKey = put.mock.calls[0]?.[0].key;
    expect(newKey).not.toBe(`tenants/${TENANT}/documents/${ID}/eski-Kira-Sozlesmesi.pdf`);
    expect(deleteObject).toHaveBeenCalledWith(
      `tenants/${TENANT}/documents/${ID}/eski-Kira-Sozlesmesi.pdf`,
    );
  });

  it('⚠️ ESKI NESNE YENISI YAZILDIKTAN SONRA silinir', async () => {
    // Ters sira, yeni yazma cokerse belgeyi NESNESIZ birakirdi.
    const { useCases, calls } = build();

    await useCases.replaceFile({
      id: ID,
      tenantId: TENANT,
      userId: USER,
      file: { originalFilename: 'Yeni.pdf', bytes: PDF_BYTES },
    });

    expect(calls.indexOf('r2:put')).toBeLessThan(calls.indexOf('r2:delete'));
  });

  it('parcalar TUMUYLE silinip yeniden uretilir — kismi guncelleme YOK', async () => {
    const { useCases, deleteChunks, saveChunks } = build();

    await useCases.replaceFile({
      id: ID,
      tenantId: TENANT,
      userId: USER,
      file: { originalFilename: 'Yeni.pdf', bytes: PDF_BYTES },
    });

    expect(deleteChunks).toHaveBeenCalledWith(ID);
    expect(saveChunks).toHaveBeenCalledTimes(1);
  });

  it('eski nesne silinemese bile islem BASARILI (yetim tolere edilir)', async () => {
    const { useCases } = build({ deleteObjectFails: true });

    await expect(
      useCases.replaceFile({
        id: ID,
        tenantId: TENANT,
        userId: USER,
        file: { originalFilename: 'Yeni.pdf', bytes: PDF_BYTES },
      }),
    ).resolves.toMatchObject({ chunkCount: 1 });
  });
});

describe('update — ETIKET DEGISIMI PARCALARI YENIDEN URETIR (§8.1)', () => {
  it('⚠️ etiket degisince dosya YENIDEN INDIRILIR ve parcalar yeniden uretilir', async () => {
    // ============================================================================
    // ⚠️ RANDEVU'DAN AYRISTIGI YER
    // ============================================================================
    // Randevu'da baslikta bagli KISI ADI vardi ve o ad BASKA BIR MODULDE
    // degisiyordu — Randevu degisimi GOREMEZ, bu yuzden bayatlama kabul edilip
    // telafisi `reindex`e birakildi.
    //
    // Etiket BU MODULDE ve TAM BU ANDA degisiyor. Gordugumuz bir degisimi
    // gormezden gelmek, telafi edilebilir bir bayatlama degil BILEREK URETILEN
    // bir yanlis olurdu: arama ESKI etiketi gormeye devam ederdi.
    const { useCases, get, deleteChunks, saveChunks } = build();

    await useCases.update({
      id: ID,
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      changes: { label: 'sozlesme' },
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(deleteChunks).toHaveBeenCalledWith(ID);
    expect(saveChunks).toHaveBeenCalledTimes(1);
  });

  it('⚠️ BAGLANTI degisimi parcalara DOKUNMAZ ve pay ODEMEZ', async () => {
    // Baglantilar baslikta YOKTUR (§8.1), dolayisiyla yeniden uretim gereksiz
    // bir maliyet olurdu.
    const { useCases, get, deleteChunks, saveChunks } = build();

    await useCases.update({
      id: ID,
      tenantId: TENANT,
      userId: USER,
      role: 'owner',
      changes: { crmContactId: CONTACT },
    });

    expect(get).not.toHaveBeenCalled();
    expect(deleteChunks).not.toHaveBeenCalled();
    expect(saveChunks).not.toHaveBeenCalled();
  });

  it('bulunamayan belge 404', async () => {
    const { useCases } = build({ found: null });

    await expect(
      useCases.update({
        id: ID,
        tenantId: TENANT,
        userId: USER,
        role: 'owner',
        changes: { label: 'x' },
      }),
    ).rejects.toThrow(DocumentNotFoundError);
  });
});

describe('download — ⚠️ ANAHTAR VERITABANINDAN GELIR (§5.2, §5.4)', () => {
  it('istemciden gelen bir anahtar KULLANILMAZ; kayittaki anahtar okunur', async () => {
    // ============================================================================
    // ⚠️ BU BIR GUVENLIK IDDIASIDIR
    // ============================================================================
    // Nesne deposunda RLS YOKTUR. Zincir sudur: `findById` RLS altinda calisir,
    // yani baska tenant'in satiri GORUNMEZ ve 404 doner — dolayisiyla o
    // tenant'in anahtari HIC OKUNMAZ. Anahtari istemciden almak bu zinciri
    // tumuyle atlardi.
    const { useCases, get } = build();

    const result = await useCases.download(ID);

    expect(get).toHaveBeenCalledWith(`tenants/${TENANT}/documents/${ID}/eski-Kira-Sozlesmesi.pdf`);
    expect(result.document.mimeType).toBe(PDF_MIME_TYPE);
  });

  it('bulunamayan belge 404 — depoya HIC gidilmez', async () => {
    const { useCases, get } = build({ found: null });

    await expect(useCases.download(ID)).rejects.toThrow(DocumentNotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it('nesne yoksa StorageFailedError yuzeye cikar (502) — sessizce bos donmez', async () => {
    const { useCases } = build({ getFails: true });

    await expect(useCases.download(ID)).rejects.toThrow(StorageFailedError);
  });
});

describe('list — adlar TOPLU cozulur (§4)', () => {
  it('cozulemeyen ad `null` olur ve satir listeden DUSMEZ', async () => {
    // Uc sebep AYIRT EDILMEZ: bagli degil, silinmis (sarkan isaretci), ya da
    // izin yok. Satiri dusurmek, silinmis bir kaydin varligini sizdirirdi.
    const { useCases } = build({ contactNames: new Map(), projectNames: new Map() });

    const page = await useCases.list({
      limit: 20,
      offset: 0,
      label: null,
      crmContactId: null,
      projectId: null,
      role: 'viewer',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.contactName).toBeNull();
    expect(page.items[0]?.projectName).toBeNull();
  });

  it('`chunkCount` satirla birlikte doner (§6.3)', async () => {
    const { useCases } = build();

    const page = await useCases.list({
      limit: 20,
      offset: 0,
      label: null,
      crmContactId: null,
      projectId: null,
      role: 'owner',
    });

    expect(page.items[0]?.chunkCount).toBe(1);
  });
});

describe('reindex (§10)', () => {
  const job = (id: string) => ({
    documentId: id,
    storageKey: `tenants/${TENANT}/documents/${id}/x-a.pdf`,
    originalFilename: 'a.pdf',
    label: null,
    mimeType: PDF_MIME_TYPE,
  });

  it('parcasiz belgeleri onarir', async () => {
    const { useCases, saveChunks } = build({ unindexed: [job('a'), job('b')] });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 2,
      failed: 0,
    });
    expect(saveChunks).toHaveBeenCalledTimes(2);
  });

  it('⚠️ BIR BELGENIN COKMESI DIGERLERINI ENGELLEMEZ', async () => {
    // Toplu bir transaction, tek bir bozuk dosya yuzunden onarilan HER SEYI
    // geri alirdi. Her belge ayri ele alinir.
    const harness = build({ unindexed: [job('a'), job('b')] });
    harness.get
      .mockImplementationOnce(() => Promise.reject(new StorageFailedError('nesne yok')))
      .mockImplementation(() => Promise.resolve(Readable.from(PDF_BYTES)));

    await expect(harness.useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 1,
      failed: 1,
    });
  });

  it('⚠️ TARANMIS belge `repaired` sayilir — ve bu KACINILMAZDIR', async () => {
    // Veritabani "parcasi yok" ile "parcasi OLAMAZ" arasindaki farki BILEMEZ.
    // Bir "denendi, metin yok" isareti tutmak ikinci bir dogruluk kaynagi
    // acardi; bedeli her cagride bir CIKARIM maliyetidir — embedding cagrisi
    // uretmez.
    const { useCases, embed } = build({ unindexed: [job('a')], extracted: '' });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 1,
      failed: 0,
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('oran siniri YAZMA yoluyla AYNI kovayi paylasir', async () => {
    // Ayri bir kova, onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi — ve burada bu,
    // oncekilerden daha onemli: tek cagri batch × maxChunks kadar embedding
    // uretebilir.
    const { useCases, findUnindexed } = build({ rateLimitCount: RATE_LIMIT + 1 });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).rejects.toThrow(
      RateLimitExceededError,
    );
    expect(findUnindexed).not.toHaveBeenCalled();
  });
});
