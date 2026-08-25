import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Musteri Geri Bildirimi'nin DEKLARE ettigi permission katalogu
 * (ADR-0025, ADR-0045 §5).
 *
 * ============================================================================
 * ⚠️ `feedback:write` DIYE BIR IZIN YOKTUR — VE BU, §2'NIN IZIN ADINDA
 * GORUNUR HALIDIR
 * ============================================================================
 * Projede iki ad ayri anlam tasiyor ve bu ayrim bugune kadar SESSIZCE
 * tutulmustu; burada ACIKCA kullaniliyor:
 *
 *     `write`  -> olustur VE guncelle   (`employee:write`, `supplier:write`,
 *                                        `stock_item:write`)
 *     `create` -> ⚠️ YALNIZCA olustur   (`interaction:create`,
 *                                        `commentary:create`,
 *                                        `progress_note:create`,
 *                                        `supplier_interaction:create`)
 *
 * `feedback:create`, ekleme-yalniz olan BESINCI kaynaktir.
 *
 * ⚠️ ADR-0043 §7.1'in cumlesi burada da gecerlidir: _"var olmayan bir izin,
 * unutulmus bir izin degildir."_ Katalogda yazmadigi icin guard onu HICBIR
 * ROLE vermez ve bir `PATCH` ucu yazilsa bile 403 alir. Bu, degistirilemezligin
 * BIRINCI katmanidir (ikincisi entity/repository, ucuncusu migration `0037`in
 * kolon bazli yetkisi).
 *
 * ============================================================================
 * ⚠️ AMA `feedback:delete` VARDIR — VE GEREKCESI KVKK'DIR (§2.2)
 * ============================================================================
 * `supplier_interaction`da `delete` YOKTU ve olmamasi dogruydu. Burada VAR:
 * bir yorum KISISEL VERI ICEREBILIR (ad, telefon, sikayet detayi) ve veri
 * sahibinin SILME TALEBI HAKKI vardir (KVKK m.7 / m.11).
 *
 * ⚠️ Yani silme bir KOLAYLIK degil bir YUKUMLULUKTUR — ve bu yuzden DAR bir
 * izindir, ayri bir izindir, `member`a VERILMEZ.
 *
 * ============================================================================
 * ⚠️ KATALOG GENIS (ADR-0034 §7'nin olcutu, ONUNCU kez)
 * ============================================================================
 * _"Musteri listesi ve gorev listesi PAYLASILAN is gercekleridir, sirketin
 * nakit akisi degildir."_ MUSTERI MEMNUNIYETI DE PAYLASILAN BIR IS GERCEGIDIR:
 * bir musterinin sikayetini gormesi gereken kisi tam olarak `member` rolundeki
 * kisidir — sahadaki, telefondaki, tezgahtaki kisi. Dar bir katalog modulu,
 * onu KULLANMASI GEREKEN HERKESE kapatirdi.
 *
 * ⚠️ BIR ISTISNA KAYDA GECIRILIYOR: bir yorum bir CALISANI ADIYLA elestirebilir
 * ("X bey cok kaba davrandi"). Yine de v1'de ALAN/KAYIT BAZLI GIZLILIK YOKTUR
 * ve gerekce ADR-0031 §6'nin `estimated_value` icin, ADR-0040 §5.2'nin
 * `payment_terms` icin yazdigiyla aynidir: bu ABAC'tir ve backlog'tadir
 * (ROADMAP §1.1).
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL DE `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Tek katkicinin kapisi `feedback:read` ve DORT ROL DE onu tasiyor. Filtrenin
 * tek gercek tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`) — CRM, Projeler, Randevu, Belge, Stok, Tedarikci,
 * Teklif/Fatura ve IK'dan sonra DOKUZUNCU kez ayni kayit.
 *
 * ============================================================================
 * ⚠️ AD CAKISMASI YOK — VE BU KEZ ONGORU DE YOK
 * ============================================================================
 * `feedback` NITELIKSIZDIR ve dogrudur: baska hicbir modulun "geri bildirim"i
 * olmayacaktir. Katalog tarandi — `feedback`, `rating`, `response` ve `survey`
 * DORDUYLE DE cakisma yok.
 *
 * ADR-0039'un `item` -> `stock_item` ONGORUSU burada GEREKMIYOR: 11. modulun
 * (Kampanya) kavrami `campaign`, 12. modulunki (Sadakat) `loyalty_point`tir.
 * Nitelemek (`customer_feedback` gibi), tasimadigi bir belirsizligi IMA EDERDI.
 */

export const FEEDBACK_READ = 'feedback:read';

/**
 * ⚠️ `create`, `write` DEGIL — ADR-0031 §6'nin adlandirmasi, besinci kez.
 *
 * Kayit GUNCELLENMEZ (§2): bir geri bildirim BIZIM SOZUMUZ DEGIL, bir ucuncu
 * kisinin beyanidir. VAR OLMAYAN BIR FIILI deklare etmek yanlis olurdu.
 */
export const FEEDBACK_CREATE = 'feedback:create';

/**
 * ⚠️ `create`TAN AYRI DURMAK ZORUNDA — iki ayri gerekceyle.
 *
 *   1. Silme GERI ALINAMAZ ve AI HAFIZASINDAN DA SILER: vektor satirin kendi
 *      kolonunda yasar (§1.2), yani silinen kayit `POST /ask` havuzundan da
 *      duser.
 *   2. ⚠️ Silme bir TURETILMIS RAKAMI degistirir (ortalama, dusuk puan sayisi)
 *      ve bir KVKK islemidir — yani bir YONETIM islemidir, gunluk is degil.
 *      IK'nin `employee:write` gerekcesiyle ayni sinif: _"bir meslektasin
 *      unvanini degistirmek kimsenin gunluk isi degildir."_
 */
export const FEEDBACK_DELETE = 'feedback:delete';

export const FEEDBACK_PERMISSIONS: readonly PermissionRule[] = [
  { permission: FEEDBACK_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: FEEDBACK_CREATE, roles: ['owner', 'admin', 'member'] },
  { permission: FEEDBACK_DELETE, roles: ['owner', 'admin'] },
];
