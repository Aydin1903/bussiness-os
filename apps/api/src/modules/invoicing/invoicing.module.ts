import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PdfKitPdfAdapter } from '../../infrastructure/pdf/pdfkit-pdf.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { ContextModule } from '../../platform/context/context.module';
import {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type RetrievalContributorRegistry,
} from '../../platform/context/context.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import { PDF_PORT, type PdfPort } from '../../shared/pdf.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { CrmModule } from '../crm/crm.module';
import {
  CRM_COMPANY_DIRECTORY,
  CRM_CONTACT_DIRECTORY,
  type CompanyDirectory,
  type ContactDirectory,
} from '../crm/crm.public';
import {
  INVOICING_REPOSITORY,
  type InvoicingRepository,
} from './application/invoicing.repository.port';
import { InvoicingUseCases } from './application/invoicing.use-cases';
import { DrizzleInvoicingRepository } from './infrastructure/drizzle-invoicing.repository';
import { InvoicingPipelineContributor } from './infrastructure/invoicing-pipeline.contributor';
import { INVOICING_PERMISSIONS } from './invoicing.permissions';
import { InvoicingController } from './presentation/invoicing.controller';

/**
 * Teklif / Fatura — Faz 5'in SEKIZINCI is modulu (ADR-0041).
 *
 * ROADMAP §3.5: _"Finans uzantisi — 3'e bagimli, ondan once gelemez."_
 *
 * ============================================================================
 * ⚠️ TEK YENI KENAR: `Teklif/Fatura -> CRM` (§7)
 * ============================================================================
 * `imports` listesinde TEK bir is modulu var: `CrmModule`. Ve `crm.public.ts`
 * BU ISTE TEK SATIR DEGISMEDI — iki dizin de zaten vardi (`CompanyDirectory`yi
 * Projeler, `ContactDirectory`yi Randevu yazdi). ADR-0037 §4.1'in kurali
 * (_"yeni TALIP -> dosya degismez; yeni KAYNAK TURU -> sahibi modul kendi
 * dizinini yazar"_) IKINCI kez TALIP tarafindan dogrulandi. Olculebilir sonucu:
 * cross-modul icin AYRI BIR SLICE GEREKMEDI.
 *
 * ⚠️ `FinanceModule` IMPORT EDILMIYOR (§7.2) ve bu, ROADMAP'in _"8 -> 3"_
 * bagimliliginin YANLIS OKUNMASINI onlemek icin acikca yaziliyor: o bir SIRA
 * bagimliligidir, bir GRAFIK KENARI DEGIL. Devralinan sey kod degil ALINMIS
 * KARARLARDIR (para tipi, para birimi bazinda ayrisma, kur cevriminin
 * yoklugu, takvim gunu). ⚠️ Kesilen bir fatura `finance.transactions`a satir
 * YAZMAZ: o tablo GERCEKLESMIS NAKIT HAREKETIDIR — fatura kesmek para almak
 * degildir.
 *
 * ⚠️ `InventoryModule` de IMPORT EDILMIYOR (§7.3): satir kalemi SERBEST
 * METINDIR. Aday degerlendirildi ve reddedildi; `inventory.public.ts` BU ISTE
 * YAZILMADI ve o gun geldiginde onu YAZAN modul STOK olacaktir (ADR-0039 §9.1,
 * UCUNCU kez teyit).
 *
 * Bagimlilik grafigi ALTI KENARDAN YEDIYE cikar ve HALA DAG'dir:
 *
 *     katman 0: CRM · INVENTORY · SUPPLIERS   (cikan kenari YOK)
 *     katman 1: Projeler  ──► CRM
 *               INVOICING ──► CRM              ← YENI
 *     katman 2: Finans ──► CRM, Projeler · Randevu ──► CRM · Belge ──► CRM, Projeler
 *
 * ⚠️ Dongu kontrolu (ROADMAP §3.7'nin kurali): yeni kenarin hedefi CRM'dir ve
 * CRM'in CIKAN HICBIR KENARI YOKTUR — hedefi bir KOK DUGUM olan kenar dongu
 * OLUSTURAMAZ.
 *
 * ============================================================================
 * ⚠️ TEK KATKICI — VE O KATKICI YAPISAL (§4)
 * ============================================================================
 * `POST /ask` artik teklif hattini da goruyor: `invoicing-pipeline`.
 * ANLAMSAL KATKICI YOKTUR ve bu, ADR-0040'in TAM AYNASIDIR:
 *
 *     Tedarikci  -> gorusme notu ANLATISALDIR, durumu yoktur -> TEK anlamsal
 *     Teklif/Fat -> belge DURUMDUR, anlatisi yoktur          -> TEK yapisal
 *
 * Sayilar:
 *
 *     anlamsal kaynak    8 -> 8   ⚠️ DEGISMIYOR
 *     YAPISAL kaynak     5 -> 6   ⚠️ ESIK ASILIYOR
 *     fan-out           13 -> 14
 *     global top-K          8     (degismedi)
 *     yapisal taban         3     (`ceil(K/3)` — degismedi)
 *
 * ⚠️ ADR-0036'NIN YENIDEN GOZDEN GECIRME ESIGI (tabanin IKI KATI = 6) BU
 * MODULLE ASILIYOR. ADR-0041 §4.3 bunu Product Owner'a acikca sordu ve onay
 * ALINDI: katkici EKLENIR, ADR-0036 BU ISTE DEGISTIRILMEZ, revizyon kapanis
 * denetimindeki CANLI DAGILIM OLCUMUNDEN SONRA ayri bir ADR (0042 adayi)
 * olarak yapilir.
 *
 * ⚠️ Pratik sonucu kayda geciyor: ALTI yapisal kaynak UC garanti yuva icin
 * siralanacak — yani YARISINDAN AZI her cevapta duyulacak. Olcum kapanis
 * denetiminin EN AGIR maddesidir ve ADR-0042'nin TEK VERI GIRDISIDIR.
 *
 * ============================================================================
 * ⚠️ EMBEDDING YOK, ORAN SINIRI YOK — VE BU FAZ 5'TE BIR ILK (§5)
 * ============================================================================
 * `EMBEDDING_PORT` SAGLANMIYOR, `RATE_LIMIT_REPOSITORY` SAGLANMIYOR,
 * `AiObservabilityModule` IMPORT EDILMIYOR. Sekiz modulun sekizi de vektor
 * tasiyordu; bu, tasimayan ILKI.
 *
 * Gerekce ADR-0034 §6.1'dir ve o karar Finans'in degil `POST /ask`in karariydi:
 * bir teklif kalemi ("M8 civata · 500 adet · 12,50") yuzlerce neredeyse OZDES
 * kisa vektor uretir, K=8'lik havuzu kirletir ve diger kaynaklarin en iyi
 * parcalarini disari iter.
 *
 * ⚠️ Filtre YINE DE uc AI hata tipini yakaliyor (§10) — CLAUDE.md'nin kalici
 * kurali MODUL MODUL YENIDEN TARTISILMAZ. Bu modul, kuralin ILK KEZ UCUNUN DE
 * TETIKLENEMEZ oldugu yerde sinandigi moduldur.
 *
 * ============================================================================
 * ⚠️ `StoragePort` KULLANILMIYOR — VE BU BIR HAYIRDIR (§6.3)
 * ============================================================================
 * `shared/storage.port.ts` bugun bu modulu ADIYLA ongoruyor (_"ilk kez IKINCI
 * bir modul StoragePort'u kullandiginda gercekten islevsel olacak —
 * Teklif/Fatura'nin uretecegi PDF"_). O cumle bir BEKLENTIYDI, karara
 * baglanmis bir sey degil.
 *
 * PDF her istekte YENIDEN URETILIR. Uretmeyi guvenli kilan sey §2'dir:
 * gonderilmis belgenin verisi DEGISMEZ. Degisebilen tek sey SABLONDUR ve bugun
 * sablon TEKTIR — ilk sablon degisikligi geldigi gun saklamaya gecilir ve o yol
 * TEK YONLUDUR.
 */
@Module({
  imports: [ContextModule, CrmModule],
  controllers: [InvoicingController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },

    { provide: INVOICING_REPOSITORY, useClass: DrizzleInvoicingRepository },

    /**
     * ⚠️ `PdfPort` ADR-0009'dan (StoragePort) bu yana `shared/`'a eklenen ILK
     * yeni port. Adapter `infrastructure/pdf/`de — saglayici degistirilebilir
     * bir DIS YETENEK, `shared/` + `infrastructure/` ikilisine aittir.
     */
    { provide: PDF_PORT, useClass: PdfKitPdfAdapter },

    {
      provide: InvoicingUseCases,
      inject: [
        INVOICING_REPOSITORY,
        CRM_COMPANY_DIRECTORY,
        CRM_CONTACT_DIRECTORY,
        PDF_PORT,
        TRANSACTION_MANAGER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      // NestJS useFactory imzasi `inject` dizisiyle birebir eslesmek zorunda;
      // use case'in KENDI imzasi tek parametrelidir (DEVELOPMENT_RULES 2.5).
      // eslint-disable-next-line max-params
      useFactory: (
        repository: InvoicingRepository,
        companyDirectory: CompanyDirectory,
        contactDirectory: ContactDirectory,
        pdfPort: PdfPort,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ): InvoicingUseCases =>
        new InvoicingUseCases({
          repository,
          companyDirectory,
          contactDirectory,
          pdfPort,
          transactionManager,
          idGenerator,
          clock,
          maxLines: config.invoicing.maxLines,
        }),
    },

    // --- Kurumsal hafizaya TEK KATKI (ADR-0041 §4) ---------------------------
    // ⚠️ YAPISAL: cevabi bir metinde degil `status` · `valid_until` ·
    // `converted_from_id` kolonlarinin ARITMETIGINDE yazar. Yaninda bir
    // ANLAMSAL katkici ARANMASIN — gerekce sinif yorumunda ve katkicinin kendi
    // dosyasinda.
    {
      provide: InvoicingPipelineContributor,
      inject: [INVOICING_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      useFactory: (
        repository: InvoicingRepository,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): InvoicingPipelineContributor =>
        new InvoicingPipelineContributor(
          repository,
          transactionManager,
          clock,
          config.invoicing.staleQuoteDays,
        ),
    },
  ],
})
export class InvoicingModule {
  constructor(
    @Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry,
    @Inject(RETRIEVAL_CONTRIBUTOR_REGISTRY) contributors: RetrievalContributorRegistry,
    pipelineContributor: InvoicingPipelineContributor,
  ) {
    // ADR-0025 §10.1: modul kendi permission'larini Authorization'a DEKLARE
    // eder; platform icerigi YORUMLAMAZ.
    //
    // ⚠️ Adlar NITELIKSIZ (`quote`, `invoice`) ve bu DOGRU: baska hicbir modulun
    // "teklif"i ya da "faturasi" olmayacaktir. ⚠️ ADR-0039'un ONGORDUGU cakisma
    // (`item` -> `stock_item`, "8. modul line item getirecek") TETIKLENMEDI —
    // satir kalemi bir IZIN KAYNAGI DEGILDIR. Gercek cakisma BASKA kelimedeydi:
    // `document:*` Belge modulunundur ve bu, tablo adini da belirledi
    // (`sales_documents`).
    permissions.register(INVOICING_PERMISSIONS);

    // Ayni desen: modul kendini kurumsal hafizaya KAYDEDER.
    //
    // ⚠️ TEK SATIR — ve bu satir ADR-0036'nin ESIGINI ASAN satirdir (§4.3).
    contributors.register(pipelineContributor);
  }
}
