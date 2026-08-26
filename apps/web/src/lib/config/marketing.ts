import type { RoleState } from '@/lib/session/use-current-role';

/**
 * ⚠️ `campaign:delete` YALNIZCA owner/admin (ADR-0047 §5).
 *
 * Silme GERI ALINAMAZ ve bir kampanyanin gecmisini tumuyle kaldirir — ayrica
 * iptal edilen bir kampanyanin TEK yolu budur (`cancelled` diye bir durum
 * yoktur, §1.6).
 *
 * ⚠️ Sunucudaki katalog TEK DOGRULUK KAYNAGIDIR; bu fonksiyon yalnizca
 * ekranda dugmeyi gizler. Gizlemek bir yetki kontrolu DEGILDIR — guard zaten
 * 403 verir.
 */
export function canDeleteCampaign(role: RoleState): boolean {
  return role === 'owner' || role === 'admin';
}
