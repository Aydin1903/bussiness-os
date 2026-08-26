import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Kampanya permission katalogu (ADR-0025'in `resource:action` modeli,
 * ONIKINCI kez; ADR-0047 §5).
 *
 * ============================================================================
 * ⚠️ `write` VAR — `create` DEGIL. VE BU, §2'NIN IZIN ADINDAKI GORUNUMUDUR
 * ============================================================================
 * Projede iki ad AYRI ANLAM tasir:
 *
 *   `create` -> ⚠️ YALNIZCA olustur  (`feedback:create`, `interaction:create`,
 *                                     `commentary:create`, `note:create`)
 *   `write`  -> olustur VE guncelle  (`employee:write`, `supplier:write`,
 *                                     `stock_item:write`, `campaign:write`)
 *
 * ⚠️ ADR-0045 `create` sectigi icin bir `PATCH` ucu yazilsa bile guard 403
 * verirdi. Burada `write` seciliyor cunku guncelleme GERCEKTEN VAR (§2).
 * Yani izin adi, degistirilebilirlik kararinin ILK KATMANIDIR — bir uslup
 * tercihi degil.
 *
 * ============================================================================
 * ⚠️ KATALOG GENIS (ADR-0034 §7'nin olcutu, ONBIRINCI kez)
 * ============================================================================
 * _"Kampanya PAYLASILAN bir is gercegidir."_ Satista calisan bir `member`,
 * hangi kampanyanin yayinda oldugunu bilmek ZORUNDADIR; dar bir katalog
 * modulu onu KULLANMASI GEREKEN HERKESE kapatirdi.
 *
 * ⚠️ Finans'in DAR kataloguyla ayni sinifta DEGILDIR: kampanya kaydinda
 * ucret, maliyet ya da kisisel veri YOKTUR (butce kapsam disi — §10).
 *
 * ⚠️ `delete` DAR: silme GERI ALINAMAZ ve bir kampanyanin gecmisini tumuyle
 * kaldirir. ADR-0045 ve ADR-0043'un ayni olcutu — _"gunluk is degil, bir
 * yonetim islemidir."_
 *
 * ============================================================================
 * ⚠️ AD CAKISMASI YOK — ve ONCEDEN TARANDI
 * ============================================================================
 * `campaign`, `marketing`, `channel` — ucuyle de cakisma yok. ADR-0045 §5
 * bunu ISMEN ongormustu (_"11. ve 12. modullerin kavramlari `campaign` ve
 * `loyalty_point`tir"_), yani ADR-0039'un `stock_item` nitelemesi burada
 * GEREKMIYOR.
 */
export const CAMPAIGN_READ = 'campaign:read';
export const CAMPAIGN_WRITE = 'campaign:write';
export const CAMPAIGN_DELETE = 'campaign:delete';

export const MARKETING_PERMISSIONS: readonly PermissionRule[] = [
  { permission: CAMPAIGN_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: CAMPAIGN_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: CAMPAIGN_DELETE, roles: ['owner', 'admin'] },
];
