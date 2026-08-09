import { type Clock } from '../../../shared/clock.port';

/**
 * `Clock` -> `YYYY-MM-DD` takvim gunu.
 *
 * ============================================================================
 * NEDEN `CURRENT_DATE` DEGIL
 * ============================================================================
 * Zaman DISARIDAN gelir (DEVELOPMENT_RULES 3.2). `CURRENT_DATE` sorguyu (a)
 * test edilemez kilar — "gecikmis gorev" testleri gercek takvime bagimli olurdu
 * — ve (b) veritabani sunucusunun saat dilimine baglar.
 *
 * ============================================================================
 * NEDEN UTC
 * ============================================================================
 * Tenant bazli saat dilimi KAPSAM DISIDIR (ADR-0033 §5, ADR-0031 §3'un ayni
 * ilkesi) ve `date` kolonlariyla tutarli tek secim budur: sunucunun yerel
 * dilimini kullanmak, ayni sorguyu iki farkli makinede FARKLI cevaplatirdi.
 *
 * ⚠️ Bunun gorunur bedeli var: UTC+3'te 02:00'de bakan bir kullanici icin
 * "bugun" hala onceki takvim gunudur, yani bir gorev birkac saat gec "gecikmis"
 * gorunur. Tenant saat dilimi geldigi gun BURASI tek degisim noktasidir.
 */
export function today(clock: Clock): string {
  return clock.now().toISOString().slice(0, 10);
}
