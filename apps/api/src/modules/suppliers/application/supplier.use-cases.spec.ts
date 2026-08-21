import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { SupplierContact } from '../domain/supplier-contact.entity';
import { Supplier, type SupplierFields } from '../domain/supplier.entity';
import { SupplierContactNotFoundError, SupplierNotFoundError } from '../domain/suppliers.error';
import { type SupplierRepository, type UnindexedInteraction } from './supplier.repository.port';
import { SupplierUseCases } from './supplier.use-cases';

/**
 * `SupplierUseCases`.
 *
 * CRUD'un kendisi onceki alti modulde kanitlandi; buradaki testler bu modulun
 * KENDINE OZGU iddialarina odaklanir:
 *
 *   1. ⚠️ TEDARIKCI/KISI YAZMAK ORAN SINIRI PAYI ODEMEZ (§6) — sayac
 *      EMBEDDING sayar; anlamsal yuzey yalnizca GORUSME GUNLUGUDUR,
 *   2. ⚠️ GORUSME YAZMAK HER ZAMAN PAY ODER — Randevu/Stok'tan farkli olarak
 *      metin ZORUNLUDUR, yani sayac ile maliyet arasindaki oran SABIT,
 *   3. ⚠️ KISI, BAGLI OLDUGU TEDARIKCININ kisisi olmak ZORUNDA — sema ici bir
 *      FK bunu YAKALAMAZ,
 *   4. ⚠️ AD DEGISIMI VEKTORLERI BAYATLATIR ve `PATCH` onlari YENILEMEZ
 *      (ADR-0039'dan bilincli sapma) — bunun yerine `staleAfterRename`
 *      bayragi doner,
 *   5. ⚠️ EMBEDDING COKERSE GORUSME SILINMEZ — 502 yuzeye cikar, kayit kalir.
 */

const NOW = new Date('2026-08-21T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const SUPPLIER = '018f3a2b-7c4d-7e1f-8a2b-000000000001';
const CONTACT = '018f3a2b-7c4d-7e1f-8a2b-000000000002';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const RATE_LIMIT = 5;
/** `EMBEDDING_DIMENSIONS` uzunlugunda gecerli bir vektor. */
const VECTOR = Array.from({ length: 1536 }, () => 0.1);

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function fields(overrides: Partial<SupplierFields> = {}): SupplierFields {
  return {
    name: 'Yildiz Civata',
    taxNumber: null,
    category: null,
    email: null,
    phone: null,
    website: null,
    address: null,
    paymentTerms: null,
    ...overrides,
  };
}

function existingSupplier(overrides: Partial<SupplierFields> = {}): Supplier {
  return Supplier.create({
    id: SUPPLIER,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

function existingContact(supplierId = SUPPLIER): SupplierContact {
  return SupplierContact.create({
    id: CONTACT,
    tenantId: TENANT,
    supplierId,
    fields: { fullName: 'Ahmet Yilmaz', title: null, email: null, phone: null },
    now: NOW,
  });
}

function build(
  overrides: {
    supplier?: Supplier | null;
    contact?: SupplierContact | null;
    deletedSupplier?: number;
    deletedContact?: number;
    unindexed?: UnindexedInteraction[];
    bySupplier?: UnindexedInteraction[];
    names?: Map<string, string>;
    rateLimitCount?: number;
    embedFails?: boolean;
  } = {},
) {
  const saveSupplier = vi.fn<SupplierRepository['saveSupplier']>().mockResolvedValue(undefined);
  const findSupplierById = vi
    .fn<SupplierRepository['findSupplierById']>()
    .mockResolvedValue(overrides.supplier === undefined ? existingSupplier() : overrides.supplier);
  const deleteSupplierById = vi
    .fn<SupplierRepository['deleteSupplierById']>()
    .mockResolvedValue(overrides.deletedSupplier ?? 1);
  const findSupplierNames = vi
    .fn<SupplierRepository['findSupplierNames']>()
    .mockResolvedValue(overrides.names ?? new Map([[SUPPLIER, 'Yildiz Civata']]));

  const saveContact = vi.fn<SupplierRepository['saveContact']>().mockResolvedValue(undefined);
  const findContactById = vi
    .fn<SupplierRepository['findContactById']>()
    .mockResolvedValue(overrides.contact === undefined ? existingContact() : overrides.contact);
  const deleteContactById = vi
    .fn<SupplierRepository['deleteContactById']>()
    .mockResolvedValue(overrides.deletedContact ?? 1);

  const insertInteraction = vi
    .fn<SupplierRepository['insertInteraction']>()
    .mockResolvedValue(undefined);
  const setInteractionEmbedding = vi
    .fn<SupplierRepository['setInteractionEmbedding']>()
    .mockResolvedValue(1);
  const findUnindexedInteractions = vi
    .fn<SupplierRepository['findUnindexedInteractions']>()
    .mockResolvedValue(overrides.unindexed ?? []);
  const findInteractionsBySupplier = vi
    .fn<SupplierRepository['findInteractionsBySupplier']>()
    .mockResolvedValue(overrides.bySupplier ?? []);

  const repository = {
    saveSupplier,
    findSupplierById,
    deleteSupplierById,
    findSupplierNames,
    saveContact,
    findContactById,
    deleteContactById,
    insertInteraction,
    setInteractionEmbedding,
    findUnindexedInteractions,
    findInteractionsBySupplier,
    listSuppliers: vi.fn(),
    listContactsBySupplier: vi.fn(),
    listInteractions: vi.fn(),
    findSimilarInteractions: vi.fn(),
  } as unknown as SupplierRepository;

  // ⚠️ `registerRequest` sayaci ARTIRIR ve ARTMIS degeri doner (ilk istekte 1).
  // Limitin USTUNDE bir deger dondurmek 429 uretir.
  const registerRequest = vi
    .fn<RateLimitRepository['registerRequest']>()
    .mockResolvedValue((overrides.rateLimitCount ?? 0) + 1);
  const rateLimitRepository = { registerRequest } as unknown as RateLimitRepository;

  const embed = vi
    .fn<EmbeddingPort['embed']>()
    .mockImplementation(() =>
      overrides.embedFails === true
        ? Promise.reject(new Error('saglayici coktu'))
        : Promise.resolve(VECTOR),
    );
  const embeddingPort = { embed } as unknown as EmbeddingPort;

  const useCases = new SupplierUseCases({
    repository,
    rateLimitRepository,
    embeddingPort,
    transactionManager,
    idGenerator,
    clock,
    rateLimit: RATE_LIMIT,
    reindexBatchSize: 25,
  });

  return {
    useCases,
    saveSupplier,
    findSupplierById,
    deleteSupplierById,
    findSupplierNames,
    saveContact,
    findContactById,
    deleteContactById,
    insertInteraction,
    setInteractionEmbedding,
    findUnindexedInteractions,
    findInteractionsBySupplier,
    registerRequest,
    embed,
  };
}

const interactionInput = {
  tenantId: TENANT,
  userId: USER,
  supplierId: SUPPLIER,
  contactId: null,
  occurredOn: '2026-08-21',
  body: 'fiyat listesi guncellendi, M8 vidada %6 zam',
};

describe('SupplierUseCases — tedarikci', () => {
  it('⚠️ TEDARIKCI YAZMAK ORAN SINIRI PAYI ODEMEZ (§6)', () => {
    // Bir tedarikci kaydi HICBIR embedding cagrisi uretmez; anlamsal yuzey
    // GORUSME GUNLUGUDUR. Kosulsuz bir sayac, kotasini "kac tedarikci actim"
    // diye sayan bir kullaniciya YANLIS BILGI verirdi ve bilgi SESSIZ kalirdi.
    const { useCases, registerRequest, embed } = build();

    return useCases
      .createSupplier({ tenantId: TENANT, userId: USER, fields: fields() })
      .then(() => {
        expect(registerRequest).not.toHaveBeenCalled();
        expect(embed).not.toHaveBeenCalled();
      });
  });

  it('olusturma id / tenant / olusturani DOLDURUR', async () => {
    const { useCases } = build();

    const state = await useCases.createSupplier({
      tenantId: TENANT,
      userId: USER,
      fields: fields(),
    });

    expect(state.id).toBe(ID);
    expect(state.tenantId).toBe(TENANT);
    expect(state.createdByUserId).toBe(USER);
  });

  it('olmayan tedarikci -> 404 (`SupplierNotFoundError`)', async () => {
    const { useCases } = build({ supplier: null });

    await expect(useCases.getSupplier(SUPPLIER)).rejects.toThrow(SupplierNotFoundError);
  });

  it('silinen satir yoksa -> 404', async () => {
    const { useCases } = build({ deletedSupplier: 0 });

    await expect(useCases.deleteSupplier(SUPPLIER)).rejects.toThrow(SupplierNotFoundError);
  });

  describe('⚠️ AD DEGISIMI — `staleAfterRename` (§6)', () => {
    it('ad DEGISTIYSE bayrak `true` doner', async () => {
      const { useCases } = build({ supplier: existingSupplier({ name: 'Eski Ad' }) });

      const result = await useCases.updateSupplier({
        id: SUPPLIER,
        changes: { name: 'Yeni Ad' },
      });

      expect(result.staleAfterRename).toBe(true);
      expect(result.supplier.name).toBe('Yeni Ad');
    });

    it('ad DEGISMEDIYSE bayrak `false` — gereksiz onarim onerilmez', async () => {
      const { useCases } = build({ supplier: existingSupplier({ name: 'Yildiz Civata' }) });

      const result = await useCases.updateSupplier({
        id: SUPPLIER,
        changes: { phone: '0216' },
      });

      expect(result.staleAfterRename).toBe(false);
    });

    it('⚠️ karsilastirma NORMALIZE EDILMIS deger uzerinde — bosluk fark yaratmaz', async () => {
      const { useCases } = build({ supplier: existingSupplier({ name: 'Yildiz Civata' }) });

      const result = await useCases.updateSupplier({
        id: SUPPLIER,
        changes: { name: '  Yildiz Civata  ' },
      });

      expect(result.staleAfterRename).toBe(false);
    });

    it('⚠️ `PATCH` VEKTORLERI YENILEMEZ — ADR-0039 dan bilincli sapma', async () => {
      // Stok'ta ad kalemin KENDI satirindaydi ve `PATCH` vektoru AYNI ISLEMDE
      // yeniliyordu ("bayatlama penceresi yok"). Burada ad AYRI SATIRDA:
      // yenilemek, tek bir `PATCH` istegini N embedding cagrisina cevirirdi ve
      // oran siniri onu ORTASINDA keserdi (yarisi yeni, yarisi eski baslikli
      // bir vektor kumesi: EN KOTU HAL).
      const { useCases, embed, registerRequest } = build({
        supplier: existingSupplier({ name: 'Eski Ad' }),
      });

      await useCases.updateSupplier({ id: SUPPLIER, changes: { name: 'Yeni Ad' } });

      expect(embed).not.toHaveBeenCalled();
      expect(registerRequest).not.toHaveBeenCalled();
    });
  });
});

describe('SupplierUseCases — kisi', () => {
  it('⚠️ KISI YAZMAK DA PAY ODEMEZ', () => {
    const { useCases, registerRequest, embed } = build();

    return useCases
      .createContact({
        tenantId: TENANT,
        supplierId: SUPPLIER,
        fields: { fullName: 'Ahmet', title: null, email: null, phone: null },
      })
      .then(() => {
        expect(registerRequest).not.toHaveBeenCalled();
        expect(embed).not.toHaveBeenCalled();
      });
  });

  it('⚠️ OLMAYAN TEDARIKCIYE kisi eklenemez — FK YETMEZ', () => {
    // FK ihlali HAM bir PostgreSQL hatasi uretir ve kullanici 404 yerine 500
    // alirdi.
    const { useCases } = build({ supplier: null });

    return expect(
      useCases.createContact({
        tenantId: TENANT,
        supplierId: SUPPLIER,
        fields: { fullName: 'Ahmet', title: null, email: null, phone: null },
      }),
    ).rejects.toThrow(SupplierNotFoundError);
  });

  it('olmayan kisi silinemez -> 404', async () => {
    const { useCases } = build({ deletedContact: 0 });

    await expect(useCases.deleteContact(CONTACT)).rejects.toThrow(SupplierContactNotFoundError);
  });
});

describe('SupplierUseCases — gorusme gunlugu', () => {
  it('⚠️ GORUSME YAZMAK HER ZAMAN PAY ODER (§6)', async () => {
    // Randevu/Stok'ta not OPSIYONELDI ve pay YALNIZCA not varsa odeniyordu.
    // Burada metin ZORUNLUDUR: her yazma bir cagri uretir, her yazma pay oder.
    // Sayac ile maliyet arasindaki oran SABIT ve BIRE BIRDIR.
    const { useCases, registerRequest, embed } = build();

    await useCases.createInteraction(interactionInput);

    expect(registerRequest).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('⚠️ PAY, KAYITTAN ONCE odenir — pahali is BASLAMADAN', async () => {
    const { useCases, insertInteraction } = build({ rateLimitCount: RATE_LIMIT });

    await expect(useCases.createInteraction(interactionInput)).rejects.toThrow(
      RateLimitExceededError,
    );

    // Sayac tukendiginde HICBIR SATIR yazilmaz.
    expect(insertInteraction).not.toHaveBeenCalled();
  });

  it('gomulen metin BAGLAM BASLIGINI tasir (§6)', async () => {
    const { useCases, embed } = build();

    await useCases.createInteraction(interactionInput);

    expect(embed).toHaveBeenCalledWith(
      '[Tedarikci · 2026-08-21 · Yildiz Civata] fiyat listesi guncellendi, M8 vidada %6 zam',
    );
  });

  it('⚠️ EMBEDDING COKERSE GORUSME SILINMEZ — hata YUZEYE CIKAR', async () => {
    // Gorusmenin KENDISI birincil veridir; aranabilirligi ikincildir.
    // Kullaniciyi yeniden girmeye zorlamak, EKLEME-YALNIZ bir gunlukte
    // SILINEMEYEN mukerrer bir kayit uretirdi.
    const { useCases, insertInteraction, setInteractionEmbedding } = build({ embedFails: true });

    await expect(useCases.createInteraction(interactionInput)).rejects.toThrow(
      EmbeddingFailedError,
    );

    expect(insertInteraction).toHaveBeenCalledTimes(1);
    expect(setInteractionEmbedding).not.toHaveBeenCalled();
  });

  describe('⚠️ KISI, BAGLI OLDUGU TEDARIKCININ kisisi olmak ZORUNDA (§1.3)', () => {
    it('AYNI tedarikcinin kisisi kabul edilir', async () => {
      const { useCases, insertInteraction } = build({ contact: existingContact(SUPPLIER) });

      await useCases.createInteraction({ ...interactionInput, contactId: CONTACT });

      expect(insertInteraction).toHaveBeenCalledTimes(1);
    });

    it('⚠️ BASKA tedarikcinin kisisi REDDEDILIR — FK bunu YAKALAMAZ', async () => {
      // Sema ici FK yalnizca "boyle bir kisi var mi" der, "bu tedarikcinin mi"
      // demez.
      const { useCases, insertInteraction } = build({
        contact: existingContact('baska-tedarikci'),
      });

      await expect(
        useCases.createInteraction({ ...interactionInput, contactId: CONTACT }),
      ).rejects.toThrow(SupplierContactNotFoundError);

      expect(insertInteraction).not.toHaveBeenCalled();
    });

    it('olmayan kisi de AYNI hatayi alir — ayirt EDILMEZ', async () => {
      const { useCases } = build({ contact: null });

      await expect(
        useCases.createInteraction({ ...interactionInput, contactId: CONTACT }),
      ).rejects.toThrow(SupplierContactNotFoundError);
    });

    it('`contactId: null` kontrol EDILMEZ — mesru bir durum', async () => {
      const { useCases, findContactById } = build();

      await useCases.createInteraction({ ...interactionInput, contactId: null });

      expect(findContactById).not.toHaveBeenCalled();
    });
  });

  it('olmayan tedarikciye gorusme yazilamaz -> 404', async () => {
    const { useCases } = build({ supplier: null });

    await expect(useCases.createInteraction(interactionInput)).rejects.toThrow(
      SupplierNotFoundError,
    );
  });
});

describe('SupplierUseCases — reindex (§6)', () => {
  const pending: UnindexedInteraction[] = [
    { id: 'int-1', supplierId: SUPPLIER, occurredOn: '2026-08-20', body: 'birinci' },
    { id: 'int-2', supplierId: SUPPLIER, occurredOn: '2026-08-21', body: 'ikinci' },
  ];

  it('⚠️ `supplierId` YOKSA: yalnizca VEKTORSUZ satirlar (1. is)', async () => {
    const { useCases, findUnindexedInteractions, findInteractionsBySupplier } = build({
      unindexed: pending,
    });

    const result = await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: null });

    expect(findUnindexedInteractions).toHaveBeenCalledWith(25);
    expect(findInteractionsBySupplier).not.toHaveBeenCalled();
    expect(result).toEqual({ repaired: 2, failed: 0 });
  });

  it('⚠️ `supplierId` VARSA: o tedarikcinin TUM gorusmeleri (2. is — BAYAT BASLIK)', async () => {
    // Bu is ADR-0039'da YOKTU: orada ad kalemin AYNI SATIRINDAYDI ve `PATCH`
    // vektoru ayni islemde yeniliyordu.
    const { useCases, findInteractionsBySupplier, findUnindexedInteractions } = build({
      bySupplier: pending,
    });

    await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: SUPPLIER });

    expect(findInteractionsBySupplier).toHaveBeenCalledWith({
      supplierId: SUPPLIER,
      limit: 25,
    });
    expect(findUnindexedInteractions).not.toHaveBeenCalled();
  });

  it('olmayan tedarikci icin sessizce "0 onarildi" DEMEZ -> 404', async () => {
    const { useCases } = build({ supplier: null });

    await expect(
      useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: SUPPLIER }),
    ).rejects.toThrow(SupplierNotFoundError);
  });

  it('adlar TEK TOPLU sorguyla cozulur — satir basina cagri N+1 olurdu', async () => {
    const { useCases, findSupplierNames } = build({ unindexed: pending });

    await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: null });

    expect(findSupplierNames).toHaveBeenCalledTimes(1);
    expect(findSupplierNames).toHaveBeenCalledWith([SUPPLIER]);
  });

  it('baslik onarilan satirda da TEDARIKCI ADINI tasir', async () => {
    const { useCases, embed } = build({ unindexed: [pending[0]!] });

    await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: null });

    expect(embed).toHaveBeenCalledWith('[Tedarikci · 2026-08-20 · Yildiz Civata] birinci');
  });

  it('⚠️ BIR SATIRIN COKMESI DIGERLERINI ENGELLEMEZ', async () => {
    const { useCases, embed } = build({ unindexed: pending });
    embed.mockRejectedValueOnce(new Error('saglayici coktu')).mockResolvedValue(VECTOR);

    const result = await useCases.reindex({
      tenantId: TENANT,
      userId: USER,
      supplierId: null,
    });

    expect(result).toEqual({ repaired: 1, failed: 1 });
  });

  it('⚠️ ONARIM DA PAY ODER — ayri bir kova BUTCESIZ BIR YAN KAPI olurdu', async () => {
    const { useCases, registerRequest } = build({ unindexed: [] });

    await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: null });

    expect(registerRequest).toHaveBeenCalledTimes(1);
  });

  it('is listesi bossa ad sorgusu HIC ACILMAZ', async () => {
    const { useCases, findSupplierNames } = build({ unindexed: [] });

    await useCases.reindex({ tenantId: TENANT, userId: USER, supplierId: null });

    expect(findSupplierNames).not.toHaveBeenCalled();
  });
});
