import { Injectable } from '@nestjs/common';
import {
  asc,
  cosineDistance,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import {
  supplierCompanies,
  supplierContacts,
  supplierInteractions,
} from '../../../infrastructure/database/schema';
import { isPgError, PG_UNIQUE_VIOLATION } from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type ListPage,
  type SimilarInteraction,
  type SupplierRepository,
  type UnindexedInteraction,
} from '../application/supplier.repository.port';
import { SupplierContact } from '../domain/supplier-contact.entity';
import { SupplierInteraction } from '../domain/supplier-interaction.entity';
import { Supplier } from '../domain/supplier.entity';
import { DuplicateTaxNumberError } from '../domain/suppliers.error';

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR
 * ============================================================================
 * `suppliers.interactions` VEKTOR TASIR (§2.2 — chunk tablosu yok). `SELECT *`
 * her satirda 1536 `float`i (~6 KB) agdan cekerdi ve HICBIRI KULLANILMAZDI:
 * `embedding` yalnizca anlamsal katkicinin `<=>` operatoruyle SQL ICINDE
 * kullandigi bir alandir, entity'de karsiligi yoktur.
 *
 * `DrizzleAppointmentRepository`nin ayni karari, ikinci kez.
 *
 * ⚠️ `suppliers.suppliers` ve `suppliers.contacts` vektor TASIMAZ; orada acik
 * projeksiyon bir zorunluluk degil, TUTARLILIK tercihidir — ve ileride bir
 * kolon eklendiginde entity'nin tasimadigi bir alanin sessizce cekilmesini
 * onler.
 */
const SUPPLIER_COLUMNS = {
  id: supplierCompanies.id,
  tenantId: supplierCompanies.tenantId,
  name: supplierCompanies.name,
  taxNumber: supplierCompanies.taxNumber,
  category: supplierCompanies.category,
  email: supplierCompanies.email,
  phone: supplierCompanies.phone,
  website: supplierCompanies.website,
  address: supplierCompanies.address,
  paymentTerms: supplierCompanies.paymentTerms,
  createdByUserId: supplierCompanies.createdByUserId,
  createdAt: supplierCompanies.createdAt,
  updatedAt: supplierCompanies.updatedAt,
};

const CONTACT_COLUMNS = {
  id: supplierContacts.id,
  tenantId: supplierContacts.tenantId,
  supplierId: supplierContacts.supplierId,
  fullName: supplierContacts.fullName,
  title: supplierContacts.title,
  email: supplierContacts.email,
  phone: supplierContacts.phone,
  createdAt: supplierContacts.createdAt,
  updatedAt: supplierContacts.updatedAt,
};

/** ⚠️ `embedding` DISARIDA ve oyle kalmali: entity onu tasimiyor. */
const INTERACTION_COLUMNS = {
  id: supplierInteractions.id,
  tenantId: supplierInteractions.tenantId,
  supplierId: supplierInteractions.supplierId,
  contactId: supplierInteractions.contactId,
  authorUserId: supplierInteractions.authorUserId,
  occurredOn: supplierInteractions.occurredOn,
  body: supplierInteractions.body,
  createdAt: supplierInteractions.createdAt,
};

/**
 * `SupplierRepository`nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0030`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleSupplierRepository implements SupplierRepository {
  // ==========================================================================
  // Tedarikci
  // ==========================================================================

  async saveSupplier(supplier: Supplier): Promise<void> {
    const { db } = requireTransaction();
    const state = supplier.toState();

    try {
      // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
      await db
        .insert(supplierCompanies)
        .values(state)
        .onConflictDoUpdate({
          target: supplierCompanies.id,
          set: {
            name: state.name,
            taxNumber: state.taxNumber,
            category: state.category,
            email: state.email,
            phone: state.phone,
            website: state.website,
            address: state.address,
            paymentTerms: state.paymentTerms,
            updatedAt: state.updatedAt,
          },
        });
    } catch (error) {
      // ⚠️ KISIT ADI VERILIYOR: bu tabloda baska bir unique kisit da olabilir
      // (bugun yok, yarin olabilir) ve yanlis kisiti yakalayan bir ceviri
      // kullaniciya YANLIS hata mesaji gosterirdi (`pg-error.ts`in uyarisi).
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'suppliers_tenant_tax_number_unique_idx')) {
        throw new DuplicateTaxNumberError(state.taxNumber ?? '');
      }
      throw error;
    }
  }

  async findSupplierById(id: string): Promise<Supplier | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select(SUPPLIER_COLUMNS)
      .from(supplierCompanies)
      .where(eq(supplierCompanies.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toSupplier(row);
  }

  async listSuppliers(input: {
    limit: number;
    offset: number;
    search: string | null;
  }): Promise<ListPage<Supplier>> {
    const { db } = requireTransaction();

    // ⚠️ `ILIKE '%...%'` bir LISTE FILTRESIDIR, anlamsal arama DEGIL
    // (ADR-0011, SEKIZINCI kez). Index KULLANMAZ ve kullanmamasi kabul edilir:
    // bir tenant'in tedarikci sayisi gorusme sayisi gibi buyumez.
    //
    // ⚠️ Kalibin `%` ve `_` karakterleri KACISLANMAZ. Sonucu zararsizdir:
    // "%" arayan kullanici tum satirlari gorur — bir SQL enjeksiyonu DEGIL
    // (deger parametre olarak gecer), yalnizca beklenenden genis bir sonuc.
    const filter =
      input.search === null
        ? undefined
        : or(
            ilike(supplierCompanies.name, `%${input.search}%`),
            ilike(supplierCompanies.taxNumber, `%${input.search}%`),
          );

    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir. Yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve arayuzun
    // sayfalayicisi var olmayan sayfalar gosterirdi — sessiz ve fark edilmesi
    // zor bir hata (`DrizzleProjectRepository.list`te ogrenilen ayni ders).
    const rows = await db
      .select(SUPPLIER_COLUMNS)
      .from(supplierCompanies)
      .where(filter)
      // `id` TIE-BREAKER: ad TEKIL DEGILDIR (§1.1 — iki sube mesrudur) ve
      // kararsiz siralama, sayfalamada bir kaydin iki kez ya da HIC gorunmesi
      // demektir.
      .orderBy(asc(supplierCompanies.name), asc(supplierCompanies.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(supplierCompanies)
      .where(filter);

    return { items: rows.map(toSupplier), total: counted?.total ?? 0 };
  }

  async deleteSupplierById(id: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ FK IHLALI YAKALANMAZ ve bu bir eksik DEGIL: bu tabloya isaret eden
    // her sey `ON DELETE CASCADE` tasir (§1.3). ADR-0039'un
    // `StockItemHasMovementsError`i orada gerekliydi cunku FK `RESTRICT`ti —
    // burada boyle bir FK YOK. Bir "kullanimda" hatasi yazmak, VAR OLMAYAN bir
    // iliskiyi IMA EDERDI.
    //
    // ⚠️ 8. modul bir satin alma faturasini tedarikciye bagladigi gun bu satir
    // DEGISIR (ADR-0040 § Bu karar ne zaman yeniden gozden gecirilir).
    const deleted = await db
      .delete(supplierCompanies)
      .where(eq(supplierCompanies.id, id))
      .returning({ id: supplierCompanies.id });

    return deleted.length;
  }

  async findSupplierNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();

    const rows = await db
      .select({ id: supplierCompanies.id, name: supplierCompanies.name })
      .from(supplierCompanies)
      .where(inArray(supplierCompanies.id, [...ids]));

    return new Map(rows.map((row) => [row.id, row.name]));
  }

  // ==========================================================================
  // Kisi
  // ==========================================================================

  async saveContact(contact: SupplierContact): Promise<void> {
    const { db } = requireTransaction();
    const state = contact.toState();

    await db
      .insert(supplierContacts)
      .values(state)
      .onConflictDoUpdate({
        target: supplierContacts.id,
        set: {
          // ⚠️ `supplierId` SET LISTESINDE YOK: kisi baska tedarikciye
          // TASINAMAZ (entity'nin ayni karari). Listeye koymak, entity'nin
          // korudugu kurali repository seviyesinde SESSIZCE delerdi.
          fullName: state.fullName,
          title: state.title,
          email: state.email,
          phone: state.phone,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findContactById(id: string): Promise<SupplierContact | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select(CONTACT_COLUMNS)
      .from(supplierContacts)
      .where(eq(supplierContacts.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : SupplierContact.fromPersistence(row);
  }

  async listContactsBySupplier(supplierId: string): Promise<SupplierContact[]> {
    const { db } = requireTransaction();

    // ⚠️ SAYFALAMA YOK ve bu bilincli: bir tedarikcide kisi sayisi ONLARLA
    // olculur, binlerle degil. Sayfalama eklemek, arayuzde hicbir zaman
    // kullanilmayacak bir kontrol uretirdi.
    const rows = await db
      .select(CONTACT_COLUMNS)
      .from(supplierContacts)
      .where(eq(supplierContacts.supplierId, supplierId))
      .orderBy(asc(supplierContacts.fullName), asc(supplierContacts.id));

    return rows.map((row) => SupplierContact.fromPersistence(row));
  }

  async deleteContactById(id: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ GORUSMELER SILINMEZ: `interactions.contact_id` `ON DELETE SET NULL`
    // tasir (§1.3). Bu satir hicbir sey yapmaz ama SONUCU tasir — silme
    // basarilidir ve gorusme gecmisi YERINDE KALIR.
    const deleted = await db
      .delete(supplierContacts)
      .where(eq(supplierContacts.id, id))
      .returning({ id: supplierContacts.id });

    return deleted.length;
  }

  // ==========================================================================
  // Gorusme gunlugu (EKLEME-YALNIZ)
  // ==========================================================================

  async insertInteraction(interaction: SupplierInteraction): Promise<void> {
    const { db } = requireTransaction();

    // ⚠️ `onConflictDoUpdate` YOK — ve bu bir eksik degil, ekleme-yalnizligin
    // tasiyicisidir (`insertMovement`in ayni karari). UPSERT yazilsaydi id
    // cakismasi durumunda sessizce bir gecmis satirini DEGISTIRIRDI.
    //
    // ⚠️ `embedding` VALUES'TA YOK ve bu KASITLIDIR: vektorun uretimi bir AG
    // CAGRISI gerektirir ve o cagri transaction'in disinda kalir.
    await db.insert(supplierInteractions).values(interaction.toState());
  }

  async setInteractionEmbedding(input: {
    id: string;
    embedding: readonly number[];
  }): Promise<number> {
    const { db } = requireTransaction();

    const updated = await db
      .update(supplierInteractions)
      // Drizzle `vector` kolonu `number[]` ister; port `readonly` sozu veriyor
      // (cagiran diziyi degistirmesin diye) ve burada kopyalanarak aciliyor.
      .set({ embedding: [...input.embedding] })
      .where(eq(supplierInteractions.id, input.id))
      .returning({ id: supplierInteractions.id });

    return updated.length;
  }

  async findUnindexedInteractions(limit: number): Promise<UnindexedInteraction[]> {
    const { db } = requireTransaction();

    // ⚠️ IS LISTESI TURETILMISTIR — ayri bir "onarilacaklar" tablosu YOK.
    //
    // ⚠️ `embedding` SECILMEZ, yalnizca `IS NULL` diye SUZULUR: onarilacak
    // satirlarin vektoru zaten yoktur.
    //
    // ⚠️ `body IS NOT NULL` gibi bir ek yuklem GEREKMEZ — Randevu ve Stok'tan
    // farkli olarak metin bu modulde ZORUNLUDUR.
    return (
      db
        .select({
          id: supplierInteractions.id,
          supplierId: supplierInteractions.supplierId,
          occurredOn: supplierInteractions.occurredOn,
          body: supplierInteractions.body,
        })
        .from(supplierInteractions)
        .where(isNull(supplierInteractions.embedding))
        // En eski once: onarim kuyrugu FIFO'dur, yoksa buyuk bir birikimde ayni
        // satirlar tekrar tekrar secilebilirdi.
        .orderBy(asc(supplierInteractions.occurredOn), asc(supplierInteractions.id))
        .limit(limit)
    );
  }

  async findInteractionsBySupplier(input: {
    supplierId: string;
    limit: number;
  }): Promise<UnindexedInteraction[]> {
    const { db } = requireTransaction();

    // ⚠️ `embedding IS NULL` SUZULMEZ ve fark burada: bu sorgu BAYAT BASLIKLI
    // satirlari getirir (§6), eksik olanlari degil. "Bayat"i sorguyla tespit
    // etmek IMKANSIZDIR — baslik vektorun icindedir ve hangi adla uretildigi
    // hicbir kolonda yazmaz.
    //
    // Sonucu durustce: bu cagri, ZATEN GUNCEL olan vektorleri de yeniden
    // uretir. Bedeli acikca `reindexBatchSize` ile sinirlidir ve kullanici onu
    // BILEREK cagirir (`PATCH` cevabinin `staleAfterRename` bayragi).
    return db
      .select({
        id: supplierInteractions.id,
        supplierId: supplierInteractions.supplierId,
        occurredOn: supplierInteractions.occurredOn,
        body: supplierInteractions.body,
      })
      .from(supplierInteractions)
      .where(eq(supplierInteractions.supplierId, input.supplierId))
      .orderBy(desc(supplierInteractions.occurredOn), asc(supplierInteractions.id))
      .limit(input.limit);
  }

  async listInteractions(input: {
    limit: number;
    offset: number;
    supplierId: string | null;
  }): Promise<ListPage<SupplierInteraction>> {
    const { db } = requireTransaction();

    const filter =
      input.supplierId === null ? undefined : eq(supplierInteractions.supplierId, input.supplierId);

    // ⚠️ Siralama AZALAN (`desc`) — `appointments`in takvim `asc`inden bilincli
    // sapma. Gorusme gunlugu bir GECMIS AKISIDIR ("en son ne konusuldu"),
    // `finance.transactions` ile ayni sinifta.
    const rows = await db
      .select(INTERACTION_COLUMNS)
      .from(supplierInteractions)
      .where(filter)
      .orderBy(desc(supplierInteractions.occurredOn), asc(supplierInteractions.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(supplierInteractions)
      .where(filter);

    return {
      items: rows.map((row) => SupplierInteraction.fromPersistence(row)),
      total: counted?.total ?? 0,
    };
  }

  async findSimilarInteractions(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarInteraction[]> {
    const { db } = requireTransaction();

    // ⚠️ `embedding` SECILMEZ (1536 float agdan gecmesin) ama `IS NOT NULL`
    // SUZULUR: vektoru olmayan satirlar `LIMIT` yuvalarini bosa harcamasin.
    //
    // ⚠️ `JOIN` MESRUDUR ve RANDEVU'DAN AYRILDIGIMIZ YER BURASI: ad AYNI
    // SEMADADIR (`suppliers.suppliers`). Mutlak Kural 5 yalnizca CROSS-SCHEMA
    // join'i yasaklar. `AppointmentNotesContributor` adi basliga KOYAMIYORDU
    // cunku ad `crm.contacts`taydi ve okumanin tek mesru yolu IZIN KAPILI bir
    // dizindi.
    //
    // Sonucu: gosterilen ad DAIMA TAZEDIR — vektor bayat olsa bile metin
    // bayatlamaz.
    //
    // Siralama `cosineDistance` ARTAN — yani en YAKIN once. Operator migration
    // `0030`un `vector_cosine_ops` HNSW index'iyle eslesmek ZORUNDA; aksi halde
    // index devre disi kalir ve sorgu tam tarama yapar (sessiz bir performans
    // coku).
    return (
      db
        .select({
          id: supplierInteractions.id,
          occurredOn: supplierInteractions.occurredOn,
          body: supplierInteractions.body,
          supplierName: supplierCompanies.name,
        })
        .from(supplierInteractions)
        .innerJoin(supplierCompanies, eq(supplierInteractions.supplierId, supplierCompanies.id))
        // ⚠️ TEK YUKLEM: "tedarikci var mi" diye ikinci bir kosul YAZILMAZ —
        // `supplier_id` NOT NULL ve `innerJoin` zaten bunu garanti eder. Gereksiz
        // bir yuklem, okuyana var olmayan bir durumu MUMKUN gosterirdi.
        .where(isNotNull(supplierInteractions.embedding))
        .orderBy(asc(cosineDistance(supplierInteractions.embedding, [...input.embedding])))
        .limit(input.limit)
    );
  }
}

/** Satiri entity'ye cevirir. */
function toSupplier(row: {
  id: string;
  tenantId: string;
  name: string;
  taxNumber: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  paymentTerms: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Supplier {
  return Supplier.fromPersistence({
    ...row,
    // ⚠️ Kolon NULLABLE ama entity zorunlu tutuyor. Ayrim kasitli: yazma yolu
    // kimligi HER ZAMAN doldurur (controller onu tenant principal'inden alir),
    // ama kolon `platform.users`a FK VEREMEZ (Mutlak Kural 5) ve ileride bir
    // ithalat betigi bos birakabilir. Bos dize, "kim olusturdu" sorusuna
    // "bilinmiyor" cevabidir — uydurulmus bir kullanici id'si degil.
    createdByUserId: row.createdByUserId ?? '',
  });
}
