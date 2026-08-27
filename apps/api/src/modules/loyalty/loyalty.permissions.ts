import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Sadakat permission katalogu (ADR-0025'in `resource:action` modeli, ONUCUNCU
 * kez; ADR-0051 §5).
 *
 * ============================================================================
 * ⚠️ `create` VAR, `write` YOK — VE BU, §2.2'NIN IZIN ADINDAKI GORUNUMUDUR
 * ============================================================================
 * ADR-0047 §5 ayrimi bir KURALA baglamisti:
 *
 *   `create` -> ⚠️ YALNIZCA olustur  (`feedback:create`, `interaction:create`,
 *                                     `note:create`, `commentary:create`)
 *   `write`  -> olustur VE guncelle  (`employee:write`, `supplier:write`,
 *                                     `stock_item:write`, `campaign:write`)
 *
 * ⚠️ Bu modulde GUNCELLENEBILIR HICBIR SEY YOKTUR: hesabin tek is alani
 * (`crm_contact_id`) degistirilemez (onu degistirmek BIR BAKIYEYI BASKA BIR
 * INSANA DEVRETMEKTIR) ve defter ekleme-yalnizdir. -> `create`.
 *
 * ⚠️ BIR TUTARSIZLIK GORULDU VE BILEREK DUZELTILMEDI: `stock_movement:write`
 * de ekleme-yalniz bir defterin iznidir ve kurala gore `create` olmaliydi —
 * ama o ad ADR-0039'da, kural ADR-0047'de yazildi. Degistirmek bir BREAKING
 * CHANGE'dir ve bu isin kapsaminda DEGILDIR (Mutlak Kural 1/2). ⚠️ Kayda
 * geciyor cunku kurali okuyup `stock_movement:write`i goren biri kuralin
 * GECERSIZ oldugunu sanabilir — gecersiz degil, O AD KURALDAN ESKIDIR.
 *
 * ============================================================================
 * ⚠️ `loyalty_point:delete` DIYE BIR IZIN YOKTUR — degistirilemezligin
 * IKINCI KATMANI (ADR-0051 §2.3)
 * ============================================================================
 * `stock_movement:delete`in ayni karari. Bir satiri silmek BUGUNKU BAKIYEYI
 * SESSIZCE YENIDEN YAZAR. ⚠️ Ama `loyalty_account:delete` VARDIR ve bu bir
 * celiski degildir (§2.1): hesabi silmek bakiyeyi yeniden yazmaz, YOK EDER —
 * ve silme yolunun VAR OLMASI KVKK m.7/m.11 geregi bir YUKUMLULUKTUR.
 *
 * ============================================================================
 * ⚠️ KATALOG GENIS (ADR-0034 §7'nin olcutu, ONIKINCI kez)
 * ============================================================================
 * _"Sadakat PAYLASILAN bir is gercegidir."_ Kasadaki bir `member`, musterinin
 * kac puani oldugunu BILMEK VE HARCATMAK ZORUNDADIR; dar bir katalog modulu
 * KULLANMASI GEREKEN HERKESE kapatirdi.
 *
 * ⚠️ Finans'in ve IK'nin DAR kataloglariyla ayni sinifta DEGILDIR: bir puan
 * bakiyesi ucret degildir, kisisel gecmis degildir ve maliyet bilgisi tasimaz
 * — ⚠️ puanin PARA KARSILIGI bu modulde YOKTUR (§10).
 *
 * ⚠️ `delete` DAR: bir hesabi silmek defteri de goturur ve GERI ALINAMAZ —
 * _"gunluk is degil, bir yonetim islemidir"_ (ADR-0043 · ADR-0045 ·
 * ADR-0047'nin ayni olcutu, DORDUNCU kez).
 *
 * ============================================================================
 * ⚠️ ADLAR NITELENMIS — VE GEREKCE ONGORUDUR (§5.3)
 * ============================================================================
 * Katalog tarandi: `loyalty`, `loyalty_account`, `loyalty_point`, `point`,
 * `reward`, `tier` — HICBIRIYLE cakisma yok. Yine de nitelenmis adlar secildi,
 * ADR-0039'un `item` -> `stock_item` karariyla ayni sebeple:
 *
 *   ⚠️ Ciplak `account` -> **Faz 6 FATURALAMA'dir** (ROADMAP §4) ve "hesap"
 *      orada KACINILMAZ bir kavramdir (abonelik/faturalama hesabi).
 *   ⚠️ Ciplak `point`   -> genel bir kelime; ileride bir "puanlama" (skor)
 *      kavramiyla karisirdi.
 *
 * ⚠️ ADR-0045 §5 `loyalty_point` adini ISMEN ONGORMUSTU ve ongoru TUTTU.
 */
export const LOYALTY_ACCOUNT_READ = 'loyalty_account:read';
export const LOYALTY_ACCOUNT_CREATE = 'loyalty_account:create';
export const LOYALTY_ACCOUNT_DELETE = 'loyalty_account:delete';

export const LOYALTY_POINT_READ = 'loyalty_point:read';
export const LOYALTY_POINT_CREATE = 'loyalty_point:create';

export const LOYALTY_PERMISSIONS: readonly PermissionRule[] = [
  { permission: LOYALTY_ACCOUNT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: LOYALTY_ACCOUNT_CREATE, roles: ['owner', 'admin', 'member'] },
  { permission: LOYALTY_ACCOUNT_DELETE, roles: ['owner', 'admin'] },

  { permission: LOYALTY_POINT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: LOYALTY_POINT_CREATE, roles: ['owner', 'admin', 'member'] },
];
