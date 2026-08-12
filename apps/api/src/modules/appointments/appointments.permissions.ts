import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Randevu'nun DEKLARE ettigi permission katalogu (ADR-0025, ADR-0035 §9).
 *
 * ============================================================================
 * ⚠️ KATALOG GENISTIR — FINANS'IN DAR KATALOGUNA DONMUYOR
 * ============================================================================
 * Bir onceki modul projedeki ILK dar katalogu getirmisti: `member` ve `viewer`
 * finansi HIC gormuyor. Randevu o cizgiye DONMEZ ve bu bir tutarsizlik degil,
 * ADR-0034 §7'nin KENDI GEREKCESININ dogru uygulanmasidir:
 *
 *   "musteri listesi ve gorev listesi PAYLASILAN is gercekleridir, sirketin
 *    nakit akisi degildir."
 *
 * BIR RANDEVU TAKVIMI PAYLASILAN BIR IS GERCEGIDIR. Ekipteki kimsenin "bugun
 * kim geliyor"u gorememesi modulun amacini bozar. Cizgi CRM ve Projeler'inkiyle
 * AYNI yere dusuyor.
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Slice 4'un iki katkicisinin da kapisi `appointment:read` olacak ve dort rol
 * de onu tasiyor. Yani filtrenin tetikcisi HALA yalnizca Finans'tir
 * (`cashflow:read` / `commentary:read`). Bu acikca kaydediliyor cunku aksi
 * halde bir okuyucu, dar katalogun artik bir konvansiyon oldugunu sanabilir.
 *
 * ============================================================================
 * `appointment` NITELENMEMIS BIR ADDIR — ve bu bilincli
 * ============================================================================
 * `finance_category` nitelenmisti cunku bir baska modulun "kategori"si olmasi
 * COK MUHTEMELDI (Stok/Envanter). Bir baska modulun "randevu"su olmasi ise
 * degildir — ROADMAP §3.5'in kalan sekiz modulunun hicbiri takvim tabanli bir
 * kayit tutmuyor. Gereksiz nitelemek de bir maliyettir.
 *
 * ============================================================================
 * KATALOG UCLA BIRLIKTE BUYUR — AMA BU MODULDE BUYUMEYECEK
 * ============================================================================
 * Onceki uc modulde katalog slice slice buyudu (var olmayan bir fiili deklare
 * etmek yanlis olurdu). Burada uc permission da BU SLICE'TA geliyor cunku dort
 * ucun dordu de bu slice'ta aciliyor. Slice 3'un `reindex` ucu YENI BIR IZIN
 * ISTEMEZ — `appointment:write` tasir, cunku yaptigi is var olan kayitlarin
 * arama indeksini ONARMAKTIR, yeni bir kaynak turu degil.
 */

export const APPOINTMENT_READ = 'appointment:read';
export const APPOINTMENT_WRITE = 'appointment:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Silme GERI ALINAMAZ ve bu modulde DENETIM IZI YOKTUR (ADR-0035 §5): silinen
 * bir randevunun var oldugu bilgisi hicbir yerde kalmaz. `transaction:delete`
 * ile ayni gerekce.
 *
 * ⚠️ `member` SILEMEZ ama YAZABILIR. Ayrim gercektir: randevu kaydirmak gunluk
 * bir istir, bir muvekkil kaydini yok etmek degil.
 */
export const APPOINTMENT_DELETE = 'appointment:delete';

export const APPOINTMENTS_PERMISSIONS: readonly PermissionRule[] = [
  { permission: APPOINTMENT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: APPOINTMENT_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: APPOINTMENT_DELETE, roles: ['owner', 'admin'] },
];
