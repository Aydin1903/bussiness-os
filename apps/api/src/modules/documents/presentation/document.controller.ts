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
  Put,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type DocumentRow } from '../application/document.repository.port';
import { DocumentUseCases, type DocumentResult } from '../application/document.use-cases';
import { DOCUMENT_DELETE, DOCUMENT_READ, DOCUMENT_WRITE } from '../documents.permissions';
import { UnsupportedDocumentTypeError } from '../domain/documents.error';
import { DocumentsDomainExceptionFilter } from './documents-domain-exception.filter';
import {
  createDocumentSchema,
  idParamSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
  type CreateDocumentBody,
  type ListDocumentsQuery,
  type UpdateDocumentBody,
} from './documents.dto';

/**
 * Yuklenen dosyanin bu controller'in ihtiyac duydugu KADARI.
 *
 * ⚠️ `Express.Multer.File` TIPI KULLANILMIYOR ve bu bilincli: o tip disk
 * depolama alanlarini (`path`, `destination`) da tasir ve bu modul BELLEK
 * depolama kullanir (§5.3 — cikarim yuklemeden once, bellekte). Dar bir tip,
 * ileride biri `file.path` yazdiginda DERLEME HATASI verir.
 */
interface UploadedFileLike {
  readonly originalname: string;
  readonly buffer: Buffer;
}

interface DocumentListResponse {
  readonly items: readonly DocumentRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const REINDEX_DESCRIPTION =
  'Is listesi TURETILMISTIR (parcasi olmayan belgeler); ayri bir "onarilacaklar" tablosu ve ' +
  'deneme sayaci YOKTUR. Oran siniri yazma yoluyla AYNI kovayi PAYLASIR. ' +
  '⚠️ TARANMIS (metinsiz) belgeler her cagride yeniden denenir ve `repaired` sayilir: ' +
  'veritabani "parcasi yok" ile "parcasi OLAMAZ" arasindaki farki bilemez.';

const UPLOAD_DESCRIPTION =
  'multipart/form-data · `file` alani zorunlu. MIME turu ICERIKTEN tespit edilir ' +
  '(uzantiya ve Content-Type basligina GUVENILMEZ); yalnizca PDF ve DOCX kabul edilir. ' +
  '⚠️ Metni cikarilamayan (taranmis) bir belge 201 doner ve `chunkCount: 0` tasir — ' +
  'arayuz bunu GORUNUR KILMAK ZORUNDADIR, aksi halde kullanici belgesinin aranabilir ' +
  'olmadigini hic ogrenemez.';

/**
 * Belge uclari (ADR-0037 §10) — SEKIZ uc.
 *
 * ============================================================================
 * ⚠️ ROTA SIRASI: `POST reindex` `:id` ROTALARINDAN ONCE
 * ============================================================================
 * Bu controller `GET :id` tasiyor. `POST documents/reindex` bugun onunla
 * CATISMAZ (farkli HTTP metotlari) ama `POST :id` eklenirse catisirdi. Yine de
 * `reindex` ONE yazildi: `projects.module.ts`in ogrettigi ders, sirayi
 * hatirlamaya birakmamaktir.
 *
 * ============================================================================
 * ⚠️ AYRI BIR `document:download` IZNI YOK
 * ============================================================================
 * Indirme `document:read`e baglidir. Metadata'yi gorup icerigi indiremeyen bir
 * rol gercek bir koruma saglamaz: belge ADI icerigin cogunu zaten soyler ve
 * icerik `POST /ask` uzerinden ZATEN ayni izinle cevaba girer (§10).
 */
@ApiTags('documents')
@Controller({ path: 'documents', version: '1' })
@UseFilters(DocumentsDomainExceptionFilter)
export class DocumentController {
  constructor(private readonly useCases: DocumentUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(DOCUMENT_WRITE)
  // ⚠️ BELLEK DEPOLAMA (varsayilan): dosya diske YAZILMAZ. Gerekce §5.3'un
  // sirasidir — MIME tespiti ve metin cikarimi R2'ye yazmadan ONCE, bellekte
  // yapilir; boylece reddedilen hicbir dosya depoya girmez.
  //
  // ⚠️ BOYUT SINIRI BURADA ZORLANMIYOR, DOMAINDE ZORLANIYOR. Multer'in `limits`
  // secenegi kendi hatasini firlatir ve o hata bu modulun filtresinden GECMEZ
  // (`DocumentsDomainError` degildir) — kullanici 413 yerine islenmemis bir 500
  // alirdi. Sinir tek yerde: `DocumentTooLargeError`.
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Belge yukler', description: UPLOAD_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Belge kaydedildi.' })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, description: 'Yalnizca PDF/DOCX.' })
  @ApiResponse({ status: HttpStatus.PAYLOAD_TOO_LARGE, description: 'Dosya cok buyuk.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Belge cok uzun.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async create(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocumentBody,
  ): Promise<DocumentResult> {
    const principal = requireTenantPrincipal();

    return this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      // ROL cross-modul dizinlere gecirilir: izin kapilari ONLARIN icinde
      // (§4). Controller hangi izinlere bakildigini BILMEZ.
      role: principal.role,
      file: requireUploadedFile(file),
      // Zod `undefined` uretir ("verilmedi"); domain "bagli degil"i `null` ile
      // ifade eder.
      label: body.label ?? null,
      crmContactId: body.contactId ?? null,
      projectId: body.projectId ?? null,
    });
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DOCUMENT_WRITE)
  @ApiOperation({ summary: 'Parcasiz belgeleri onarir', description: REINDEX_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();

    return this.useCases.reindex({
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
  }

  @Get()
  @RequirePermission(DOCUMENT_READ)
  @ApiOperation({ summary: 'Belgeleri listeler (etiket / kisi / proje filtresi)' })
  async list(
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery,
  ): Promise<DocumentListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder.
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      label: query.label ?? null,
      crmContactId: query.contactId ?? null,
      projectId: query.projectId ?? null,
      role: requireTenantPrincipal().role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(DOCUMENT_READ)
  @ApiOperation({ summary: 'Belge detayi (cozulmus adlar + parca sayisi)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Belge bulunamadi.' })
  async getOne(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<DocumentRow> {
    return this.useCases.getById({ id: params.id, role: requireTenantPrincipal().role });
  }

  /**
   * Dosyayi indirir — SUNUCU UZERINDEN AKIS (ADR-0037 §5.4).
   *
   * ⚠️ IMZALI (presigned) URL URETILMEZ: erisim karari ADR-0025'in policy
   * engine'inden cikip bir DIZEYE devredilirdi ve o dize paylasilabilir olurdu.
   * R2'de egress ucretsiz oldugu icin aradan gecmenin bedeli bant genisligi
   * degil SUNUCU ZAMANIDIR — ve akis sabit bellekte calisir.
   *
   * ⚠️ Anahtar VERITABANINDAN gelir, istemciden DEGIL: nesne deposunda RLS
   * yoktur ve izolasyonun tek dayanagi anahtarin onekidir (§5.2).
   */
  @Get(':id/content')
  @RequirePermission(DOCUMENT_READ)
  @ApiOperation({ summary: 'Belgenin kendisini indirir (akis)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Belge bulunamadi.' })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Belge deposuna ulasilamadi.' })
  async download(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { document, body } = await this.useCases.download(params.id);

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Length', String(document.sizeBytes));
    // ⚠️ Dosya adi RFC 5987 ile kodlanir: `original_filename` Turkce karakter
    // ve bosluk tasiyabilir (kolonda OLDUGU GIBI saklanir — yalnizca ANAHTAR
    // temizlenir). Ham yazilsaydi baslik bozulur ve bazi istemciler dosyayi
    // adsiz kaydederdi.
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
    );

    // ⚠️ HAM `Readable` DONDURULEMEZ — `StreamableFile` ZORUNLU.
    //
    // Ilk yazimda akis dogrudan donduruluyordu ve NestJS onu bir GOVDE nesnesi
    // sanip serilestirmeye calisiyordu: sonuc **islenmemis 500**di. Kapanis
    // denetiminde gercek bir indirme istegiyle gorundu (birim testleri
    // controller'i bu yoldan gecirmiyordu).
    //
    // ⚠️ Hata SESSIZ DEGIL ama YANILTICIYDI: 500'un govdesi global filtre
    // tarafindan maskeleniyor (dogru davranis), yani logta da "beklenmeyen
    // hata"dan baska bir sey yazmiyordu.
    return new StreamableFile(body);
  }

  /**
   * KISMI metadata guncellemesi — DOSYA DEGISMEZ.
   *
   * ⚠️ ETIKET DEGISIRSE PARCALAR YENIDEN URETILIR (§8.1) ve oran siniri payi
   * ODENIR: etiket baglam basliginin parcasidir ve degisimi gormezden gelmek,
   * aramanin ESKI etiketi gormesi demekti.
   */
  @Patch(':id')
  @RequirePermission(DOCUMENT_WRITE)
  @ApiOperation({ summary: 'Belge metadata sini kismi gunceller (etiket / baglantilar)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Belge bulunamadi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: UpdateDocumentBody,
  ): Promise<DocumentResult> {
    const principal = requireTenantPrincipal();

    // ⚠️ `contactId` -> `crmContactId` ADI DEGISIYOR ve `null` KORUNUYOR:
    // `?? null` yazilsaydi `undefined` ("dokunma") sessizce `null`a
    // ("baglantiyi kaldir") donerdi — kullanici yalnizca etiketi guncellerken
    // baglantisini KAYBEDERDI ve hata sessiz olurdu.
    const { contactId, ...rest } = body;

    return this.useCases.update({
      id: params.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      changes: {
        ...rest,
        ...(contactId === undefined ? {} : { crmContactId: contactId }),
      },
    });
  }

  /**
   * Dosyayi degistirir — VERSIYON ACMAZ (ADR-0037 §7).
   *
   * Eski nesne silinir, parcalar TUMUYLE yeniden uretilir. ⚠️ Eski dosya GERI
   * GETIRILEMEZ.
   *
   * ⚠️ `PATCH :id`DEN AYRI BIR UC: JSON ve `multipart` govdelerini tek
   * dogrulama semasinda birlestirmek gerekirdi, ustelik yan etkileri taban
   * tabana zit (bir kolon vs. bir dosya + tum parcalar).
   */
  @Put(':id/file')
  @RequirePermission(DOCUMENT_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Belgenin dosyasini degistirir (versiyon acmaz)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Belge bulunamadi.' })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, description: 'Yalnizca PDF/DOCX.' })
  async replaceFile(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<DocumentResult> {
    const principal = requireTenantPrincipal();

    return this.useCases.replaceFile({
      id: params.id,
      tenantId: principal.tenantId,
      userId: principal.userId,
      file: requireUploadedFile(file),
    });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Silme GERI ALINAMAZ ve bu modulde IKI KAT agirdir: DB satiri gider,
   * R2'deki NESNE de gider ve DENETIM IZI YOKTUR (§1). `document:delete`in ayri
   * bir izin olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(DOCUMENT_DELETE)
  @ApiOperation({ summary: 'Belgeyi siler (DB satiri + parcalar + nesne)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'document:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * Dosya alani ZORUNLUDUR.
 *
 * ⚠️ `UnsupportedDocumentTypeError` FIRLATILIYOR (415), genel bir 422 degil:
 * dosyasiz bir yukleme istegi, tur olarak desteklenmeyen bir govdeyle AYNI
 * sinifta — istemciye "govdeni duzelt" degil "bir dosya sec" demek gerekir.
 * Ayrica bu hata modulun filtresinden GECER; `BadRequestException` gecmezdi ve
 * govde bicimi RFC 7807 disina cikardi.
 */
function requireUploadedFile(file: UploadedFileLike | undefined): {
  originalFilename: string;
  bytes: Buffer;
} {
  if (file === undefined) {
    throw new UnsupportedDocumentTypeError();
  }

  return { originalFilename: file.originalname, bytes: file.buffer };
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ ROL principal'da DEGIL, TENANT CONTEXT'tedir: principal "kimsin"
 * sorusunu, tenant context "bu sirkette nesin" sorusunu cevaplar.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  const role = getTenantContext()?.role;

  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
