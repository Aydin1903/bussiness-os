import { type PermissionRule } from '../authz/authz.public';

/**
 * Audit'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0043 §7.1).
 *
 * ============================================================================
 * ⚠️ YALNIZCA `read` — `write` VE `delete` YOKTUR
 * ============================================================================
 * Bu, "henuz yazilmadi" degil, tablonun DEGISMEZ olmasinin izin tarafindaki
 * karsiligidir (MT §12.4: _"`UPDATE`/`DELETE` yetkisi hicbir role verilmez"_).
 *
 * `write` de yoktur ve olmayacaktir: denetim kaydini bir KULLANICI yazmaz,
 * bir DEGISIKLIK yazar. Yazma yolu HTTP degil, `shared/audit.port.ts`tir ve
 * cagiran modulun kendi transaction'i icindedir.
 *
 * ⚠️ Var olmayan bir izin, unutulmus bir izin degildir: kataloga
 * yazilmadigi icin `PermissionRegistry` onu HICBIR role vermez ve
 * `rolesFor(...)` `undefined` doner — guard deny-by-default calisir
 * (ADR-0025). Yani bir gun `POST /audit` yazilsa bile 403 alir.
 *
 * ============================================================================
 * ⚠️ DAR KATALOG — owner + admin (Finans'tan sonra IKINCI dar kaynak)
 * ============================================================================
 * ADR-0034 §7'nin olcutu: _"musteri listesi ve gorev listesi PAYLASILAN is
 * gercekleridir, sirketin nakit akisi degildir."_
 *
 * Bir denetim kaydi PAYLASILAN bir is gercegi DEGILDIR: _"kim neyi ne zaman
 * degistirdi"_ bir YONETIM ve HESAP VEREBILIRLIK sorusudur. Genis olsaydi her
 * calisan, meslektaslarinin hangi kayitlara dokundugunu izleyebilirdi — ve bu,
 * denetim izinin AMACININ tersidir.
 *
 * ⚠️ `member:read` (tenant uye listesi, `modules/tenant`) ile AYNI iki rol ve
 * bu tesaduf degil: ikisi de _"kim ne yapiyor"_ sinifindan yonetim
 * bilgisidir.
 *
 * ⚠️ Ad cakismasi kontrolu (BESINCI kez): `audit` kelimesi hicbir modul
 * tarafindan alinmamis. Nitelemeye (`platform_audit` gibi) gerek yoktur —
 * ADR-0041'in `quote`/`invoice` icin verdigi ayni ayrim: baska hicbir modulun
 * "denetim kaydi" olmayacaktir.
 */
export const AUDIT_READ = 'audit:read';

export const AUDIT_PERMISSIONS: readonly PermissionRule[] = [
  { permission: AUDIT_READ, roles: ['owner', 'admin'] },
];
