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
import { type ListPage, type StockItemRow } from '../application/inventory.repository.port';
import { InventoryUseCases } from '../application/inventory.use-cases';
import { type StockItemPatch, type StockItemState } from '../domain/stock-item.entity';
import { type StockMovementState } from '../domain/stock-movement.entity';
import {
  STOCK_ITEM_DELETE,
  STOCK_ITEM_READ,
  STOCK_ITEM_WRITE,
  STOCK_MOVEMENT_READ,
  STOCK_MOVEMENT_WRITE,
} from '../inventory.permissions';
import { InventoryDomainExceptionFilter } from './inventory-domain-exception.filter';
import {
  createCountSchema,
  createMovementSchema,
  createStockItemSchema,
  idParamSchema,
  listItemsQuerySchema,
  listMovementsQuerySchema,
  updateStockItemSchema,
  type CreateCountBody,
  type CreateMovementBody,
  type CreateStockItemBody,
  type ListItemsQuery,
  type ListMovementsQuery,
  type UpdateStockItemBody,
} from './inventory.dto';

/**
 * Stok / Envanter uclari (ADR-0039 §8).
 *
 * ============================================================================
 * ⚠️ HAREKET ICIN `PATCH` VE `DELETE` UCU YOKTUR — VE BU BIR EKSIK DEGIL
 * ============================================================================
 * Defter DEGISTIRILEMEZ (ADR-0039 §3.3). Bir hareketin duzeltilmesi TERS YONDE
 * bir hareket yazmakla olur; fiziksel sayim akisi (`POST /inventory/counts`)
 * bunu otomatik yapar.
 *
 * Koruma UC KATMANLIDIR: `StockMovement`ta `update` yok · `stock_movement:delete`
 * izni yok · `movements -> items ON DELETE RESTRICT`. Bu controller ucuncusunun
 * degil BIRINCISININ yuzudur: olmayan bir uc yanlislikla cagrilamaz.
 *
 * ============================================================================
 * ⚠️ ROTA SIRASI: SABIT YOLLAR `:id`DEN ONCE
 * ============================================================================
 * `POST items/reindex` ve `POST counts`, `GET items/:id` ile CATISABILIRDI.
 * Bugun catismiyorlar (farkli HTTP metotlari / farkli kokler) ama sira yine de
 * dogru yazildi — `projects.module.ts`in ogrettigi ders: bir gun `POST
 * items/:id` eklenirse (ornegin "kalemi kopyala") `reindex` ondan ONCE durmak
 * ZORUNDA, aksi halde `reindex` bir UUID olmadigi icin 422 donerdi.
 */
const REINDEX_DESCRIPTION =
  'Is listesi TURETILMISTIR (`note IS NOT NULL AND embedding IS NULL`); ayri bir ' +
  '"onarilacaklar" tablosu ve deneme sayaci YOKTUR. Oran siniri yazma yoluyla AYNI kovayi ' +
  'PAYLASIR. ⚠️ Bu modulde onarimin TEK isi vardir (eksik vektoru uretmek): bayat ' +
  'denormalize ad sorunu YOKTUR, cunku ad ayni satirda yasar ve yeniden adlandirma ' +
  'embedding i AYNI ISLEMDE tazeler (ADR-0039 §6.2).';

const COUNT_DESCRIPTION =
  'FIZIKSEL SAYIM: kullanici SAYDIGI mutlak miktari gonderir, farki SUNUCU hesaplar ' +
  '(`SELECT ... FOR UPDATE` ile tek transaction icinde). ⚠️ Delta yi istemciye ' +
  'hesaplatmak YASAKTIR: istemcinin okudugu miktar ile yazdigi an arasinda bir hareket ' +
  'girerse duzeltme YANLIS olur ve hata SESSIZDIR. ⚠️ Fark sifirsa HICBIR SATIR ' +
  'YAZILMAZ (`adjusted: false`) — olmamis bir akisi deftere yazmak yalan olurdu.';

interface StockItemListResponse extends ListPage<StockItemRow> {
  readonly limit: number;
  readonly offset: number;
}

interface MovementListResponse extends ListPage<StockMovementState> {
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('inventory')
@Controller({ path: 'inventory', version: '1' })
@UseFilters(InventoryDomainExceptionFilter)
export class InventoryController {
  constructor(private readonly useCases: InventoryUseCases) {}

  // ==========================================================================
  // Kalem tanimi
  // ==========================================================================

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(STOCK_ITEM_WRITE)
  @ApiOperation({ summary: 'Stok kalemi olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Kalem kaydedildi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ayni SKU zaten var (harf duyarsiz).' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Ad/birim/miktar gecersiz, not cok uzun ya da govdede taninmayan alan var.',
  })
  async createItem(
    @Body(new ZodValidationPipe(createStockItemSchema)) body: CreateStockItemBody,
  ): Promise<StockItemState> {
    const principal = requireTenantPrincipal();

    return this.useCases.createItem({
      tenantId: principal.tenantId,
      userId: principal.userId,
      fields: {
        name: body.name,
        sku: body.sku ?? null,
        unit: body.unit,
        // ⚠️ Sayi -> dize cevrimi BURADA: `domain` katmani HTTP'nin tasima
        // bicimini bilmez ama miktarin kanonik temsili DIZEDIR (§4.2).
        // `String(0)` -> `"0"` ve bu MESRUDUR (sifir esik = tukendiginde
        // haber ver); `?? null` ile karistirilmamali.
        minQuantity:
          body.minQuantity === undefined || body.minQuantity === null
            ? null
            : String(body.minQuantity),
        note: body.note ?? null,
        archivedAt: null,
      },
    });
  }

  /**
   * ⚠️ `POST items/reindex` — `POST items` ile catismaz (farkli yol), `:id` ile
   * catisabilirdi (gerekce sinif yorumunda).
   *
   * IZIN `stock_item:write` — YENI BIR IZIN ISTENMEDI. Yaptigi is var olan
   * kayitlarin ARAMA INDEKSINI onarmaktir, yeni bir kaynak turu degil.
   */
  @Post('items/reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(STOCK_ITEM_WRITE)
  @ApiOperation({
    summary: 'Vektoru eksik notlu kalemleri onarir',
    description: REINDEX_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();
    return this.useCases.reindex({ tenantId: principal.tenantId, userId: principal.userId });
  }

  @Get('items')
  @RequirePermission(STOCK_ITEM_READ)
  @ApiOperation({
    summary: 'Stok kalemlerini listeler — MIKTAR TURETILEREK',
    description:
      'Miktar `items` tablosunda SAKLANMAZ; her okumada `movements` toplanarak hesaplanir ' +
      '(ADR-0039 §2). ⚠️ `lowStockOnly` filtresi `HAVING` ile calisir ve INDEX KULLANAMAZ — ' +
      'kayitli bir bedeldir.',
  })
  async listItems(
    @Query(new ZodValidationPipe(listItemsQuerySchema)) query: ListItemsQuery,
  ): Promise<StockItemListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder.
    const page = await this.useCases.listItems({
      limit: query.limit,
      offset: query.offset,
      includeArchived: query.includeArchived,
      lowStockOnly: query.lowStockOnly,
      search: query.search ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get('items/:id')
  @RequirePermission(STOCK_ITEM_READ)
  @ApiOperation({ summary: 'Tek kalemi getirir (turetilmis miktariyla)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kalem bulunamadi.' })
  async getItem(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<StockItemRow> {
    return this.useCases.getItem(params.id);
  }

  /**
   * KISMI guncelleme — ARSIVLEME de buradan gecer.
   *
   * ⚠️ AD ya da SKU degisirse EMBEDDING YENIDEN URETILIR ve oran siniri payi
   * ODENIR (ADR-0039 §6.2): ikisi de BAGLAM BASLIGINA girer. Bu, "bayatlama
   * penceresi yok" kazancinin bedelidir.
   */
  @Patch('items/:id')
  @RequirePermission(STOCK_ITEM_WRITE)
  @ApiOperation({ summary: 'Kalemi kismi gunceller (arsivleme dahil)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kalem bulunamadi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ayni SKU zaten var.' })
  async updateItem(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateStockItemSchema)) body: UpdateStockItemBody,
  ): Promise<StockItemState> {
    // ⚠️ `archived` -> `archivedAt` DONUSUMU: govde bir BOOLEAN tasir (istemci
    // icin dogru sekil), domain bir ZAMAN tutar ("ne zaman arsivlendi" gercek
    // bir sorudur). Cevrim BURADA yapilir.
    //
    // ⚠️ `minQuantity` ve `sku` icin `?? null` YAZILMAZ: `undefined`
    // ("dokunma") sessizce `null`a ("kaldir") donerdi ve kullanici yalnizca adi
    // guncellerken ESIGINI KAYBEDERDI — alarm susar ve kimse fark etmez.
    const { archived, minQuantity, ...rest } = body;

    const changes: StockItemPatch = {
      ...rest,
      ...(minQuantity === undefined
        ? {}
        : { minQuantity: minQuantity === null ? null : String(minQuantity) }),
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    };

    const principal = requireTenantPrincipal();

    return this.useCases.updateItem({
      id: params.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      changes,
    });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ YALNIZCA HIC HAREKETI OLMAYAN KALEM SILINEBILIR (ADR-0039 §3.4).
   * Hareketi varsa VERITABANI reddeder (`ON DELETE RESTRICT`) ve cevap **409**
   * olur — mesaj dogru yolu (ARSIVLEME) soyler.
   */
  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(STOCK_ITEM_DELETE)
  @ApiOperation({ summary: 'Hareketi olmayan bir kalemi siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Kalemin hareketi var — silinemez, ARSIVLENMELIDIR.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'stock_item:delete yalnizca owner/admin.',
  })
  async deleteItem(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<void> {
    await this.useCases.deleteItem(params.id);
  }

  // ==========================================================================
  // Defter
  // ==========================================================================

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(STOCK_MOVEMENT_WRITE)
  @ApiOperation({
    summary: 'Stok hareketi yazar (giris / cikis)',
    description:
      '⚠️ Yazildiktan sonra DEGISTIRILEMEZ ve SILINEMEZ (ADR-0039 §3.3): bugunku miktar ' +
      'gecmisin tamamindan turetildigi icin gecmisi degistirmek BUGUNU sessizce yeniden ' +
      'yazardi. Telafi TERS YONDE bir hareket yazmaktir. ⚠️ Mevcuttan fazla cikis ' +
      'ENGELLENMEZ — negatif stok kayda gecer ve yapisal katkida ALARM olarak raporlanir.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Hareket yazildi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kalem bulunamadi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Kalem arsivlenmis.' })
  async createMovement(
    @Body(new ZodValidationPipe(createMovementSchema)) body: CreateMovementBody,
  ): Promise<StockMovementState> {
    const principal = requireTenantPrincipal();

    return this.useCases.recordMovement({
      tenantId: principal.tenantId,
      userId: principal.userId,
      itemId: body.itemId,
      direction: body.direction,
      quantity: String(body.quantity),
      // ⚠️ Varsayilan SUNUCU SAATI: `occurredAt` opsiyoneldir cunku cogu hareket
      // "simdi" olur. Gecmise tarihlemek MESRUDUR (dun gelen irsaliye).
      occurredAt: body.occurredAt === undefined ? new Date() : new Date(body.occurredAt),
      note: body.note ?? null,
    });
  }

  @Post('counts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(STOCK_MOVEMENT_WRITE)
  @ApiOperation({
    summary: 'Fiziksel sayim — farki SUNUCU hesaplar',
    description: COUNT_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Sayim islendi (duzeltme yazilmis olabilir).',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kalem bulunamadi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Kalem arsivlenmis.' })
  async createCount(
    @Body(new ZodValidationPipe(createCountSchema)) body: CreateCountBody,
  ): Promise<{ adjusted: boolean; quantity: string; movement: StockMovementState | null }> {
    const principal = requireTenantPrincipal();

    return this.useCases.recordCount({
      tenantId: principal.tenantId,
      userId: principal.userId,
      itemId: body.itemId,
      countedQuantity: String(body.countedQuantity),
      note: body.note ?? null,
    });
  }

  @Get('movements')
  @RequirePermission(STOCK_MOVEMENT_READ)
  @ApiOperation({ summary: 'Hareket defterini listeler (en yeniden eskiye)' })
  async listMovements(
    @Query(new ZodValidationPipe(listMovementsQuerySchema)) query: ListMovementsQuery,
  ): Promise<MovementListResponse> {
    const page = await this.useCases.listMovements({
      limit: query.limit,
      offset: query.offset,
      itemId: query.itemId ?? null,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ `AppointmentController`in yardimcisindan FARKLI: burada ROL OKUNMAZ cunku
 * bu modulun HICBIR cross-modul dizin cagrisi YOKTUR (ADR-0039 §9). Rol yalnizca
 * izin kapisi olan dizinler icin gerekiyordu; burada oyle bir dizin yok.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId };
}
