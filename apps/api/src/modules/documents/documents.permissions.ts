import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Belge'nin DEKLARE ettigi permission katalogu (ADR-0025, ADR-0037 §10).
 *
 * ============================================================================
 * ⚠️ KATALOG GENISTIR — VE ASIL GEREKCE TERSTEN GELIR
 * ============================================================================
 * Karar gercekten tartisildi: belgeler ilk bakista MUHASEBE VERISINE yakin
 * durur (sozlesme, hassas icerik) ve Finans'in dar katalogu (`member`/`viewer`
 * hic gormez) savunulabilir gorunuyordu.
 *
 * Yuzeysel gerekce ADR-0034 §7'nin kendi olcutudur ve yine tutuyor: _"musteri
 * listesi ve gorev listesi PAYLASILAN is gercekleridir, sirketin nakit akisi
 * degildir."_ Bir sartname, bir teklif dosyasi, bir tedarikci sozlesmesi
 * PAYLASILAN is gercekleridir; ekipteki kimsenin projeye ait sozlesmeyi
 * acamamasi modulun amacini bozar.
 *
 * ⚠️ ASIL GEREKCE BASKA VE KAYDEDILMESI SART:
 *
 *     DAR KATALOG BU MODULDE YANLIS BIR GUVENLIK HISSI VERIRDI.
 *
 * Finans'ta hassasiyet SEMANIN TAMAMINA aitti: her satir nakit akisidir.
 * Belgede hassasiyet BELGE BASINADIR — bir teklif taslagi ile bir personel
 * sozlesmesi AYNI TABLODA yasar. Rol seviyesinde bir kapi bu ayrimi ifade
 * EDEMEZ: dar katalog secilseydi `member` ve `viewer` disari kalirdi ama
 * `admin` yine TUM belgeleri gorurdu — ve okuyan biri sorunun COZULDUGUNU
 * sanabilirdi.
 *
 * Dogru cozum BELGE BAZLI ERISIMDIR (ABAC/ACL) ve o bugun BACKLOG'tadir
 * (ROADMAP §1.1). Eksikligi GIZLEYEN degil SOYLEYEN taraf secildi.
 *
 * ============================================================================
 * ⚠️ BUNDAN DOGAN URUN KISITI (ADR-0037 §10)
 * ============================================================================
 * v1'de `document:read` tasiyan HERKES TUM belgeleri gorur ve indirir. Kisiye
 * ozel hassas belgeler (ozluk dosyasi, bordro, saglik verisi) bu module
 * KONULMAMALIDIR.
 *
 * Tetikleyici bellidir: **9. modul (IK)** geldiginde belge bazli erisim
 * ERTELENEMEZ hale gelir — ROADMAP §3.5'in IK icin yazdigi "maas ve saglik
 * verisi YOK" notuyla ayni siniftan bir kisit.
 *
 * ============================================================================
 * ⚠️ AYRI BIR `document:download` IZNI ACILMADI
 * ============================================================================
 * Metadata'yi gorup icerigi indiremeyen bir rol GERCEK BIR KORUMA SAGLAMAZ:
 * belge ADI icerigin cogunu zaten soyler ("2026 Kira Sozlesmesi.pdf"), ve
 * icerik `POST /ask` uzerinden ZATEN ayni izinle (`document:read`) cevaba
 * girer. Iki izin, tek bir sinirin IKI YERDE yasamasi olurdu — ve ikisi
 * ayrisirsa hangisinin gecerli oldugu belirsizlesirdi.
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Tek katkicinin kapisi `document:read` ve DORT ROL DE onu tasiyor. Yani
 * filtrenin tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`). Bu acikca kaydediliyor cunku aksi halde bir okuyucu, dar
 * katalogun artik bir konvansiyon oldugunu sanabilir — ya da tersini.
 *
 * ============================================================================
 * `document` NITELENMEMIS BIR ADDIR — ve bu bilincli
 * ============================================================================
 * `finance_category` nitelenmisti cunku bir baska modulun "kategori"si olmasi
 * COK MUHTEMELDI (Stok/Envanter). Bir baska modulun "belge"si olmasi ise
 * degildir: ROADMAP §3.5'in kalan yedi modulunun hicbiri dosya saklamiyor ve
 * saklayacak olan (Teklif/Fatura'nin uretecegi PDF) BU MODULUN depolama
 * yuzeyini kullanacak, kendi "belge" kavramini kurmayacak.
 */

export const DOCUMENT_READ = 'document:read';
export const DOCUMENT_WRITE = 'document:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Silme GERI ALINAMAZ ve bu modulde iki kat agirdir: DB satiri gider, R2'deki
 * NESNE de gider (ADR-0037 §5.3) ve DENETIM IZI YOKTUR (§1). Yani silinen bir
 * sozlesmenin var oldugu bilgisi HICBIR YERDE kalmaz — yedekten donmek disinda
 * geri getirme yolu yoktur.
 *
 * ⚠️ `member` SILEMEZ ama YAZABILIR. Ayrim gercektir: bir teklif dosyasi
 * yuklemek gunluk bir istir, imzali bir sozlesmeyi yok etmek degil.
 */
export const DOCUMENT_DELETE = 'document:delete';

export const DOCUMENTS_PERMISSIONS: readonly PermissionRule[] = [
  { permission: DOCUMENT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: DOCUMENT_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: DOCUMENT_DELETE, roles: ['owner', 'admin'] },
];
