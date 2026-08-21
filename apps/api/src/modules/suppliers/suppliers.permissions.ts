import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Tedarikci Yonetimi'nin DEKLARE ettigi permission katalogu
 * (ADR-0025, ADR-0040 §5).
 *
 * ============================================================================
 * ⚠️ ADLAR NITELENMIS — VE BU KEZ CAKISMA ONGORU DEGIL, GERCEK
 * ============================================================================
 * ADR-0039 `item` -> `stock_item` nitelemesini bir ONGORUYE dayandirmisti:
 * _"8. modul (Teklif/Fatura) line item kavramini getirecek."_ Yani o gun
 * cakisan bir sey YOKTU, gelecekte olmasi COK MUHTEMELDI.
 *
 * Burada ongoruye gerek yok:
 *
 *     `contact:read` ve `interaction:read` CRM TARAFINDAN ZATEN KULLANILIYOR
 *     (ADR-0031 §6).
 *
 * Nitelemeseydik iki secenekten biri olurdu ve IKISI DE KABUL EDILEMEZ:
 *
 *   (a) CRM ILE AYNI IZNI PAYLASMAK — ⚠️ SESSIZ BIR YETKI GENISLEMESI: bir
 *       kullaniciya MUSTERI kisilerini gorme yetkisi verildiginde TEDARIKCI
 *       kisilerini de gormus olurdu. Iki farkli is gercegi tek bir stringle
 *       yonetilemez ve ayrisma gunu geldiginde geri donus BREAKING CHANGE'dir.
 *   (b) CRM'IN IZNINI YENIDEN ADLANDIRMAK — Mutlak Kural 1 ihlali ve
 *       yayinlanmis bir izin adini degistirmek, onu tasiyan her rol tanimini
 *       ve her testi bozar.
 *
 * ⚠️ Nitelenen sey YALNIZCA IZIN KAYNAGIDIR. Sema `suppliers`, rota
 * `/api/v1/suppliers/...`, `data-module="suppliers"` — ucu de nitelenmemis
 * kalir cunku onlarda cakisma YOKTUR.
 *
 * ⚠️ `supplier` NITELIKSIZDIR ve dogrudur: baska hicbir modulun "tedarikci"si
 * olmayacaktir. Nitelemek (`purchase_supplier` gibi), tasimadigi bir
 * belirsizligi IMA EDERDI.
 *
 * ============================================================================
 * ⚠️ KATALOG GENISTIR (ADR-0040 §5.2)
 * ============================================================================
 * ADR-0034 §7'nin olcutu aynen tutuyor: _"musteri listesi ve gorev listesi
 * PAYLASILAN is gercekleridir, sirketin nakit akisi degildir."_
 *
 * KIMDEN MAL ALINDIGI PAYLASILAN BIR OPERASYONEL GERCEKTIR. Malzeme siparisi
 * veren, teslimati karsilayan, bir kaleme ihtiyac duyunca kimi arayacagini
 * bilmesi gereken kisi TAM OLARAK `member` rolundeki kisidir. Dar bir katalog
 * modulu, onu KULLANMASI GEREKEN HERKESE kapatirdi.
 *
 * ⚠️ BIR ISTISNA KAYDA GECIRILIYOR: `payment_terms` ticari hassasiyet
 * TASIYABILIR ("bize 90 gun veriyor"). Yine de v1'de ALAN BAZLI GIZLILIK
 * YOKTUR ve gerekce ADR-0031 §6'nin `estimated_value` icin yazdigi ile aynidir:
 * alan bazli izin ABAC'tir ve backlog'tadir (ROADMAP §1.1). Kaba hali
 * ("tedarikci hattini hic gormesin") bugun TEK SATIRLIK bir degisiklikle ifade
 * edilebilir, cunku `supplier:read` ayri bir izindir.
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL DE `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Tek katkicinin kapisi `supplier_interaction:read` ve DORT ROL DE onu tasiyor.
 * Filtrenin tek gercek tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`) — CRM, Projeler, Randevu, Belge ve Stok'tan sonra ALTINCI
 * kez ayni kayit. Acikca yaziliyor cunku aksi halde bir okuyucu, dar katalogun
 * artik bir konvansiyon oldugunu sanabilir — ya da tersini.
 */

export const SUPPLIER_READ = 'supplier:read';
export const SUPPLIER_WRITE = 'supplier:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Silme GERI ALINAMAZ ve AI HAFIZASINDAN DA SILER: `ON DELETE CASCADE` zinciri
 * kisileri ve gorusmeleri (vektorleriyle birlikte) goturur (§1.3). "Bir gorusme
 * kaydedebilir" ile "bir tedarikciyi ve tum gecmisini silebilir" farkli
 * yetkilerdir; bedeli tek bir string.
 */
export const SUPPLIER_DELETE = 'supplier:delete';

export const SUPPLIER_CONTACT_READ = 'supplier_contact:read';
export const SUPPLIER_CONTACT_WRITE = 'supplier_contact:write';
export const SUPPLIER_CONTACT_DELETE = 'supplier_contact:delete';

export const SUPPLIER_INTERACTION_READ = 'supplier_interaction:read';

/**
 * ⚠️ `create`, `write` DEGIL — ve bu ADR-0031 §6'nin adlandirmasidir.
 *
 * Gorusmeler EKLEME-YALNIZ bir gunluktur (`note:create` / `interaction:create`
 * ile ayni sinif): guncelleme ve silme v1'de YOKTUR, dolayisiyla VAR OLMAYAN
 * BIR FIILI deklare etmek yanlis olurdu.
 *
 * ⚠️ `supplier_interaction:write` ve `supplier_interaction:delete` YOKTUR.
 * Bir izni ACMAMAK, sonradan KAPATMAKTAN kolaydir (ADR-0039 §8.2).
 *
 * ⚠️ Bu, ADR-0039'un DEGISTIRILEMEZ DEFTERIYLE KARISTIRILMAMALIDIR: orada
 * koruma UC KATMANLIYDI (izin yok + FK `RESTRICT` + entity metodu yok) cunku
 * BUGUNKU MIKTAR o defterden turetiliyordu. Burada turetilen hicbir sayi yok;
 * `update` metodunun ve bu iznin OLMAMASI yeter.
 */
export const SUPPLIER_INTERACTION_CREATE = 'supplier_interaction:create';

export const SUPPLIERS_PERMISSIONS: readonly PermissionRule[] = [
  { permission: SUPPLIER_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: SUPPLIER_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: SUPPLIER_DELETE, roles: ['owner', 'admin'] },
  { permission: SUPPLIER_CONTACT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: SUPPLIER_CONTACT_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: SUPPLIER_CONTACT_DELETE, roles: ['owner', 'admin'] },
  { permission: SUPPLIER_INTERACTION_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: SUPPLIER_INTERACTION_CREATE, roles: ['owner', 'admin', 'member'] },
];
