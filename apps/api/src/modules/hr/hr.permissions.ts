import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * IK modulunun DEKLARE ettigi permission katalogu (ADR-0025, ADR-0043 §7).
 *
 * ============================================================================
 * ⚠️ ILK KEZ: AYNI MODULDE HEM GENIS HEM DAR KAYNAK
 * ============================================================================
 * Finans'ta BUTUN MODUL dardi (ADR-0034 §7). Burada iki kaynak YAN YANA
 * duruyor ve farkli genisliklerde — mekanizmanin ilk kez KAYNAK GRANULUNDE
 * sinanmasi. ADR-0041 §9'un cumlesini dogrular: _"kaba hali bugun TEK
 * SATIRLIK bir degisikliktir, cunku ayri bir izindir."_
 *
 * ============================================================================
 * ⚠️ `employee:read` GENIS — dort rol de
 * ============================================================================
 * ADR-0034 §7'nin olcutu: _"musteri listesi ve gorev listesi PAYLASILAN is
 * gercekleridir, sirketin nakit akisi degildir."_
 *
 * BIR EKIP REHBERI DE OYLEDIR: calisanlarin birbirinin unvanini ve is
 * telefonunu bilmesi gunluk isin ta kendisidir. Dar olsaydi modul, onu
 * kullanmasi gereken herkese kapali olurdu.
 *
 * ============================================================================
 * ⚠️ `employee:write` DAR — ve bu, Teklif/Fatura'dan BILINCLI SAPMA
 * ============================================================================
 * ADR-0041 §9.2 `member`a yazma verdi cunku _"bir teklif yazmak satisin gunluk
 * isidir"_. Burada tam tersi gecerlidir:
 *
 *     BIR MESLEKTASIN KAYDINI DEGISTIRMEK KIMSENIN GUNLUK ISI DEGILDIR.
 *
 * Bir ekip rehberini OKUMAK paylasilan bir is gercegi, bir calisanin unvanini
 * ya da durumunu DEGISTIRMEK bir YONETIM islemidir.
 *
 * ============================================================================
 * ⚠️ `compensation:*` TAM DAR — `read` BILE owner/admin (§4.2 katman 2)
 * ============================================================================
 * Maas izolasyonunun IKINCI katmani. Birincisi ayri tablo (`employees`te maas
 * kolonu yok), ucuncusu katkici yoklugu (`POST /ask` havuzunda IK'nin hicbir
 * kaynagi yok).
 *
 * ⚠️ `compensation:delete` YOKTUR ve olmayacaktir: defter EKLEME-YALNIZDIR ve
 * degistirilemezligi §6.2'ye gore DENETIM IZININ TA KENDISIDIR. Var olmayan
 * bir izin, unutulmus bir izin degildir — kataloga yazilmadigi icin
 * `PermissionRegistry` onu HICBIR role vermez ve guard deny-by-default calisir
 * (ADR-0025). Bir gun bir `DELETE` ucu yazilsa bile 403 alir.
 *
 * ============================================================================
 * ⚠️ AD CAKISMASI — `member` ALINMIS, DORDUNCU GERCEK CAKISMA (§7.2)
 * ============================================================================
 * Bu kaynak icin en dogal kelime `member`di. ALINMIS: `member:read` Tenant
 * modulunundur ve "tenant uye listesi" demektir (owner + admin).
 *
 * Paylasmak SESSIZ BIR YETKI KARISIKLIGI uretirdi: `member:read` bugun
 * owner + admin, `employee:read` ise DORT ROL. Ayni izne baglansaydi ya ekip
 * rehberi herkese kapanir ya da PLATFORM UYELIK LISTESI HERKESE ACILIRDI —
 * ikincisi bir GUVENLIK GERILEMESIDIR.
 *
 * Cakisma dorduncu kez gercek oldu (ADR-0039 `item` ongoru · ADR-0040
 * `contact`/`interaction` · ADR-0041 `document`) ve dorduncu kez ayni sey
 * yapildi: CALISAN MODULUN KATALOGU DEGISTIRILMEDI.
 *
 * ⚠️ IKI ROSTER UCU KARISTIRILMAMALI (§2.6):
 *     `GET /v1/memberships`  -> "kimin sisteme ERISIMI var"  (`member:read`)
 *     `GET /v1/hr/employees` -> "sirkette kim CALISIYOR"      (`employee:read`)
 * Hicbiri digerinden turetilemez.
 *
 * ============================================================================
 * ⚠️ YAN ETKI: BU MODUL DE `POST /ask` IZIN FILTRESINI TETIKLEMEZ (§7.3)
 * ============================================================================
 * `compensation:read` DAR bir izindir, yani ilk bakista ADR-0031 §5.3'un
 * filtresini tetikleyecek gibi gorunur. TETIKLEMEZ — cunku filtre KATKICILAR
 * uzerinde calisir ve IK'nin HICBIR KATKICISI YOKTUR (§5).
 *
 * Filtrenin tek gercek tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`) — SEKIZINCI kez ayni kayit.
 */
export const EMPLOYEE_READ = 'employee:read';
export const EMPLOYEE_WRITE = 'employee:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Silme GERI ALINAMAZ ve YALNIZCA HATA DUZELTMESI icindir (§1.4): isten
 * ayrilan calisan silinmez, `ended` olarak isaretlenir. Ucret kaydi olan bir
 * calisan zaten silinemez (`ON DELETE RESTRICT`).
 */
export const EMPLOYEE_DELETE = 'employee:delete';

export const COMPENSATION_READ = 'compensation:read';
export const COMPENSATION_WRITE = 'compensation:write';

export const HR_PERMISSIONS: readonly PermissionRule[] = [
  { permission: EMPLOYEE_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: EMPLOYEE_WRITE, roles: ['owner', 'admin'] },
  { permission: EMPLOYEE_DELETE, roles: ['owner', 'admin'] },
  { permission: COMPENSATION_READ, roles: ['owner', 'admin'] },
  { permission: COMPENSATION_WRITE, roles: ['owner', 'admin'] },
];
