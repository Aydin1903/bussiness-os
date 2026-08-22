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
  Res,
  StreamableFile,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type ListPage } from '../application/invoicing.repository.port';
import { InvoicingUseCases, type SalesDocumentView } from '../application/invoicing.use-cases';
import { type SalesDocumentKind, type SalesDocumentState } from '../domain/sales-document.entity';
import { type SalesDocumentLineFields } from '../domain/sales-document-line.entity';
import {
  INVOICE_DELETE,
  INVOICE_READ,
  INVOICE_WRITE,
  QUOTE_DELETE,
  QUOTE_READ,
  QUOTE_WRITE,
} from '../invoicing.permissions';
import { InvoicingDomainExceptionFilter } from './invoicing-domain-exception.filter';
import {
  createInvoiceSchema,
  createQuoteSchema,
  decideQuoteSchema,
  idParamSchema,
  listQuerySchema,
  updateInvoiceSchema,
  updateQuoteSchema,
  type CreateInvoiceBody,
  type CreateQuoteBody,
  type DecideQuoteBody,
  type LineBody,
  type ListQuery,
  type UpdateInvoiceBody,
  type UpdateQuoteBody,
} from './invoicing.dto';

/**
 * Teklif / Fatura uclari (ADR-0041 §1, §2, §3, §6, §9).
 *
 * ============================================================================
 * ⚠️ TEK CONTROLLER, IKI KAYNAK — VE ROTA GOLGELEMESI RISKI YOK
 * ============================================================================
 * ADR-0040'in en sessiz riski `/suppliers/contacts`in `:id` sanilmasiydi: orada
 * modulun KOK ROTASI ayni zamanda ana kaynagin adiydi. Burada oyle DEGIL —
 * `/invoicing` altinda DOGRUDAN bir `:id` rotasi YOKTUR; her sey `quotes/` ya
 * da `invoices/` altindadir.
 *
 * ⚠️ Yine de kural korunuyor: bir gun `GET /invoicing/:id` eklenirse `quotes`
 * ve `invoices` bir UUID sanilir, 422 doner ve HICBIR TEST KIRMIZI YANMAZ. Bu
 * yuzden kok altinda parametreli rota ACILMAZ.
 *
 * ============================================================================
 * ⚠️ IKI KAYNAK, IKI IZIN — AMA TEK TABLO (§1.1, §9)
 * ============================================================================
 * `quote:*` ve `invoice:*` AYRI izinlerdir: bir satis temsilcisinin teklif
 * yazip fatura kesmemesi mesru bir istektir. Ucler ayri oldugu icin guard
 * STATIK kalir — `kind` kolonuna bakan (ABAC'a kayan) bir kontrol YOKTUR.
 */
interface DocumentListResponse {
  readonly items: readonly SalesDocumentState[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('invoicing')
@Controller({ path: 'invoicing', version: '1' })
@UseFilters(InvoicingDomainExceptionFilter)
export class InvoicingController {
  constructor(private readonly useCases: InvoicingUseCases) {}

  // ==========================================================================
  // TEKLIF
  // ==========================================================================

  @Post('quotes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(QUOTE_WRITE)
  @ApiOperation({ summary: 'Teklif taslagi olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Teklif kaydedildi (taslak).' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Tarih/tutar gecersiz ya da satir sayisi sinir disi (SESSIZ KIRPMA YOK).',
  })
  async createQuote(
    @Body(new ZodValidationPipe(createQuoteSchema)) body: CreateQuoteBody,
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.createDocument({
      tenantId: principal.tenantId,
      userId: principal.userId,
      kind: 'quote',
      fields: {
        customerName: body.customerName,
        companyId: body.companyId ?? null,
        contactId: body.contactId ?? null,
        issuedOn: body.issuedOn,
        validUntil: body.validUntil ?? null,
        dueOn: null,
        currency: body.currency,
        notes: body.notes ?? null,
      },
      lines: body.lines.map(toLineFields),
    });
  }

  @Get('quotes')
  @RequirePermission(QUOTE_READ)
  @ApiOperation({ summary: 'Teklifleri listeler (en yeni once)' })
  async listQuotes(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<DocumentListResponse> {
    return toListResponse(
      await this.useCases.listDocuments({
        kind: 'quote',
        // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri
        // `undefined`" demektir; port "filtre yok"u `null` ile ifade eder.
        status: query.status ?? null,
        limit: query.limit,
        offset: query.offset,
      }),
      query,
    );
  }

  @Get('quotes/:id')
  @RequirePermission(QUOTE_READ)
  @ApiOperation({ summary: 'Tek teklifi getirir (kalemler + TURETILMIS toplamlar)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Teklif bulunamadi.' })
  async getQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    return this.useCases.getDocument({ id: params.id, kind: 'quote', role: requireRole() });
  }

  /**
   * KISMI guncelleme — YALNIZCA TASLAK (§2).
   *
   * ⚠️ `lines` verilirse satirlar BUTUN OLARAK degisir. Gonderilmis bir teklifte
   * 409 doner ve bu, korumanin IKINCI katmanidir; ucuncusu VERITABANI
   * TRIGGER'IDIR (kalemler ayri tabloda).
   */
  @Patch('quotes/:id')
  @RequirePermission(QUOTE_WRITE)
  @ApiOperation({ summary: 'Teklif taslagini kismi gunceller' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Gonderilmis teklif DEGISTIRILEMEZ (durum draft degil).',
  })
  async updateQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateQuoteSchema)) body: UpdateQuoteBody,
  ): Promise<SalesDocumentView> {
    const { lines, ...changes } = body;

    return this.useCases.updateDocument({
      id: params.id,
      kind: 'quote',
      changes,
      lines: lines === undefined ? null : lines.map(toLineFields),
      role: requireRole(),
    });
  }

  @Delete('quotes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(QUOTE_DELETE)
  @ApiOperation({ summary: 'Teklif TASLAGINI siler' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Gonderilmis teklif SILINEMEZ; dogru karsiligi rejected durumudur.',
  })
  async deleteQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<void> {
    await this.useCases.deleteDocument({ id: params.id, kind: 'quote' });
  }

  /**
   * Teklifi GONDERILDI olarak isaretler ve NUMARASINI verir (§1.6).
   *
   * ⚠️ SISTEM E-POSTA ATMAZ (§12): `sent`, kullanicinin BEYANIDIR — _"bu belgeyi
   * musteriye ilettim"_. PDF'i indirmek kullanicinin isidir.
   */
  @Post('quotes/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(QUOTE_WRITE)
  @ApiOperation({ summary: 'Teklifi gonderildi isaretler (numara URETILIR)' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Kalemsiz belge gonderilemez ya da durum gecisi gecersiz.',
  })
  async sendQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.releaseDocument({
      id: params.id,
      kind: 'quote',
      userId: principal.userId,
      role: requireRole(),
    });
  }

  /**
   * Teklifin sonucunu isaretler.
   *
   * ⚠️ AKTORU DAMGALAR (§8.2): "kabul edildi"yi kimin, ne zaman isaretledigi
   * satirin uzerinde durur. Bu bir DENETIM IZI DEGILDIR — bir olay gunlugu
   * "ne oldu"yu sirasiyla anlatir, damga yalnizca SON DURUMU soyler.
   */
  @Post('quotes/:id/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(QUOTE_WRITE)
  @ApiOperation({ summary: 'Teklifi kabul/red olarak isaretler' })
  async decideQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(decideQuoteSchema)) body: DecideQuoteBody,
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.decideQuote({
      id: params.id,
      outcome: body.outcome,
      userId: principal.userId,
      role: requireRole(),
    });
  }

  /**
   * Kabul edilmis teklifi YENI BIR FATURA TASLAGINA donusturur (§3).
   *
   * ⚠️ TEKLIFE TEK KOLON YAZILMAZ; ok FATURA -> TEKLIF.
   * ⚠️ IZIN `invoice:write` — yeni kayit bir FATURADIR. `quote:read` de gerekir
   * ama guard tek izin tasir; teklifi okuma yolu zaten `quote:read` kapisindan
   * gecmis olmayabilir, bu yuzden IKINCI bir kapi EKLENMEDI: donusturme bir
   * FATURA YAZMA eylemidir ve kaynagi sunucunun kendi verisidir.
   */
  @Post('quotes/:id/convert')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(INVOICE_WRITE)
  @ApiOperation({ summary: 'Kabul edilen teklifi fatura taslagina donusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Yeni fatura taslagi olusturuldu.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Yalnizca KABUL EDILMIS teklif donusturulebilir.',
  })
  async convertQuote(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.convertQuoteToInvoice({
      quoteId: params.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: requireRole(),
    });
  }

  @Get('quotes/:id/pdf')
  @RequirePermission(QUOTE_READ)
  @ApiOperation({ summary: 'Teklifi PDF olarak URETIR (saklanmaz)' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'PDF uretilemedi; govde acikca soyler ve veri kaybolmaz.',
  })
  async quotePdf(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.#pdf({ id: params.id, kind: 'quote' }, response);
  }

  // ==========================================================================
  // FATURA
  // ==========================================================================

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(INVOICE_WRITE)
  @ApiOperation({ summary: 'Fatura taslagi olusturur (YASAL E-FATURA DEGIL)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Fatura taslagi kaydedildi.' })
  async createInvoice(
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceBody,
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.createDocument({
      tenantId: principal.tenantId,
      userId: principal.userId,
      kind: 'invoice',
      fields: {
        customerName: body.customerName,
        companyId: body.companyId ?? null,
        contactId: body.contactId ?? null,
        issuedOn: body.issuedOn,
        validUntil: null,
        dueOn: body.dueOn ?? null,
        currency: body.currency,
        notes: body.notes ?? null,
      },
      lines: body.lines.map(toLineFields),
    });
  }

  @Get('invoices')
  @RequirePermission(INVOICE_READ)
  @ApiOperation({ summary: 'Faturalari listeler (en yeni once)' })
  async listInvoices(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<DocumentListResponse> {
    return toListResponse(
      await this.useCases.listDocuments({
        kind: 'invoice',
        status: query.status ?? null,
        limit: query.limit,
        offset: query.offset,
      }),
      query,
    );
  }

  @Get('invoices/:id')
  @RequirePermission(INVOICE_READ)
  @ApiOperation({ summary: 'Tek faturayi getirir (kalemler + TURETILMIS toplamlar)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Fatura bulunamadi.' })
  async getInvoice(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    return this.useCases.getDocument({ id: params.id, kind: 'invoice', role: requireRole() });
  }

  @Patch('invoices/:id')
  @RequirePermission(INVOICE_WRITE)
  @ApiOperation({ summary: 'Fatura taslagini kismi gunceller' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Kesilmis fatura DEGISTIRILEMEZ (durum draft degil).',
  })
  async updateInvoice(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateInvoiceSchema)) body: UpdateInvoiceBody,
  ): Promise<SalesDocumentView> {
    const { lines, ...changes } = body;

    return this.useCases.updateDocument({
      id: params.id,
      kind: 'invoice',
      changes,
      lines: lines === undefined ? null : lines.map(toLineFields),
      role: requireRole(),
    });
  }

  @Delete('invoices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(INVOICE_DELETE)
  @ApiOperation({ summary: 'Fatura TASLAGINI siler' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Kesilmis fatura SILINEMEZ; dogru karsiligi cancelled durumudur.',
  })
  async deleteInvoice(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<void> {
    await this.useCases.deleteDocument({ id: params.id, kind: 'invoice' });
  }

  /** Faturayi KESER: numara URETILIR ve belge degistirilemez hale gelir (§2). */
  @Post('invoices/:id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(INVOICE_WRITE)
  @ApiOperation({ summary: 'Faturayi keser (numara URETILIR, belge DONAR)' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Kalemsiz fatura kesilemez ya da durum gecisi gecersiz.',
  })
  async issueInvoice(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.releaseDocument({
      id: params.id,
      kind: 'invoice',
      userId: principal.userId,
      role: requireRole(),
    });
  }

  /** ⚠️ SATIR DURUR, SILINMEZ — numarasi da durur (§1.6). */
  @Post('invoices/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(INVOICE_WRITE)
  @ApiOperation({ summary: 'Kesilmis faturayi iptal eder (satir DURUR)' })
  async cancelInvoice(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<SalesDocumentView> {
    const principal = requireTenantPrincipal();

    return this.useCases.cancelInvoice({
      id: params.id,
      userId: principal.userId,
      role: requireRole(),
    });
  }

  @Get('invoices/:id/pdf')
  @RequirePermission(INVOICE_READ)
  @ApiOperation({ summary: 'Faturayi PDF olarak URETIR (saklanmaz)' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'PDF uretilemedi; govde acikca soyler ve veri kaybolmaz.',
  })
  async invoicePdf(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.#pdf({ id: params.id, kind: 'invoice' }, response);
  }

  /**
   * ⚠️ `StreamableFile` DONER, ham `Buffer` DEGIL.
   *
   * ADR-0037'nin kapanis denetiminin bulduğu kusur: ham bir akis/govde
   * dondurmek NestJS'te ISLENMEMIS 500 uretiyordu. Ayni tuzak burada da
   * gecerlidir ve bir entegrasyon testi bunu kilitler.
   */
  async #pdf(
    input: { id: string; kind: SalesDocumentKind },
    response: Response,
  ): Promise<StreamableFile> {
    const { filename, bytes } = await this.useCases.renderPdf({
      ...input,
      role: requireRole(),
    });

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(bytes.byteLength));
    // ⚠️ RFC 5987: dosya adi Turkce karakter tasiyabilir (`teklif-TKF-000001`
    // tasimaz ama tur onekleri degisebilir). Ham yazilsaydi bazi istemciler
    // dosyayi adsiz kaydederdi.
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    return new StreamableFile(bytes);
  }
}

/** `nullish()` -> domain'in `null` sozlesmesi. */
function toLineFields(line: LineBody): SalesDocumentLineFields {
  return {
    description: line.description,
    quantity: typeof line.quantity === 'number' ? String(line.quantity) : line.quantity,
    unit: line.unit ?? null,
    unitPrice: typeof line.unitPrice === 'number' ? String(line.unitPrice) : line.unitPrice,
    // ⚠️ Varsayilan `'0'`: oran yazmayi UNUTAN bir istemcinin belgeye rastgele
    // bir vergi eklemesi mumkun olmamali.
    taxRate:
      line.taxRate === undefined
        ? '0'
        : typeof line.taxRate === 'number'
          ? String(line.taxRate)
          : line.taxRate,
  };
}

function toListResponse(
  page: ListPage<SalesDocumentState>,
  query: ListQuery,
): DocumentListResponse {
  return { ...page, limit: query.limit, offset: query.offset };
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId };
}

/**
 * Cagiranin bu tenant'taki rolu — CROSS-MODUL DIZINE gecirilir (§7.1).
 *
 * ⚠️ ROL OKUNUYOR ve Tedarikci'den AYRILDIGIMIZ yer burasi: o modulun hicbir
 * cross-modul bagimliligi yoktu. Burada `CompanyDirectory` ve
 * `ContactDirectory` cagriliyor ve izin kapisi O ARAYUZLERIN ICINDE calisiyor —
 * rolu IMZASINDA ACIKCA istiyorlar. Randevu / Finans / Belge ile ayni desen,
 * DORDUNCU kez.
 */
function requireRole(): string {
  const role = getTenantContext()?.role;

  if (role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return role;
}
