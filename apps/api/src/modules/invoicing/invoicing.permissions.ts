import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Teklif / Fatura'nin DEKLARE ettigi permission katalogu
 * (ADR-0025, ADR-0041 §9).
 *
 * ============================================================================
 * ⚠️ ADLAR NITELIKSIZ — VE BU DOGRU
 * ============================================================================
 * `quote` ve `invoice`: baska hicbir modulun "teklif"i ya da "faturasi"
 * olmayacaktir. Nitelemek (`sales_quote` gibi), tasimadigi bir belirsizligi
 * IMA EDERDI — ADR-0040'in `supplier` icin verdigi ayni ayrim.
 *
 * ============================================================================
 * ⚠️ ONGORULEN CAKISMA GELMEDI — GERCEK CAKISMA BASKA KELIMEDEYDI (§9.1)
 * ============================================================================
 * ADR-0039 §8.2 `item` -> `stock_item` nitelemesini TAM OLARAK BU MODUL icin
 * yapmisti:
 *
 *     "8. modul (Teklif/Fatura) LINE ITEM kavramini getirecek ve `item:read`
 *      o gun ya breaking change ile degisirdi ya da iki modul tek kelimeyi
 *      paylasirdi."
 *
 * Kavram geldi; cakisma GELMEDI — cunku SATIR KALEMI BIR KAYNAK DEGILDIR:
 * bagimsiz bir yasami (belgesiz satir anlamsizdir), bagimsiz bir ucu (kalemler
 * belgenin BUTUNU olarak yazilir) ve bagimsiz bir yetkisi ("belgeyi gorebilen
 * ama satirlarini goremeyen" bir rol) YOKTUR.
 *
 * ⚠️ ADR-0039'un nitelemesi yine de DOGRUYDU ve geri alinmaz: bir tedbirin
 * tetiklenmemesi, tedbirin gereksiz oldugunu KANITLAMAZ.
 *
 * ⚠️ GERCEK CAKISMA `document` KELIMESINDEYDI: `document:read` /
 * `document:write` / `document:delete` BELGE MODULU tarafindan ZATEN
 * kullaniliyor (ADR-0037). Bu, sema tarafindaki tablo adi kararini da belirledi
 * — tablo `sales_documents`tir, `documents` DEGIL. Cakisma UCUNCU kez gercek
 * oldu (ADR-0040'in `contact`/`interaction`i ikinciydi) ve uc kez de ayni sey
 * yapildi: CALISAN MODULUN KATALOGU DEGISTIRILMEDI.
 *
 * ============================================================================
 * ⚠️ TEK BIR `sales_document:*` KAYNAGI REDDEDILDI
 * ============================================================================
 * Iki belge turu AYNI TABLODA yasar (§1.1) ama AYNI YETKI DEGILDIR: bir satis
 * temsilcisinin teklif yazip fatura kesmemesi mesru bir istektir ve bedeli TEK
 * BIR STRINGDIR.
 *
 * ⚠️ Sema secimi izin secimini BELIRLEMEZ. Ucler ayridir (`/quotes`,
 * `/invoices`), yani guard STATIK kalir; `kind` kolonuna bakan (ABAC'a kayan)
 * bir izin kontrolu YOKTUR.
 *
 * ============================================================================
 * ⚠️ KATALOG GENISTIR (§9.2)
 * ============================================================================
 * ADR-0034 §7'nin olcutu: _"musteri listesi ve gorev listesi PAYLASILAN is
 * gercekleridir, sirketin nakit akisi degildir."_
 *
 * BIR TEKLIF YAZMAK SATISIN GUNLUK ISIDIR. Teklif hazirlayan, musteriyle
 * pazarlik eden ve faturayi kesen kisi TAM OLARAK `member` rolundeki kisidir.
 * Dar bir katalog, modulu onu KULLANMASI GEREKEN HERKESE kapatirdi.
 *
 * ⚠️ BIR ISTISNA KAYDA GECIRILIYOR: bir teklif FIYAT ve ISKONTO tasir, yani
 * ticari hassasiyeti `crm.opportunities.estimated_value`den YUKSEKTIR. Yine de
 * v1'de ALAN BAZLI GIZLILIK YOKTUR: alan bazli izin ABAC'tir ve backlog'tadir
 * (ROADMAP §1.1). Kaba hali ("teklifleri hic gormesin") bugun TEK SATIRLIK bir
 * degisikliktir, cunku `quote:read` ayri bir izindir.
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL DE `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Tek katkicinin kapisi `quote:read` ve DORT ROL DE onu tasiyor. Filtrenin tek
 * gercek tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`) — CRM, Projeler, Randevu, Belge, Stok ve Tedarikci'den
 * sonra YEDINCI kez ayni kayit.
 */

export const QUOTE_READ = 'quote:read';
export const QUOTE_WRITE = 'quote:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Silme GERI ALINAMAZ ve `sales_document_lines` `ON DELETE CASCADE` tasidigi
 * icin kalemleri de goturur. Ustelik SILINEBILEN TEK SEY TASLAKTIR (§2): bir
 * gonderilmis teklifin "silinmesi" `rejected` durumudur ve satir DURUR.
 *
 * "Bir teklif yazabilir" ile "bir taslagi ve tum kalemlerini silebilir" farkli
 * yetkilerdir; bedeli tek bir string.
 */
export const QUOTE_DELETE = 'quote:delete';

export const INVOICE_READ = 'invoice:read';
export const INVOICE_WRITE = 'invoice:write';
export const INVOICE_DELETE = 'invoice:delete';

export const INVOICING_PERMISSIONS: readonly PermissionRule[] = [
  { permission: QUOTE_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: QUOTE_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: QUOTE_DELETE, roles: ['owner', 'admin'] },
  { permission: INVOICE_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: INVOICE_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: INVOICE_DELETE, roles: ['owner', 'admin'] },
];
