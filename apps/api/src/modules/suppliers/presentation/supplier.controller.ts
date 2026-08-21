import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { SupplierUseCases, type SupplierUpdateResult } from '../application/supplier.use-cases';
import { type SupplierContactState } from '../domain/supplier-contact.entity';
import { type SupplierInteractionState } from '../domain/supplier-interaction.entity';
import { type SupplierPatch, type SupplierState } from '../domain/supplier.entity';
import {
  SUPPLIER_CONTACT_DELETE,
  SUPPLIER_CONTACT_READ,
  SUPPLIER_CONTACT_WRITE,
  SUPPLIER_DELETE,
  SUPPLIER_INTERACTION_CREATE,
  SUPPLIER_INTERACTION_READ,
  SUPPLIER_READ,
  SUPPLIER_WRITE,
} from '../suppliers.permissions';
import { SuppliersDomainExceptionFilter } from './suppliers-domain-exception.filter';
import {
  createSupplierContactSchema,
  createSupplierInteractionSchema,
  createSupplierSchema,
  idParamSchema,
  listSupplierInteractionsQuerySchema,
  listSuppliersQuerySchema,
  reindexSuppliersSchema,
  supplierIdQuerySchema,
  updateSupplierContactSchema,
  updateSupplierSchema,
  type CreateSupplierBody,
  type CreateSupplierContactBody,
  type CreateSupplierInteractionBody,
  type ListSupplierInteractionsQuery,
  type ListSuppliersQuery,
  type ReindexSuppliersBody,
  type SupplierIdQuery,
  type UpdateSupplierBody,
  type UpdateSupplierContactBody,
} from './suppliers.dto';

/**
 * Tedarikci uclari (ADR-0040 §1, §5, §6).
 *
 * ============================================================================
 * ⚠️ TEK CONTROLLER — VE BU, BIR ROTA GOLGELEMESINI ONLEMEK ICIN
 * ============================================================================
 * CRM uc ayri controller kullanir (`crm/companies`, `crm/contacts`,
 * `crm/interactions`) ve bu ORADA guvenlidir: modul oneki (`crm`) kaynak
 * adlarindan FARKLIDIR, yani `crm/:id` diye bir rota HIC YOKTUR.
 *
 * Burada oyle DEGIL: modulun kok rotasi (`suppliers`) AYNI ZAMANDA ana
 * kaynagin adidir. `SupplierContactController` ayri bir dosyada
 * `suppliers/contacts` altinda dursaydi, `GET /suppliers/contacts` istegi
 * `GET /suppliers/:id` ile YARISIRDI ve kazanani `controllers: []` dizisindeki
 * KAYIT SIRASI belirlerdi.
 *
 * O siraya guvenmek bir tuzaktir: `crm.module.ts` bunu zaten bir yorumla
 * isaretlemis durumda (_"sirayi bozmak ileride sessiz bir golgeleme
 * uretebilir"_). Bir dosyayi yeniden siralayan biri, hicbir test kirmizi
 * yanmadan `contacts`i UUID sanan bir 422'ye dusurebilirdi.
 *
 * ⚠️ Bu yuzden TUM ROTALAR TEK DOSYADA ve SABIT YOLLAR PARAMETRELI OLANLARDAN
 * ONCE yazildi. Nest, ayni controller icinde metotlari TANIMLANMA SIRASINA gore
 * eslestirir; sira bu dosyada GORULEBILIR ve bir birim testi onu kilitler.
 *
 * ⚠️ Yeni bir sabit yol eklenecekse `:id` GRUBUNDAN ONCE eklenmelidir.
 */
interface SupplierListResponse {
  readonly items: readonly SupplierState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

interface InteractionListResponse {
  readonly items: readonly SupplierInteractionState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const REINDEX_DESCRIPTION =
  'IKI ISI VAR. (1) `supplierId` VERILMEZSE: vektoru eksik gorusmeleri gomer — is listesi ' +
  'TURETILMISTIR (`embedding IS NULL`), ayri bir "onarilacaklar" tablosu YOKTUR. ' +
  '(2) `supplierId` VERILIRSE: o tedarikcinin gorusmelerini YENIDEN gomer — bir tedarikci ' +
  'yeniden adlandirildiginda BAGLAM BASLIGINDAKI ad bayatlar ve vektorler eskir. ' +
  '⚠️ Ikinci is Stok modulunde YOKTU (orada ad kalemin AYNI SATIRINDAYDI ve `PATCH` vektoru ' +
  'ayni islemde yeniliyordu). Oran siniri yazma yoluyla AYNI kovayi PAYLASIR.';

@ApiTags('suppliers')
@Controller({ path: 'suppliers', version: '1' })
@UseFilters(SuppliersDomainExceptionFilter)
export class SupplierController {
  constructor(private readonly useCases: SupplierUseCases) {}

  // ==========================================================================
  // SABIT YOLLAR — `:id` grubundan ONCE (bkz. sinif yorumu)
  // ==========================================================================

  /**
   * Vektorleri onarir (ADR-0040 §6).
   *
   * ⚠️ IZIN `supplier_interaction:create` — YENI BIR IZIN ISTENMEDI. Yaptigi is
   * var olan kayitlarin ARAMA INDEKSINI onarmaktir; `member` de calistirabilir
   * ve bu dogrudur: kendi yazdigi gorusmenin indekslenmemis olmasi onun
   * sorunudur.
   */
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SUPPLIER_INTERACTION_CREATE)
  @ApiOperation({ summary: 'Gorusme vektorlerini onarir', description: REINDEX_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(
    @Body(new ZodValidationPipe(reindexSuppliersSchema)) body: ReindexSuppliersBody,
  ): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();

    return this.useCases.reindex({
      tenantId: principal.tenantId,
      userId: principal.userId,
      supplierId: body.supplierId ?? null,
    });
  }

  @Post('contacts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(SUPPLIER_CONTACT_WRITE)
  @ApiOperation({ summary: 'Tedarikciye kisi ekler' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Kisi kaydedildi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Tedarikci bulunamadi.' })
  async createContact(
    @Body(new ZodValidationPipe(createSupplierContactSchema)) body: CreateSupplierContactBody,
  ): Promise<SupplierContactState> {
    const principal = requireTenantPrincipal();
    const { supplierId, ...fields } = body;

    return this.useCases.createContact({
      tenantId: principal.tenantId,
      supplierId,
      fields: {
        fullName: fields.fullName,
        // `nullish()` -> `null | undefined`; domain "girilmedi"yi `null` ile
        // ifade eder.
        title: fields.title ?? null,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
      },
    });
  }

  @Get('contacts')
  @RequirePermission(SUPPLIER_CONTACT_READ)
  @ApiOperation({ summary: 'Bir tedarikcinin kisilerini listeler' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Tedarikci bulunamadi.' })
  async listContacts(
    @Query(new ZodValidationPipe(supplierIdQuerySchema)) query: SupplierIdQuery,
  ): Promise<{ items: readonly SupplierContactState[] }> {
    // ⚠️ SAYFALAMA YOK ve cevap `total` TASIMAZ: bir tedarikcide kisi sayisi
    // ONLARLA olculur. Bos bir sayfalayici gostermek, olmayan bir kontrolu ima
    // ederdi (gerekce repository'de).
    return { items: await this.useCases.listContacts(query.supplierId) };
  }

  @Patch('contacts/:id')
  @RequirePermission(SUPPLIER_CONTACT_WRITE)
  @ApiOperation({ summary: 'Kisiyi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kisi bulunamadi.' })
  async updateContact(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateSupplierContactSchema)) body: UpdateSupplierContactBody,
  ): Promise<SupplierContactState> {
    // ⚠️ `supplierId` GOVDEDE YOKTUR (`updateSupplierContactSchema` `.strict()`):
    // kisi baska tedarikciye TASINAMAZ. Entity de repository de bunu ayrica
    // koruyor — uc katman degil, ayni kuralin uc yerde de OKUNABILIR olmasi.
    return this.useCases.updateContact({ id: params.id, changes: body });
  }

  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(SUPPLIER_CONTACT_DELETE)
  @ApiOperation({ summary: 'Kisiyi siler (gorusme kayitlari SILINMEZ)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'supplier_contact:delete yalnizca owner/admin.',
  })
  async removeContact(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<void> {
    // ⚠️ GORUSMELER YERINDE KALIR: `contact_id` `ON DELETE SET NULL` tasir
    // (§1.3). Ayrilan bir satin alma sorumlusunun silinmesi kurumsal hafizayi
    // goturseydi hata SESSIZ olurdu.
    await this.useCases.deleteContact(params.id);
  }

  /**
   * Gorusme kaydeder.
   *
   * ⚠️ `PATCH` ve `DELETE` KARSILIGI YOKTUR: gunluk EKLEME-YALNIZDIR (§1) ve
   * izin adi bu yuzden `create`tir, `write` DEGIL. Bir gunluk kaydi
   * duzeltilmez; yanlissa yenisi yazilir.
   */
  @Post('interactions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(SUPPLIER_INTERACTION_CREATE)
  @ApiOperation({ summary: 'Tedarikci gorusmesi kaydeder ve gomer' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Gorusme kaydedildi ve gomuldu.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Tarih gecersiz ya da metin sinir disi (SESSIZ KIRPMA YOK).',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description:
      'Gorusme KAYDEDILDI ancak indekslenemedi; govde acikca soyler ve /suppliers/reindex onarir.',
  })
  async createInteraction(
    @Body(new ZodValidationPipe(createSupplierInteractionSchema))
    body: CreateSupplierInteractionBody,
  ): Promise<SupplierInteractionState> {
    const principal = requireTenantPrincipal();

    return this.useCases.createInteraction({
      tenantId: principal.tenantId,
      userId: principal.userId,
      supplierId: body.supplierId,
      contactId: body.contactId ?? null,
      occurredOn: body.occurredOn,
      body: body.body,
    });
  }

  @Get('interactions')
  @RequirePermission(SUPPLIER_INTERACTION_READ)
  @ApiOperation({ summary: 'Gorusmeleri listeler (en yeni once)' })
  async listInteractions(
    @Query(new ZodValidationPipe(listSupplierInteractionsQuerySchema))
    query: ListSupplierInteractionsQuery,
  ): Promise<InteractionListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder.
    const page = await this.useCases.listInteractions({
      limit: query.limit,
      offset: query.offset,
      supplierId: query.supplierId ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  // ==========================================================================
  // TEDARIKCI — kok kaynak
  // ==========================================================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(SUPPLIER_WRITE)
  @ApiOperation({ summary: 'Tedarikci olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tedarikci kaydedildi.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Ayni vergi numarasi zaten kayitli (kucuk/buyuk harften bagimsiz).',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'supplier:write yalnizca owner/admin/member.',
  })
  async create(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierBody,
  ): Promise<SupplierState> {
    const principal = requireTenantPrincipal();

    // ⚠️ ORAN SINIRI PAYI ODENMEZ: bir tedarikci kaydi HICBIR embedding cagrisi
    // uretmez (anlamsal yuzey GORUSME GUNLUGUDUR).
    return this.useCases.createSupplier({
      tenantId: principal.tenantId,
      userId: principal.userId,
      fields: toSupplierFields(body),
    });
  }

  @Get()
  @RequirePermission(SUPPLIER_READ)
  @ApiOperation({ summary: 'Tedarikcileri listeler (ad / vergi no filtresi)' })
  async list(
    @Query(new ZodValidationPipe(listSuppliersQuerySchema)) query: ListSuppliersQuery,
  ): Promise<SupplierListResponse> {
    const page = await this.useCases.listSuppliers({
      limit: query.limit,
      offset: query.offset,
      search: query.search ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(SUPPLIER_READ)
  @ApiOperation({ summary: 'Tek tedarikciyi getirir' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Tedarikci bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SupplierState> {
    return this.useCases.getSupplier(params.id);
  }

  /**
   * KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil).
   *
   * ⚠️ CEVAP `staleAfterRename` TASIR ve bu bir susleme DEGILDIR: ad
   * degistiginde o tedarikcinin TUM gorusme vektorleri bayatlar (§6) cunku ad
   * BAGLAM BASLIGINDA ve AYRI BIR SATIRDA yasar.
   *
   * ⚠️ Vektorler BURADA yenilenmez: 200 gorusmesi olan bir tedarikcinin adini
   * duzeltmek 200 embedding cagrisi demekti ve oran siniri istegi ORTASINDA
   * keserdi (yarisi yeni, yarisi eski baslikli bir vektor kumesi: EN KOTU HAL).
   * Onarim ACIK ve BUTCELIDIR — bayrak, arayuzun `POST /suppliers/reindex`
   * onerisini gostermesi icin.
   *
   * ⚠️ ADR-0039'dan ayrildigimiz yer tam olarak budur: Stok'ta ad kalemin
   * KENDI satirindaydi ve bayatlama penceresi YOKTU.
   */
  @Patch(':id')
  @RequirePermission(SUPPLIER_WRITE)
  @ApiOperation({ summary: 'Tedarikciyi kismi gunceller' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Tedarikci bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Ayni vergi numarasi baska bir tedarikcide kayitli.',
  })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierBody,
  ): Promise<SupplierUpdateResult> {
    // Govde tipi ile `SupplierPatch` birebir ortusuyor (`null` = temizle,
    // `undefined` = dokunma); donusum GEREKMEZ.
    const changes: SupplierPatch = body;

    return this.useCases.updateSupplier({ id: params.id, changes });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ KISILER VE GORUSMELER DE GIDER (`ON DELETE CASCADE`, §1.3) — ve bu bir
   * KVKK GIRDISIDIR: vektor `interactions` satirinin KENDISINDE yasadigi icin
   * silinen bir tedarikci AI'IN HAFIZASINDAN DA silinir.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR; `supplier:delete`in ayri bir
   * izin olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(SUPPLIER_DELETE)
  @ApiOperation({ summary: 'Tedarikciyi siler (kisiler ve gorusmeler de gider)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'supplier:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.deleteSupplier(params.id);
  }
}

/** `nullish()` -> domain'in `null` sozlesmesi. */
function toSupplierFields(body: CreateSupplierBody): {
  name: string;
  taxNumber: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  paymentTerms: string | null;
} {
  return {
    name: body.name,
    taxNumber: body.taxNumber ?? null,
    category: body.category ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    website: body.website ?? null,
    address: body.address ?? null,
    paymentTerms: body.paymentTerms ?? null,
  };
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ ROL OKUNMAZ ve bu, onceki UC modulden AYRILDIGIMIZ YER: Randevu, Finans ve
 * Belge'nin yardimcilari `getTenantContext()?.role` okuyordu cunku bir
 * CROSS-MODUL DIZINE (`ContactDirectory` vb.) gecirilecekti — izin kapisi o
 * dizinin ICINDE calisir ve rolu imzasinda ACIKCA ister.
 *
 * Bu modulun HICBIR cross-modul bagimliligi YOKTUR (ADR-0040 §4), dolayisiyla
 * rolu okumak KULLANILMAYAN bir baglanti kurardi — ve okuyan biri bu modulun
 * bir cross-modul yuzeyi oldugunu sanirdi.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string } {
  const principal = getPrincipal();

  // ⚠️ YALNIZCA `tenantId` kontrol ediliyor: `userId` principal tipinde ZATEN
  // zorunludur (bir principal varsa kimligi de vardir). Onu da kontrol etmek
  // lint tarafindan "types have no overlap" ile reddedilir — ve hakli: olmayan
  // bir durumu savunmak, okuyana o durumun MUMKUN oldugunu soyler.
  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId };
}
