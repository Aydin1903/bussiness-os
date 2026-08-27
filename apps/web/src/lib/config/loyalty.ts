import type { RoleState } from '@/lib/session/use-current-role';

/**
 * ⚠️ `loyalty_account:delete` YALNIZCA owner/admin (ADR-0051 §5.2).
 *
 * Bir hesabi silmek DEFTERI DE goturur ve GERI ALINAMAZ — _"gunluk is degil,
 * bir yonetim islemidir"_ (ADR-0043 · ADR-0045 · ADR-0047'nin ayni olcutu,
 * DORDUNCU kez).
 *
 * ⚠️ Sunucudaki katalog TEK DOGRULUK KAYNAGIDIR; bu fonksiyon yalnizca
 * ekranda dugmeyi gizler. Gizlemek bir yetki kontrolu DEGILDIR — guard zaten
 * 403 verir.
 */
export function canDeleteLoyaltyAccount(role: RoleState): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * ⚠️ PUAN BICIMLENDIRME — VE BU, PARA BICIMLENDIRMESI DEGILDIR (§9.1).
 *
 * ============================================================================
 * ⚠️ BINLIK AYRACI VAR — VE FINANS'TA YOKTU
 * ============================================================================
 * ADR-0034 parada binlik ayracini REDDETMISTI ve gerekcesi netti: para bu
 * projede hicbir noktada `number` OLMUYOR (sunucunun kanonik dizesi oldugu
 * gibi yazilir); bicimlendirmek onu `Number`a cevirmek demekti.
 *
 * ⚠️ Puan ise TANIM GEREGI bir `integer`dir (ADR-0051 §1.5 — puan SAYILIR,
 * olculmez) ve kesir tasimaz, yani `toLocaleString` bir DONUSUM riski
 * yaratmaz. "12400" ile "12.400" arasindaki fark bir kahraman rakamda
 * okunabilirligin ta kendisidir.
 *
 * ⚠️ AMA PARA GIBI GORUNMEZ: bir para birimi simgesi ya da kod EKLENMEZ.
 * Puanin TL karsiligi bu modulde modellenmez (§10) ve bir simge, olmayan bir
 * donusumu IMA ederdi.
 */
export function formatPoints(points: number): string {
  return points.toLocaleString('tr-TR');
}
