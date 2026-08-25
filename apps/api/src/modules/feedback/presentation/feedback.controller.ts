import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { FeedbackUseCases, type FeedbackResponseRow } from '../application/feedback.use-cases';
import { FEEDBACK_CREATE, FEEDBACK_DELETE, FEEDBACK_READ } from '../feedback.permissions';
import { FeedbackDomainExceptionFilter } from './feedback-domain-exception.filter';
import {
  createFeedbackSchema,
  idParamSchema,
  listFeedbackQuerySchema,
  reindexFeedbackSchema,
  type CreateFeedbackBody,
  type ListFeedbackQuery,
} from './feedback.dto';

/**
 * Geri bildirim uclari (ADR-0045 §1, §2, §5, §8).
 *
 * ============================================================================
 * ⚠️ `PATCH` UCU YOKTUR — VE BU BIR EKSIK DEGIL (§2)
 * ============================================================================
 * Kayit GUNCELLENMEZ. Izin adi bu yuzden `feedback:create`tir, `write` DEGIL;
 * entity'de `update`, repository'de `update` yoktur; ve migration `0037`
 * veritabani seviyesinde yalnizca `embedding` kolonuna `UPDATE` verir.
 *
 * Gerekce projede ILK KEZ VERI SAHIPLIGI uzerinden kuruluyor: bir geri bildirim
 * BIZIM SOZUMUZ DEGIL, bir UCUNCU KISININ beyanidir. Musterinin soyledigini
 * "duzeltmek" hafizaya bir YALAN yazmaktir; ustelik ortalama ve dusuk puan
 * sayisi bu satirlardan TURETILIR (ADR-0039'un olcutu).
 *
 * ⚠️ AMA `DELETE` VARDIR ve bu, `SupplierController`den AYRILDIGIMIZ TEK NOKTA:
 * gerekce kolaylik degil KVKK'dir (§2.2).
 *
 * ============================================================================
 * ⚠️ TEK CONTROLLER + SABIT YOLLAR `:id`DEN ONCE — ROTA GOLGELEMESI
 * ============================================================================
 * Modulun kok rotasi (`feedback`) AYNI ZAMANDA ana kaynagin adidir; `reindex`
 * ayri bir controller'da dursaydi `POST /feedback/reindex` istegi
 * `GET /feedback/:id` ile YARISIRDI ve kazanani `controllers: []` dizisindeki
 * KAYIT SIRASI belirlerdi.
 *
 * ADR-0040'in dersi: o siraya guvenmek bir tuzaktir. Nest, AYNI controller
 * icinde metotlari TANIMLANMA SIRASINA gore eslestirir; sira bu dosyada
 * GORULEBILIR ve bir birim testi onu kilitler.
 *
 * ⚠️ Yeni bir sabit yol eklenecekse `:id` GRUBUNDAN ONCE eklenmelidir.
 */
interface FeedbackListResponse {
  readonly items: readonly FeedbackResponseRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const REINDEX_DESCRIPTION =
  'Vektoru eksik AMA YORUMU OLAN kayitlari yeniden gomer — is listesi TURETILMISTIR ' +
  '(`embedding IS NULL AND comment IS NOT NULL`), ayri bir "onarilacaklar" tablosu YOKTUR. ' +
  '⚠️ Ikinci yuklem SART: yorumsuz kayitlar KALICI OLARAK vektorsuzdur (gomulecek metin yok) ' +
  've suzulmeselerdi onarim yuvalarini kalici olarak isgal ederlerdi. ' +
  '⚠️ Tedarikci modulunun IKINCI isi (BAYAT baslik onarimi) BURADA YOKTUR: basligin uc bileseni ' +
  'de (tarih · puan · kanal) DEGISTIRILEMEZ, yani bu modulde BAYATLAMA PENCERESI YOK. ' +
  'Oran siniri yazma yoluyla AYNI kovayi PAYLASIR.';

@ApiTags('feedback')
@Controller({ path: 'feedback', version: '1' })
@UseFilters(FeedbackDomainExceptionFilter)
export class FeedbackController {
  constructor(private readonly useCases: FeedbackUseCases) {}

  // ==========================================================================
  // SABIT YOLLAR — `:id` grubundan ONCE (bkz. sinif yorumu)
  // ==========================================================================

  /**
   * Vektorleri onarir (ADR-0045 §8).
   *
   * ⚠️ IZIN `feedback:create` — YENI BIR IZIN ISTENMEDI. Yaptigi is var olan
   * kayitlarin ARAMA INDEKSINI onarmaktir; `member` de calistirabilir ve bu
   * dogrudur: kendi girdigi geri bildirimin indekslenmemis olmasi onun
   * sorunudur.
   *
   * ⚠️ `feedback:delete` ISTENMEZ ve istenmemeli: onarim hicbir sey silmez.
   */
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(FEEDBACK_CREATE)
  @ApiOperation({ summary: 'Geri bildirim vektorlerini onarir', description: REINDEX_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(
    @Body(new ZodValidationPipe(reindexFeedbackSchema)) _body: unknown,
  ): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();

    return this.useCases.reindex({
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
  }

  // ==========================================================================
  // GERI BILDIRIM — kok kaynak
  // ==========================================================================

  /**
   * Geri bildirim kaydeder ve (yorumu varsa) gomer.
   *
   * ⚠️ `PATCH` KARSILIGI YOKTUR (§2) ve izin adi bu yuzden `create`tir.
   *
   * ⚠️ ORAN SINIRI PAYI KOSULLU ODENIR: yorumsuz bir kayit saglayiciya HIC
   * GITMEZ ve paydan DUSMEZ (§8). Tedarikci'de kosulsuzdu cunku orada metin
   * ZORUNLUYDU.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(FEEDBACK_CREATE)
  @ApiOperation({ summary: 'Geri bildirim kaydeder (yorumu varsa gomer)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Geri bildirim kaydedildi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Puan olcek disi, zaman gecersiz ya da metin sinir disi (SESSIZ KIRPMA YOK).',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Bagli musteri kisisi bulunamadi (ya da contact:read yok).',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description:
      'Kayit KAYDEDILDI ancak indekslenemedi; govde acikca soyler ve /feedback/reindex onarir.',
  })
  async create(
    @Body(new ZodValidationPipe(createFeedbackSchema)) body: CreateFeedbackBody,
  ): Promise<FeedbackResponseRow> {
    const principal = requireTenantPrincipal();

    return this.useCases.createResponse({
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      rating: body.rating,
      // `nullish()` -> `null | undefined`; domain "girilmedi"yi `null` ile
      // ifade eder.
      comment: body.comment ?? null,
      channel: body.channel ?? null,
      crmContactId: body.crmContactId ?? null,
      receivedAt: new Date(body.receivedAt),
    });
  }

  @Get()
  @RequirePermission(FEEDBACK_READ)
  @ApiOperation({ summary: 'Geri bildirimleri listeler (en yeni once, puan bandi filtresi)' })
  async list(
    @Query(new ZodValidationPipe(listFeedbackQuerySchema)) query: ListFeedbackQuery,
  ): Promise<FeedbackListResponse> {
    const principal = requireTenantPrincipal();

    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder.
    const page = await this.useCases.listResponses({
      limit: query.limit,
      offset: query.offset,
      minRating: query.minRating ?? null,
      maxRating: query.maxRating ?? null,
      role: principal.role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(FEEDBACK_READ)
  @ApiOperation({ summary: 'Tek geri bildirimi getirir' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Geri bildirim bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<FeedbackResponseRow> {
    const principal = requireTenantPrincipal();

    return this.useCases.getResponse({ id: params.id, role: principal.role });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ============================================================================
   * ⚠️ BU UC BIR KOLAYLIK DEGIL, BIR YUKUMLULUKTUR (§2.2)
   * ============================================================================
   * `SupplierController`da bir `DELETE /suppliers/interactions/:id` YOKTU ve
   * olmamasi dogruydu. Burada VAR: bir yorum KISISEL VERI ICEREBILIR (ad,
   * telefon, sikayet detayi) ve veri sahibinin SILME TALEBI HAKKI vardir
   * (KVKK m.7 / m.11). Silme yolu olmayan bir tablo o talebi KARSILAYAMAZDI.
   *
   * ⚠️ VEKTOR DE GIDER: `embedding` satirin KENDI kolonunda yasar (§1.2), yani
   * silinen bir geri bildirim AI'IN HAFIZASINDAN DA silinir. Chunk tablosu
   * baska bir semada olsaydi bu cascade YAZILAMAZDI (ADR-0031 §7'nin ayni
   * gerekcesi, SEKIZINCI uygulama).
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR; `feedback:delete`in ayri bir
   * izin olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(FEEDBACK_DELETE)
  @ApiOperation({ summary: 'Geri bildirimi siler (KVKK silme talebi — vektor de gider)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Geri bildirim bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'feedback:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.deleteResponse(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ ROL DE OKUNUYOR ve bu, ADR-0040'tan (Tedarikci) AYRILDIGIMIZ YER: orada
 * modulun HICBIR cross-modul bagimliligi yoktu ve rolu okumak KULLANILMAYAN bir
 * baglanti kurardi. Burada rol bir CROSS-MODUL DIZINE (`ContactDirectory`)
 * gecirilir — izin kapisi o dizinin ICINDE calisir ve rolu imzasinda ACIKCA
 * ister (Randevu, Finans ve Belge'nin ayni deseni).
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  const role = getTenantContext()?.role;

  // ⚠️ YALNIZCA `tenantId` ve `role` kontrol ediliyor: `userId` principal
  // tipinde ZATEN zorunludur (bir principal varsa kimligi de vardir). Onu da
  // kontrol etmek lint tarafindan "types have no overlap" ile reddedilir — ve
  // hakli: olmayan bir durumu savunmak, okuyana o durumun MUMKUN oldugunu
  // soyler.
  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
